const R = require('ramda')
const BPromise = require('bluebird')
const using = BPromise.using
const pg = require('../../../db/pg.js')
const removeIgnoredTracksFromUser = require('../../../remove-ignored-tracks-from-user.js')

const {
  insertArtist,
  insertUserTrack,
  insertTrackToLabel,
  findNewTracks,
  insertTrackPreview,
  insertTrackWaveform,
  insertStoreTrack,
  insertNewTrackReturningTrackId,
  ensureStoreLabelExists,
  ensureLabelExists,
  findNewLabels,
  insertStoreArtist,
  findNewArtists,
  getStoreId
} = require('./db.js')

let beatportSessions = {}
let beatportStoreDbId = null

module.exports.hasValidSession = username => Object.keys(beatportSessions).includes(username)

module.exports.getSession = username => beatportSessions[username]

module.exports.setSession = (username, session) => beatportSessions[username] = session

module.exports.deleteSession = username => {
  delete beatportSessions[username]
}

module.exports.getSessionForRequest = user => {
  // if (!user || !user.username) {
  //   throw new AccessDeniedError('Unable to find Beatport session for user')
  // }

  return beatportSessions[user.username]
}

const getBeatportStoreDbId = () => {
  if (beatportStoreDbId) {
    return BPromise.resolve(beatportStoreDbId)
  } else {
    return getStoreId('Beatport')
      .then(store_id => {
        beatportStoreDbId = store_id
        return beatportStoreDbId
      })
  }
}

const addTracksToUser = (tx, username, tracks) =>
  using(pg.getTransaction(), tx =>
    insertNewTracksToDb(tx, tracks)
      .then(insertedTrackIds =>
        BPromise.each(insertedTrackIds,
          insertedTrackId => insertUserTrack(tx, username, insertedTrackId))
          .tap(() => removeIgnoredTracksFromUser(tx, username))))

const refreshUserTracks = module.exports.refreshUserTracks = (username, firstPage = 1, lastPage = 100) => {
  console.log(`Refreshing tracks from page ${lastPage} of ${username}'s My Beatport`)
  return firstPage > lastPage ? BPromise.resolve() :
    beatportSessions[username]
      .getMyBeatportTracksAsync(lastPage) // TODO: fetch while there were new tracks found
      .then(R.prop('tracks'))
      .then(tracks => BPromise.using(pg.getTransaction(), tx => addTracksToUser(tx, username, tracks)))
      .tap(insertedTracks => console.log(`Inserted ${insertedTracks.length} new tracks to ${username}`))
      .tap(insertedTracks =>
        true || insertedTracks.length > 0 ?
          refreshUserTracks(username, firstPage, lastPage - 1) :
          BPromise.resolve())
}

const insertNewTracksToDb =
  (tx, tracks) =>
    getBeatportStoreDbId()
      .then(bpStoreId =>
        findNewTracks(tx, bpStoreId, tracks)
          .then(R.innerJoin(R.eqProps('id'), tracks))
          .then(async newTracks => {
            await ensureArtistsExist(tx, newTracks, bpStoreId)
            await ensureLabelsExist(tx, newTracks, bpStoreId)
            return await ensureTracksExist(tx, newTracks, bpStoreId)
          })
      )

const extractArtistsAndRemixers = R.pipe(
  R.chain(R.props(['artists', 'remixers'])),
  R.flatten,
  R.uniqBy(R.prop('id'))
)

// TODO: add exclude: {label: [], genre: [] } to store__artist (?)
// TODO: --> create new artist if excludes match the current track
const ensureArtistsExist = async (tx, newTracks, bpStoreId) =>
  BPromise.resolve(newTracks)
    .then(extractArtistsAndRemixers)
    .then(storeArtists =>
      findNewArtists(tx, bpStoreId, storeArtists)
        .then(R.innerJoin(R.eqProps('id'), storeArtists))
        .then(
          newStoreArtists =>
            BPromise.each(newStoreArtists,
              newStoreArtist => {

                return insertArtist(tx, newStoreArtist.name)
                  .tap(() => insertStoreArtist(tx, bpStoreId, newStoreArtist.name, newStoreArtist.id, JSON.stringify(newStoreArtist)))
              })))

const ensureLabelsExist =
  async (tx, newStoreTracks, bpStoreId) =>
    BPromise.resolve(newStoreTracks)
      .map(R.prop('label'))
      .then(R.uniqBy(R.prop('id')))
      .then(storeLabels =>
        findNewLabels(tx, bpStoreId, storeLabels)
          .then(R.innerJoin(R.eqProps('id'), storeLabels))
          .then(newStoreLabels =>
            BPromise.each(newStoreLabels,
              newStoreLabel => ensureLabelExists(tx, newStoreLabel.name)
                .tap(() => ensureStoreLabelExists(tx, bpStoreId, newStoreLabel.name, newStoreLabel.id, JSON.stringify(newStoreLabel))))))

const ensureTracksExist = async (tx, newStoreTracks, bpStoreId) =>
  BPromise.map(newStoreTracks,
    newStoreTrack => insertNewTrackReturningTrackId(tx, newStoreTrack)
      .then(([{track_id}]) => track_id)
      .tap(track_id => insertTrackToLabel(tx, track_id, newStoreTrack.label.id))
      .tap(track_id => insertStoreTrack(tx, bpStoreId, track_id, newStoreTrack.id, newStoreTrack)
        .tap(([{store__track_id}]) => insertTrackPreview(tx, store__track_id, newStoreTrack.preview))
        .tap(([{store__track_id}]) => insertTrackWaveform(tx, store__track_id, newStoreTrack.waveform))))

module.exports.test = {
  insertNewTracksToDb,
  addTracksToUser
}
