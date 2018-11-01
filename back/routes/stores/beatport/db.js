const pg = require('../../../db/pg.js')
const R = require('ramda')
const SQL = require('sql-template-strings')

module.exports.insertArtist = (tx, artistName) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`-- insert new artists
INSERT INTO artist (artist_name)
  SELECT ${artistName}
  WHERE NOT EXISTS (
    SELECT 1
    FROM artist
    WHERE lower(artist_name) = lower(${artistName})
  )`)

module.exports.insertUserTrack = (tx, username, insertedTrackId) =>
  tx.queryRowsAsync(
// language=PostgreSQL
    SQL`
INSERT INTO user__track (track_id, meta_account_user_id)
SELECT
${insertedTrackId},
meta_account_user_id
FROM meta_account
WHERE meta_account_username = ${username}
ON CONFLICT DO NOTHING
`)

module.exports.findNewTracks = (tx, bpStoreId, tracks) =>
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

module.exports.insertTrackPreview = (tx, store__track_id, previews, waveforms) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`
INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format, store__track_preview_start_ms, store__track_preview_end_ms)
  SELECT
    ${store__track_id},
    value ->> 'url',
    key :: PREVIEW_FORMAT,
    (value -> 'offset' ->> 'start') :: INTEGER,
    (value -> 'offset' ->> 'end') :: INTEGER
  FROM json_each(${JSON.stringify(previews)} :: JSON) -- todo: JSON -> JSONB?
  RETURNING store__track_preview_id
`)

module.exports.insertTrackWaveform =
  (tx, store__track_id, waveforms) =>
    tx.queryRowsAsync(
// language=PostgreSQL
      SQL`
INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url) select store__track_preview_id, ${waveforms.large.url} from store__track_preview where store__track_id = ${store__track_id}
    `)

module.exports.insertStoreTrack = (tx, bpStoreId, trackId, trackStoreId, trackStoreDetails) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`
INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
VALUES (${trackId}, ${bpStoreId}, ${trackStoreId}, ${JSON.stringify(trackStoreDetails)} :: JSONB)
RETURNING store__track_id
`)

module.exports.insertTrackToLabel = (tx, trackId, labelId) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`INSERT INTO track__label (track_id, label_id)
  SELECT
    ${trackId},
    label_id
  FROM store__label
  WHERE store__label_store_id = ${labelId} :: TEXT
  ON CONFLICT DO NOTHING
`)

