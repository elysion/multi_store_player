const express = require('express');
const passport = require('passport');
const Strategy = require('passport-local').Strategy
const session = require('express-session')
const cors = require('cors')
const pgSession = require('connect-pg-simple')(session)
const pg = require('./db/pg.js')
const SQL = require('sql-template-strings')
const bodyParser = require('body-parser')
const R = require('ramda')
const os = require('os')
const m3u = require('m3u')
const BPromise = require('bluebird')

const account = require('./db/account.js')
const removeIgnoredTracksFromUser = require('./remove-ignored-tracks-from-user.js')

const compression = require('compression')

const getIPv4AddressOfInterface = interfaceName =>
  os.networkInterfaces()[interfaceName].find(R.propEq('family', 'IPv4')).address

const currentIp = getIPv4AddressOfInterface('en0')
console.log('Current IP: ', currentIp)

const checkCredentials = (username, password, done) =>
  account.authenticate(username, password)
    .then(success => success ? { username: username } : false)
    .asCallback(done)

passport.use(new Strategy(checkCredentials));

passport.serializeUser((userToSerialize, done) => done(null, userToSerialize.username))
passport.deserializeUser((username, done) => account.findByUsername(username).nodeify(done))

const app = express()
app.use(compression())
app.use(session({
  store: new pgSession({
    conString: "postgres://localhost/multi-store-player",
    tableName: 'meta_session'   // Use another table-name than the default "session" one
  }),
  secret: "top secret",
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(cors({ credentials: true, origin: ['http://localhost:4001', `http://${currentIp}:4001`, `http://${currentIp}:5000`]}));
app.options('*', cors()) // include before other routes

app.get('/logout', function (req, res) {
  req.logout()
})

app.use('/store', require('./routes/stores/index.js'))

const ensureAuthenticated = (req, res, next) => {
  req.isAuthenticated() ? next() : res.status(401).end()
}

const queryUserTracks = username => pg.queryRowsAsync(
// language=PostgreSQL
  SQL`WITH
    logged_user AS (
      SELECT meta_account_user_id
      FROM meta_account
      WHERE meta_account_username = ${username}
  ),
    user_tracks AS (
      SELECT
        track_id,
        track_title,
        user__track_heard,
        track_added
      FROM logged_user
        NATURAL JOIN user__track
        NATURAL JOIN track
  ),
    authors AS (
      SELECT
        ut.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS authors
      FROM user_tracks ut
        JOIN track__artist ta ON (ta.track_id = ut.track_id AND ta.track__artist_role = 'author')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    remixers AS (
      SELECT
        ut.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS remixers
      FROM user_tracks ut
        JOIN track__artist ta ON (ta.track_id = ut.track_id AND ta.track__artist_role = 'remixer')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    previews AS (
      SELECT
        ut.track_id,
        json_agg(
            json_build_object('format', store__track_preview_format, 'url', store__track_preview_url)
        ) AS previews
      FROM user_tracks ut
        NATURAL JOIN store__track
        NATURAL JOIN store__track_preview
      GROUP BY 1
  ),
    stores AS (
      SELECT
        ut.track_id,
        json_agg(
            json_build_object(
                'name', store_name,
                'code', lower(store_name),
                'id', store_id,
                'trackId', store__track_store_id
            )
        ) AS stores
      FROM user_tracks ut
        NATURAL JOIN store__track
        NATURAL JOIN store
      GROUP BY 1
  )

SELECT
  ut.track_id       AS id,
  track_title       AS title,
  user__track_heard AS heard,
  json_build_object(
      'name', label_name,
      'id', label_id
  )                 AS label,
  authors.authors   AS artists,
  CASE WHEN remixers.remixers IS NULL
    THEN '[]' :: JSON
  ELSE remixers.remixers END,
  previews.previews,
  stores.stores

FROM user_tracks ut
  NATURAL JOIN track__label
  NATURAL JOIN label
  NATURAL JOIN authors
  NATURAL LEFT JOIN remixers
  NATURAL JOIN previews
  NATURAL JOIN stores
ORDER BY track_added DESC, ut.track_id
`)

app.get('/tracks', ensureAuthenticated, ({user: {username}} , res, next) =>
  queryUserTracks(username)
    .tap(userTracks => res.json(userTracks))
    .catch(next))

app.get('/tracks.pls', ensureAuthenticated, ({user: {username}}, res, next) =>
  queryUserTracks(username)
    .then(userTracks => {
      return '[playlist]\n\n' + userTracks.map(R.path(['previews', 0, 'url']))
        .map((row, i) => `File${i+1}=${row}\nLength${i+1}=5`)
        .join('\n\n')
        .concat(`\n\nNumberOfEntries=${userTracks.length}\nVersion=2\n`)
    })
    .tap(m3u => res.send(m3u))
    .catch(next)
)

app.use(bodyParser.json())
app.post('/login', passport.authenticate('local'), (req, res) => res.status(204).end())

app.post('/tracks/:id', ({params: {id}, body: {heard}}, res, next) => {
  // language=PostgreSQL
  pg.queryRowsAsync(
SQL`
UPDATE user__track
SET user__track_heard = ${heard}
WHERE track_id = ${id}
`).tap(() => res.send())
    .catch(next)
})

// TODO: add genre to database?
app.post('/ignore/genre', ({user: {username}, body: {artistId, storeId, genre}}, res, next) => {

})

app.post('/ignore/label', ({ user: { username }, body }, res, next) =>
  BPromise.using(pg.getTransaction(), tx =>
    BPromise.each(body, ({ artistId, labelId }) =>
      tx.queryAsync(
// language=PostgreSQL
        SQL`
INSERT INTO user__artist__label_ignore
(meta_account_user_id, artist_id, label_id)
SELECT
  meta_account_user_id,
  ${artistId},
  ${labelId}
FROM meta_account
`)
        .tap(() => removeIgnoredTracksFromUser(tx, username))))
    .tap(() => res.send())
    .catch(next))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500)
  res.send('error')
})

app.listen(4000);
