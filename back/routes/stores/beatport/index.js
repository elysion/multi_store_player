const router = require('express').Router()
const bpApi = require('bp-api')
const bodyParser = require('body-parser')
const pg = require('../../../db/pg.js')
const BPromise = require('bluebird')
const using = BPromise.using
const R = require('ramda')
const SQL = require('sql-template-strings')
const { AccessDeniedError } = require('../../../errors.js')
const removeIgnoredTracksFromUser = require('../../../remove-ignored-tracks-from-user.js')

let beatportSessions = {}
let beatportStoreDbId = null

const getBeatportStoreDbId = () => {
  if (beatportStoreDbId) {
    return BPromise.resolve(beatportStoreDbId)
  } else {
    //language=PostgreSQL
    return pg.queryRowsAsync(
      SQL`SELECT store_id
          FROM store
          WHERE store_name = 'Beatport'`)
      .then(([{ store_id }]) => {
        beatportStoreDbId = store_id
        return beatportStoreDbId
      })
  }
}

const getSessionForRequest = user => {
  // if (!user || !user.username) {
  //   throw new AccessDeniedError('Unable to find Beatport session for user')
  // }

  return beatportSessions[user.username]
}

router.get('/download/:downloadId', (req, res, next) => {
  const { downloadId } = req.params
  getSessionForRequest(req.user)
    .downloadTrackWithIdAsync(downloadId)
    .tap(request => req.pipe(request).pipe(res))
    .catch(next)
})

router.use(bodyParser.json())

router.get('/', ({ user }, res, next) =>
  getSessionForRequest(user)
    .getMyBeatportAsync()
    .then(results => res.send(results))
    .catch(next)
)

router.get('/tracks', ({ user, query: { page } }, res, next) =>
  getSessionForRequest(user)
    .getMyBeatportTracksAsync(page)
    .tap(tracks => res.send(tracks))
    .catch(next)
)

router.get('/carts', ({ user }, res, next) =>
  getSessionForRequest(user)
    .getItemsInCartsAsync()
    .tap(idsOfItemsInCarts => res.send(idsOfItemsInCarts.map(String)))
    .catch(next)
)

