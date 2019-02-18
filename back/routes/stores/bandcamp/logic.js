const R = require('ramda')
const BPromise = require('bluebird')
const using = BPromise.using
const pg = require('../../../db/pg.js')
const removeIgnoredTracksFromUser = require('../../../remove-ignored-tracks-from-user.js')

const {
  insertArtist,
  insertUserTrack,
  findNewTracks,
  insertTrackPreview,
  insertStoreTrack,
  insertNewTrackReturningTrackId,
  insertStoreArtist,
  isNewArtist,
  getStoreId,
  insertTrackToCart,
  queryTracksInCarts
} = require('./db.js')

let sessions = {}
let storeDbId = null

module.exports.hasValidSession = username => Object.keys(sessions).includes(username)

let getSession = module.exports.getSession = username => sessions[username]

module.exports.setSession = (username, session) => sessions[username] = session

module.exports.deleteSession = username => {
  delete sessions[username]
}

let fanIds = []
module.exports.setFanId = (username, fanId) => {
  fanIds[username] = fanId
}

let getFanId = module.exports.getFanId = username => fanIds[username]

const getStoreDbId = () => {
  if (storeDbId) {
    return BPromise.resolve(storeDbId)
  } else {
    return getStoreId('Bandcamp')
      .then(store_id => {
        storeDbId = store_id
        return storeDbId
      })
  }
}

const getStories = module.exports.getStories = (username, since) =>
  getSession(username)
    .getStoriesAsync(getFanId(username), since)

const getAlbum = module.exports.getAlbum = (username, storyEntry) =>
  getSession(username)
    .getAlbumAsync(storyEntry)

const addTracksFromAlbumsToUser = (tx, username, albums) =>
  using(pg.getTransaction(), tx =>
    BPromise.mapSeries(albums, album =>
      insertNewAlbumTracksToDb(tx, album)
        .then(insertedTrackIds =>
          BPromise.each(insertedTrackIds,
            insertedTrackId => insertUserTrack(tx, username, insertedTrackId))
            .tap(() => removeIgnoredTracksFromUser(tx, username))))
      .then(R.flatten)
  )

const refreshUserTracks = module.exports.refreshUserTracks = (username, since = Date.now(), fetchTimes = 10) => {
  console.log(`Refreshing tracks from ${username}'s Bandcamp`)
  return getStories(username, since)
    .then(stories => BPromise.mapSeries(stories.entries, story => getAlbum(username, story))
      .then(albums => BPromise.using(pg.getTransaction(), tx =>
        addTracksFromAlbumsToUser(tx, username, albums))
        .then(insertedTracks => ({ insertedTracks, oldestStoryDate: stories.oldest_story_date }))
        .tap(({ insertedTracks }) => console.log(`Inserted ${insertedTracks.length} new tracks to ${username}. Remaining fetches: ${fetchTimes - 1}.`))
      )
    )
    .tap(({oldestStoryDate}) => {
      if (fetchTimes === 1) {
        console.log(`Done refreshing tracks for ${username}.`)
        return BPromise.resolve()
      }
      return refreshUserTracks(username, oldestStoryDate, fetchTimes - 1)
    })
    .catch(e => {
      console.error(`Failed to insert tracks for user ${username}`, e)
      return []
    })
}

const insertNewAlbumTracksToDb =
  (tx, album) =>
    getStoreDbId()
      .tap(storeId => ensureArtistExist(tx, album, storeId))
      .then(storeId => findNewTracks(tx, storeId, album.trackinfo.filter(R.propSatisfies(R.complement(R.isNil), ['file']))) // Tracks without previews are of little use
        .then(R.innerJoin(({ track_id: t1 }, { track_id: t2 }) => t1 == t2, album.trackinfo)) // TODO: do this in db
        .then(R.uniqBy(R.prop('track_id')))
        .then(async newTracks => {
          //await ensureLabelsExist(tx, newTracks, storeId) // TODO: is this even necessary for Bandcamp stuff?
          return await ensureTracksExist(tx, album.current, newTracks, storeId)
            .catch(e => {
              console.error('ensureTracksExist failed for', JSON.stringify(newTracks), e)
              return BPromise.reject(e)
            })
        })
      )

// TODO: add exclude: {label: [], genre: [] } to store__artist (?)
// TODO: --> create new artist if excludes match the current track
const ensureArtistExist = async (tx, album, storeId) =>
  isNewArtist(tx, storeId, album.current.band_id)
    .then(isNew => isNew ?
      insertArtist(tx, album.artist)
        .then(() => insertStoreArtist(tx, storeId, album.artist, album.current.band_id, JSON.stringify(album.current))) :
      BPromise.resolve())

const ensureTracksExist = async (tx, albumInfo, newStoreTracks, storeId) =>
  BPromise.mapSeries(newStoreTracks,
    newStoreTrack => insertNewTrackReturningTrackId(tx, albumInfo, newStoreTrack)
      .then(([{track_id}]) => track_id)
      // .tap(track_id => insertTrackToLabel(tx, track_id, newStoreTrack.label_id))
      .tap(track_id => insertStoreTrack(tx, storeId, track_id, newStoreTrack.track_id, newStoreTrack)
        .tap(([{store__track_id}]) => insertTrackPreview(tx, store__track_id, newStoreTrack))))

module.exports.addTrackToCart = (trackId, username, cart = 'default') =>
  insertTrackToCart(trackId, cart, username)

module.exports.getTracksInCarts = queryTracksInCarts

module.exports.test = {
  insertNewAlbumTracksToDb,
  addTracksFromAlbumsToUser
}
