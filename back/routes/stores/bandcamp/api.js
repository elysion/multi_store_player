const router = require('express').Router()
const bodyParser = require('body-parser')
const { initWithSessionAsync } = require('./bandcamp-api.js')

const {
  refreshUserTracks,
  hasValidSession,
  getSession,
  setSession,
  setFanId,
  getFanId,
  deleteSession,
  getTracks,
  addTrackToCart,
  getTracksInCarts
} = require('./logic.js')

router.use(bodyParser.json())

router.get('/tracks', ({user, query: {older_than}}, res, next) => {
  return getTracks(user.username)
      .tap(tracks => res.send(tracks))
      .catch(next)
  }
)

router.post('/login', ({body: {client_id, identity, session}, user}, res, next) => {
  if (getSession(user.username)) {
    console.log(`using session for user ${user.username}`)
    return res.send('ok')
  } else {
    initWithSessionAsync({client_id, identity, session})
      .tap(session => {
        // console.log(`storing session for user ${user.username}`)
        setSession(user.username, session)
      })
      .tap(session => {
        session.getFanIdAsync()
          .tap(fanId => setFanId(user.username, fanId))
          .tap(fanId => console.log('fanId', fanId))
      })
      .tap(() => res.send('ok'))
      .catch(next)
  }
})

router.post('/refresh', ({user}, res) => {
  res.send('ok')
  return refreshUserTracks(user.username)
    .catch(err => console.error(`Refresh of Bandcamp tracks for user ${user.username} failed`, err))
  }
)

router.post('/carts/default', ({body: {trackId}, user}, res, next) =>
  addTrackToCart(trackId, user)
    .then(() => res.send('ok'))
    .catch(next)
)

router.post('/logout', ({user: {username}}, res) => {
  deleteSession(username)
  return res.send('ok')
})

router.get('/session-valid', ({user: {username} = {username: undefined}}, res) => {
  return res.send({
    validSession: hasValidSession(username)
  })
})

router.get('/carts', ({user}, res, next) =>
  getTracksInCarts(user)
    .catch((e) => console.log('asd', e))
    .tap(idsOfItemsInCarts => res.send(idsOfItemsInCarts))
    .catch(next)
)

module.exports = router