router.post('/carts/:cartId', ({ body: { trackId }, params: { cartId }, user }, res, next) =>
  getSessionForRequest(user)
    .addTrackToCartAsync(parseInt(trackId, 10), cartId)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.delete('/carts/:cartId', ({ body: { trackId }, params: { cartId }, user }, res, next) =>
  getSessionForRequest(user)
    .removeTrackFromCartAsync(parseInt(trackId, 10), cartId)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.get('/downloads', ({ user }, res, next) =>
  getSessionForRequest(user)
    .getAvailableDownloadIdsAsync()
    .catch(next)
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
    .tap(artists => console.log(JSON.stringify({ artists }, null, 2)))
    .then(storeArtists =>
      tx.queryRowsAsync(
// language=PostgreSQL
        SQL`-- find new artists
SELECT id
FROM json_to_recordset(${JSON.stringify(storeArtists)} :: JSON) AS artists(id INT)
WHERE id NOT IN (
SELECT store__artist_store_id :: INT
FROM store__artist
WHERE store_id = ${bpStoreId}
)`)
        .then(R.innerJoin(R.eqProps('id'), storeArtists))
        .tap(newStoreArtists => console.log(JSON.stringify({ newStoreArtists }, null, 2)))
        .then(
          newStoreArtists =>
            BPromise.each(newStoreArtists,
              newStoreArtist => {
                console.log('Adding artist: ', JSON.stringify({ newStoreArtist }, null, 2))
                return tx.queryRowsAsync(
// language=PostgreSQL
                  SQL`-- insert new artists
INSERT INTO artist (artist_name)
  SELECT ${newStoreArtist.name}
  WHERE NOT EXISTS (
    SELECT 1
    FROM artist
    WHERE lower(artist_name) = lower(${newStoreArtist.name})
  )`)
                  .tap(() => tx.queryRowsAsync(
// language=PostgreSQL
                    SQL`
INSERT INTO store__artist (artist_id, store_id, store__artist_store_id, store__artist_store_details)
  SELECT 
  artist_id,
  ${bpStoreId},
  ${newStoreArtist.id},
  ${JSON.stringify(newStoreArtist)} :: JSONB
  FROM artist 
  WHERE lower(artist_name) = lower(${newStoreArtist.name})
`))
              })))

const ensureLabelsExist =
  async (tx, newStoreTracks, bpStoreId) =>
    BPromise.resolve(newStoreTracks)
      .map(R.prop('label'))
      .then(R.uniqBy(R.prop('id')))
      .then(storeLabels =>
        tx.queryRowsAsync(
// language=PostgreSQL
          SQL`-- find new artists
SELECT id
FROM json_to_recordset(${JSON.stringify(storeLabels)} :: JSON) AS labels(id INT)
WHERE id NOT IN (
  SELECT store__label_store_id :: INT
  FROM store__label
  WHERE store_id = ${bpStoreId}
)`)
          .then(R.innerJoin(R.eqProps('id'), storeLabels))
          .then(newStoreLabels =>
            BPromise.each(newStoreLabels,
// language=PostgreSQL
              newStoreLabel =>
                tx.queryRowsAsync(
                  SQL`-- ensure label exists
INSERT INTO label (label_name)
  SELECT ${newStoreLabel.name}
  WHERE NOT exists(
    SELECT 1
    FROM label
    WHERE lower(label_name) = lower(${newStoreLabel.name})
  )`)
                  .tap(tx.queryRowsAsync(
                    SQL`-- ensure store label exists
INSERT INTO store__label (label_id, store_id, store__label_store_id, store__label_store_details)
  SELECT
    label_id,
    ${bpStoreId},
    ${newStoreLabel.id},
    ${JSON.stringify(newStoreLabel)} :: JSON
  FROM label
  WHERE lower(label_name) = lower(${newStoreLabel.name})
`)))))

const ensureTracksExist = async (tx, newStoreTracks, bpStoreId) =>
  BPromise.map(newStoreTracks,
    newStoreTrack =>
      tx.queryRowsAsync(
// language=PostgreSQL
        SQL`
WITH 
  new_track_authors AS (
    SELECT DISTINCT id, name -- is distinct really needed
    FROM json_to_recordset(${JSON.stringify(newStoreTrack.artists)} :: JSON) AS x(id INT, name TEXT)
    ORDER BY id
  ),
  new_track_remixers AS (
    SELECT DISTINCT id, name -- is distinct really needed
    FROM json_to_recordset(${JSON.stringify(newStoreTrack.remixers)} :: JSON) AS x(id INT, name TEXT)
    ORDER BY id
  ),
  authors AS (
    SELECT DISTINCT artist_id -- is distinct really needed?
    FROM new_track_authors
    JOIN store__artist ON (store__artist_store_id :: INT = new_track_authors.id)
    NATURAL JOIN artist
  ),
  remixers AS (
    SELECT DISTINCT artist_id -- is distinct really needed?
    FROM new_track_remixers
    JOIN store__artist ON (store__artist_store_id :: INT = new_track_remixers.id)
    NATURAL JOIN artist
  ),
  exiting_track_details AS (
    SELECT
      t.track_id,
      t.track_title,
      array_agg(DISTINCT a.artist_id ORDER BY a.artist_id) AS artists,
      array_agg(DISTINCT r.artist_id ORDER BY r.artist_id) AS remixers
    FROM track t
      LEFT JOIN track__artist ta ON (ta.track_id = t.track_id AND ta.track__artist_role = 'author')
      LEFT JOIN artist a ON (a.artist_id = ta.artist_id)
      LEFT JOIN track__artist ra ON (ra.track_id = t.track_id AND ra.track__artist_role = 'remixer')
      LEFT JOIN artist r ON (r.artist_id = ra.artist_id)
    WHERE
      track_title = ${newStoreTrack.name} AND
      a.artist_id IN (SELECT artist_id FROM authors) AND
      r.artist_id IN (SELECT artist_id FROM remixers)
    GROUP BY 1, 2
  ),
  existing_track AS (
    SELECT track_id
    FROM exiting_track_details
    WHERE
    track_title = ${newStoreTrack.name} AND
    artists = (SELECT ARRAY(SELECT id
           FROM new_track_authors
           ORDER BY id)) AND
    remixers = (SELECT ARRAY(SELECT id
            FROM new_track_remixers
            ORDER BY id))
  ),
  inserted_track AS (
    INSERT INTO track (track_title)
      SELECT ${newStoreTrack.name}
      WHERE NOT exists (SELECT 1 FROM existing_track)
    RETURNING track_id
  ),
  inserted_track_authors AS (
    INSERT INTO track__artist (track_id, artist_id, track__artist_role)
    SELECT 
      track_id,
      artist_id,
      'author'
    FROM inserted_track, authors
    WHERE NOT EXISTS (SELECT 1 FROM existing_track)
  ),
  inserted_track_remixers AS (
    INSERT INTO track__artist (track_id, artist_id, track__artist_role)
    SELECT 
      track_id,
      artist_id,
      'remixer' 
    FROM inserted_track, remixers
    WHERE NOT EXISTS (SELECT 1 FROM existing_track)
  )
  
  SELECT track_id FROM inserted_track
  UNION ALL SELECT track_id FROM existing_track
`)
        .then(([{ track_id }]) => track_id)
        .tap(trackId => tx.queryRowsAsync(
// language=PostgreSQL
          SQL`INSERT INTO track__label (track_id, label_id)
  SELECT
    ${trackId},
    label_id
  FROM store__label
  WHERE store__label_store_id = ${newStoreTrack.label.id} :: TEXT
`))
        .tap(trackId => tx.queryRowsAsync(
// language=PostgreSQL
          SQL`
INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
VALUES (${trackId}, ${bpStoreId}, ${newStoreTrack.id}, ${JSON.stringify(newStoreTrack)} :: JSONB)
RETURNING store__track_id
`)
          .tap(([{ store__track_id }]) => tx.queryRowsAsync(
// language=PostgreSQL
            SQL`
INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
  SELECT
    ${store__track_id},
    value ->> 'url',
    key :: PREVIEW_FORMAT
  FROM json_each(${JSON.stringify(newStoreTrack.preview)} :: JSON)
`))))

const insertNewTracksToDb =
  (tx, tracks) =>
    getBeatportStoreDbId()
      .then(bpStoreId =>
        tx.queryRowsAsync(
// language=PostgreSQL
          SQL`-- find new tracks
SELECT id
FROM json_to_recordset(
${JSON.stringify(
            R.project(['id'], tracks)
          )} :: JSON) AS tracks(id INT)
WHERE id :: TEXT NOT IN (
  SELECT store__track_store_id
  FROM store__track
  WHERE store_id = ${bpStoreId}
)`)
          .then(R.innerJoin(R.eqProps('id'), tracks))
          .then(async newTracks => {
            await ensureArtistsExist(tx, newTracks, bpStoreId)
            await ensureLabelsExist(tx, newTracks, bpStoreId)
            return await ensureTracksExist(tx, newTracks, bpStoreId)
          }))

const refreshUserTracks = (username, page = 1, endPage = 10) => {
  console.log(`Refreshing tracks from page ${page} of ${username}'s My Beatport`)
  return page >= endPage ? BPromise.resolve() :
    beatportSessions[username]
      .getMyBeatportTracksAsync(page) // TODO: fetch while there were new tracks found
      .then(R.prop('tracks'))
      .then(tracks =>
        using(pg.getTransaction(), tx =>
          insertNewTracksToDb(tx, tracks)
            .then(insertedTrackIds =>
              BPromise.each(insertedTrackIds,
                insertedTrackId =>
                  tx.queryRowsAsync(
// language=PostgreSQL
                    SQL`
INSERT INTO user__track (track_id, meta_account_user_id)
  SELECT
    ${insertedTrackId},
    meta_account_user_id
  FROM meta_account
  WHERE meta_account_username = ${username}
`))
                .tap(() => removeIgnoredTracksFromUser(tx, username)))))
      .tap(insertedTracks => console.log(`Inserted ${insertedTracks.length} new tracks to ${username}`))
      .tap(insertedTracks =>
        true || insertedTracks.length > 0 ?
          refreshUserTracks(username, page + 1, endPage) :
          BPromise.resolve())
}

router.post('/login', ({ body: { username, password }, user }, res, next) => {
  if (beatportSessions[user.username]) {
    console.log(`using session for user ${user.username}`)
    return res.send('ok')
  } else {
    return bpApi.initAsync(username, password)
      .then(session => {
        // console.log(`storing session for user ${user.username}`)
        beatportSessions[user.username] = session
      })
      .tap(() => res.send('ok'))
      .catch(next)
  }
})

router.post('/refresh', ({ user }, res, next) => refreshUserTracks(user.username)
  .then(() => res.send('ok'))
  .catch(next)
)

router.post('/logout', ({ user: { username } }, res) => {
  delete beatportSessions[username]
  return res.send('ok')
})

router.get('/session-valid', ({ user: { username } }, res) => {
  return res.send({
    validSession: Object.keys(beatportSessions).includes(username)
  })
})

module.exports = router
