const pg = require('../db/pg.js')
const sql = require('sql-template-strings')
const R = require('ramda')

module.exports.queryUserTracks = username =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`WITH
    logged_user AS (
      SELECT meta_account_user_id
      FROM meta_account
      WHERE meta_account_username = ${username}
  ),
  user_tracks_meta AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE user__track_heard IS NULL) as new
    FROM user__track
    NATURAL JOIN logged_user
  ),
  new_tracks AS (
      SELECT
        track_id,
        track_added,
        user__track_heard
      FROM logged_user
        NATURAL JOIN user__track
        NATURAL JOIN track
      WHERE user__track_heard IS NULL
      GROUP BY 1, 2, 3
  ),
  label_scores AS (
    SELECT
      track_id,
      SUM(COALESCE(user_label_scores_score, 0)) AS label_score
    FROM new_tracks
    NATURAL LEFT JOIN track__label
    NATURAL LEFT JOIN user_label_scores
    GROUP BY 1
  ),
  artist_scores AS (
    SELECT
      track_id,
      SUM(COALESCE(user_artist_scores_score, 0)) AS artist_score
    FROM new_tracks
    NATURAL JOIN track__artist
    NATURAL LEFT JOIN user_artist_scores
    GROUP BY 1
  ),
  new_tracks_with_scores AS (
    SELECT
      track_id,
      user__track_heard,
      label_score + 5 * artist_score AS score
    FROM new_tracks
    NATURAL JOIN label_scores
    NATURAL JOIN artist_scores
    ORDER BY score DESC, track_added DESC
    LIMIT 200
  ),
  heard_tracks AS (
    SELECT
      track_id,
      user__track_heard,
      NULL :: NUMERIC AS score
    FROM user__track
    NATURAL JOIN logged_user
    WHERE user__track_heard IS NOT NULL
    ORDER BY user__track_heard DESC
    LIMIT 50
  ),
  limited_tracks AS (
    SELECT track_id, user__track_heard, score FROM new_tracks_with_scores
    UNION ALL
    SELECT track_id, user__track_heard, score FROM heard_tracks
  ),
    authors AS (
      SELECT
        lt.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS authors
      FROM limited_tracks lt
        JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'author')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    remixers AS (
      SELECT
        lt.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS remixers
      FROM limited_tracks lt
        JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'remixer')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    previews AS (
      SELECT
        lt.track_id,
        json_agg(
          json_build_object(
            'format', store__track_preview_format,
            'url', store__track_preview_url,
            'start_ms', store__track_preview_start_ms,
            'end_ms', store__track_preview_end_ms,
            'waveform', store__track_preview_waveform_url
          )
          ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC
        ) AS previews
      FROM limited_tracks lt
        NATURAL JOIN store__track
        NATURAL JOIN store__track_preview
        NATURAL LEFT JOIN store__track_preview_waveform
      GROUP BY 1
  ),
  store_tracks AS (
      SELECT distinct on (lt.track_id, store_id)
        track_id,
        store_id,
        store__track_id,
        store__track_released,
        store_name,
        store__track_store_id,
        store__release_url
      FROM limited_tracks lt
        NATURAL JOIN store__track
        NATURAL JOIN store
        NATURAL LEFT JOIN release__track
        NATURAL LEFT JOIN release
        NATURAL LEFT JOIN store__release
  ),
    stores AS (
      SELECT
        track_id,
        min(store__track_released) as release_date,
        json_agg(
            json_build_object(
                'name', store_name,
                'code', lower(store_name),
                'id', store_id,
                'trackId', store__track_store_id,
                'url', store__release_url
            )
        ) AS stores
      FROM store_tracks
      GROUP BY 1
  ),
  labels AS (
    SELECT
        track_id,
        json_agg(json_build_object('name', label_name, 'id', label_id)) AS labels
      FROM limited_tracks
      NATURAL JOIN track__label
      NATURAL JOIN label
      GROUP BY 1
  ),
  tracks_with_details AS (
SELECT
  lt.track_id           AS id,
  track_title           AS title,
  user__track_heard     AS heard,
  track_duration_ms     AS duration,
  track_added           AS added,
  authors.authors       AS artists,
  track_mix             AS mix,
  CASE WHEN labels.labels IS NULL
    THEN '[]' :: JSON
  ELSE labels.labels END AS labels,
  CASE WHEN remixers.remixers IS NULL
    THEN '[]' :: JSON
  ELSE remixers.remixers END AS remixers,
  previews.previews as previews,
  stores.stores,
  stores.release_date AS released,
  score
FROM limited_tracks lt
  NATURAL JOIN track
  NATURAL JOIN authors
  NATURAL JOIN previews
  NATURAL JOIN stores
  NATURAL LEFT JOIN labels
  NATURAL LEFT JOIN remixers
  ),
  new_tracks_with_details AS (
    SELECT json_agg(t) AS new_tracks FROM (
      SELECT * FROM tracks_with_details WHERE heard IS NULL ORDER BY score DESC, added DESC
    ) t
  ),
  heard_tracks_with_details AS (
    SELECT json_agg(t) AS heard_tracks FROM (
      SELECT * FROM tracks_with_details WHERE heard IS NOT NULL ORDER BY heard DESC
    ) t
  )
  SELECT
    json_build_object(
      'new', CASE WHEN new_tracks IS NULL THEN '[]'::JSON ELSE new_tracks END,
      'heard', CASE WHEN heard_tracks IS NULL THEN '[]'::JSON ELSE heard_tracks END
    ) as tracks,
    json_build_object(
      'total', total,
      'new', new
    ) as meta
  FROM
    new_tracks_with_details,
    heard_tracks_with_details,
    user_tracks_meta
`).then(R.head)

module.exports.addArtistOnLabelToIgnore = (tx, artistId, labelId, username) =>
  tx.queryAsync(
    // language=PostgreSQL
    sql`
INSERT INTO user__artist__label_ignore
(meta_account_user_id, artist_id, label_id)
SELECT
  meta_account_user_id,
  ${artistId},
  ${labelId}
FROM meta_account
where meta_account_username = ${username}
ON CONFLICT ON CONSTRAINT user__artist__label_ignore_unique DO NOTHING
`
  )

module.exports.setTrackHeard = (trackId, username, heard) =>
  pg.queryRowsAsync(
    sql`
UPDATE user__track
SET user__track_heard = ${heard ? 'now()' : null}
WHERE
  track_id = ${trackId} AND
  meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_username = ${username})
`
  )

module.exports.setAllHeard = (username, heard) =>
  pg.queryAsync(
    sql`
UPDATE user__track
SET user__track_heard = ${heard ? 'NOW()' : null}
WHERE
  meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_username = ${username})
    `
  )

module.exports.getLongestPreviewForTrack = (id, format) =>
  pg.queryRowsAsync(
    sql`
    SELECT store__track_id AS "storeTrackId" , lower(store_name) AS "storeCode"
    FROM
      store__track_preview NATURAL JOIN
      store__track  NATURAL JOIN
      store
    WHERE track_id = ${id} AND store__track_preview_format = ${format}
    ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC
    LIMIT 1;
    `
  ).then(R.head)
