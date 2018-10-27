const pg = require('../db/pg.js')
const SQL = require('sql-template-strings')
const bodyParser = require('body-parser')
const R = require('ramda')
const BPromise = require('bluebird')
const passport = require('passport')

const router = require('express').Router()
const { queryUserTracks, addArtistOnLabelToIgnore, removeIgnoredTracksFromUser } = require('./db.js')

router.get('/logout', function(req, res) {
  req.logout()
})

const ensureAuthenticated = (req, res, next) => {
  req.isAuthenticated() ? next() : res.status(401).end()
}

router.use(bodyParser.json())
router.post('/login', passport.authenticate('local'), (req, res) => res.status(204).end())

router.get('/tracks', ensureAuthenticated, ({ user: { username } }, res, next) =>
  queryUserTracks(username)
    .tap(userTracks => res.json(userTracks))
    .catch(next)
)

router.get('/tracks.pls', ensureAuthenticated, ({ user: { username } }, res, next) =>
  queryUserTracks(username)
    .then(userTracks => {
      return (
        '[playlist]\n\n' +
        userTracks
          .map(R.path(['previews', 0, 'url']))
          .map((row, i) => `File${i + 1}=${row}\nLength${i + 1}=5`)
          .join('\n\n')
          .concat(`\n\nNumberOfEntries=${userTracks.length}\nVersion=2\n`)
      )
    })
    .tap(m3u => res.send(m3u))
    .catch(next)
)

router.post('/tracks/:id', ({ params: { id }, body: { heard } }, res, next) => {
  // language=PostgreSQL
  pg.queryRowsAsync(
    SQL`
UPDATE user__track
SET user__track_heard = ${heard ? 'now()' : null}
WHERE track_id = ${id}
`
  )
    .tap(() => res.send())
    .catch(next)
})

// TODO: add genre to database?
router.post('/ignore/genre', ({ user: { username }, body: { artistId, storeId, genre } }, res, next) => {})

router.post('/ignore/label', ({ user: { username }, body }, res, next) =>
  BPromise.using(pg.getTransaction(), tx =>
    BPromise.each(body, ({ artistId, labelId }) =>
      addArtistOnLabelToIgnore(artistId, labelId, username).tap(() => removeIgnoredTracksFromUser(tx, username))
    )
  )
    .tap(() => res.send())
    .catch(next)

)

module.exports = router