module.exports.insertNewTrackReturningTrackId = (tx, newStoreTrack) =>
  tx.queryRowsAsync(
// language=PostgreSQL
    SQL`WITH
    new_track_authors AS (
      SELECT DISTINCT
        id,
        name -- is distinct really needed
      FROM json_to_recordset(${JSON.stringify(newStoreTrack.artists)} :: JSON) AS x(id INT, name TEXT)
      ORDER BY id
  ),
    new_track_remixers AS (
      SELECT DISTINCT
        id,
        name -- is distinct really needed
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
        t.track_mix,
        array_agg(DISTINCT a.artist_id
        ORDER BY a.artist_id) AS artists,
        array_agg(DISTINCT r.artist_id
        ORDER BY r.artist_id) AS remixers
      FROM track t
        LEFT JOIN track__artist ta ON (ta.track_id = t.track_id AND ta.track__artist_role = 'author')
        LEFT JOIN artist a ON (a.artist_id = ta.artist_id)
        LEFT JOIN track__artist ra ON (ra.track_id = t.track_id AND ra.track__artist_role = 'remixer')
        LEFT JOIN artist r ON (r.artist_id = ra.artist_id)
      WHERE
        track_title = ${newStoreTrack.name} AND
        a.artist_id IN (SELECT artist_id
                        FROM authors) AND
        (r.artist_id IS NULL OR r.artist_id IN (SELECT artist_id
                                                FROM remixers))
      GROUP BY 1, 2
  ),
    existing_track AS (
      SELECT track_id
      FROM exiting_track_details
      WHERE
        track_title = ${newStoreTrack.name} AND
        (track_mix IS NULL OR track_mix = ${newStoreTrack.mix}) AND
        artists = (SELECT ARRAY(SELECT artist_id
                                FROM authors
                                ORDER BY artist_id))
        AND (
          (
            cardinality(
                ARRAY(
                    SELECT artist_id
                    FROM remixers
                    ORDER BY artist_id)) = 0
            AND exiting_track_details.remixers = ARRAY [null] :: integer []
          )
          OR remixers = (
            SELECT ARRAY(
                SELECT artist_id
                FROM remixers
                ORDER BY artist_id))
        )
  ),
    inserted_track AS (
    INSERT INTO track (track_title, track_mix, track_duration_ms)
      SELECT ${newStoreTrack.name}, ${newStoreTrack.mix}, ${newStoreTrack.duration.milliseconds}
      WHERE NOT exists(SELECT 1
                       FROM existing_track)
    RETURNING track_id
  ),
    inserted_track_authors AS (
    INSERT INTO track__artist (track_id, artist_id, track__artist_role)
      SELECT
        track_id,
        artist_id,
        'author'
      FROM inserted_track, authors
      WHERE NOT EXISTS(SELECT 1
                       FROM existing_track)
  ),
    inserted_track_remixers AS (
    INSERT INTO track__artist (track_id, artist_id, track__artist_role)
      SELECT
        track_id,
        artist_id,
        'remixer'
      FROM inserted_track, remixers
      WHERE NOT EXISTS(SELECT 1
                       FROM existing_track)
  )

SELECT track_id
FROM inserted_track
UNION ALL (SELECT track_id as existing_id
           FROM existing_track)
`)

module.exports.ensureStoreLabelExists = (tx, bpStoreId, labelName, storeLabelId, labelStoreDetails) => tx.queryRowsAsync(
  // language=PostgreSQL
  SQL`-- ensure store label exists
INSERT INTO store__label (label_id, store_id, store__label_store_id, store__label_store_details)
  SELECT
    label_id,
    ${bpStoreId},
    ${storeLabelId},
    ${labelStoreDetails} :: JSON
  FROM label
  WHERE lower(label_name) = lower(${labelName})
`)

module.exports.ensureLabelExists = (tx, labelName) => tx.queryRowsAsync(
  // language=PostgreSQL
  SQL`-- ensure label exists
INSERT INTO label (label_name)
  SELECT ${labelName}
  WHERE NOT exists(
    SELECT 1
    FROM label
    WHERE lower(label_name) = lower(${labelName})
  )`)

module.exports.findNewLabels = (tx, bpStoreId, storeLabels) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`-- find new artists
SELECT id
FROM json_to_recordset(${JSON.stringify(storeLabels)} :: JSON) AS labels(id INT)
WHERE id NOT IN (
  SELECT store__label_store_id :: INT
  FROM store__label
  WHERE store_id = ${bpStoreId}
)`)

module.exports.insertStoreArtist = (tx, bpStoreId, artistName, storeArtistId, storeArtistDetails) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`
INSERT INTO store__artist (artist_id, store_id, store__artist_store_id, store__artist_store_details)
  SELECT 
  artist_id,
  ${bpStoreId},
  ${storeArtistId},
  ${storeArtistDetails} :: JSONB
  FROM artist 
  WHERE lower(artist_name) = lower(${artistName})
`)

module.exports.findNewArtists = (tx, bpStoreId, storeArtists) => tx.queryRowsAsync(
// language=PostgreSQL
  SQL`-- find new artists
SELECT id
FROM json_to_recordset(${JSON.stringify(storeArtists)} :: JSON) AS artists(id INT)
WHERE id NOT IN (
SELECT store__artist_store_id :: INT
FROM store__artist
WHERE store_id = ${bpStoreId}
)`)

module.exports.getStoreId = storeName => pg.queryRowsAsync(
  //language=PostgreSQL
  SQL`SELECT store_id
  FROM store
  WHERE store_name = ${storeName}`)
  .then(([{ store_id }]) => store_id)