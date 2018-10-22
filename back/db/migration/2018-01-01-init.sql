CREATE EXTENSION IF NOT EXISTS "pgcrypto";
ALTER DATABASE :"DBNAME" SET time ZONE 'Europe/Helsinki';

CREATE TYPE TRACK__ARTIST_ROLE AS ENUM ('author', 'remixer');
CREATE TYPE PREVIEW_FORMAT AS ENUM ('mp3', 'mp4');

DROP TABLE IF EXISTS meta_account CASCADE;

DROP TABLE IF EXISTS meta_session CASCADE;
DROP TABLE IF EXISTS store CASCADE;
DROP TABLE IF EXISTS artist CASCADE;
DROP TABLE IF EXISTS track CASCADE;
DROP TABLE IF EXISTS label CASCADE;
DROP TABLE IF EXISTS track__label CASCADE;
DROP TABLE IF EXISTS store__artist CASCADE;
DROP TABLE IF EXISTS store__track CASCADE;
DROP TABLE IF EXISTS store__label CASCADE;
DROP TABLE IF EXISTS user__track CASCADE;
DROP TABLE IF EXISTS track__artist CASCADE;
DROP TABLE IF EXISTS store__track_preview CASCADE;

CREATE TABLE IF NOT EXISTS meta_account (
  meta_account_user_id  SERIAL PRIMARY KEY,
  meta_account_username VARCHAR(50)  NOT NULL UNIQUE, -- email?
  meta_account_details  JSONB        NOT NULL DEFAULT '{}' :: JSONB,
  meta_account_passwd   VARCHAR(100) NOT NULL
);

INSERT INTO meta_account (meta_account_username, meta_account_passwd)
VALUES ('elysion', crypt('testpwd', gen_salt('bf', 8)));


CREATE TABLE IF NOT EXISTS meta_session (
  sid    VARCHAR PRIMARY KEY,
  sess   JSONB        NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS store (
  store_id   SERIAL PRIMARY KEY,
  store_name VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS artist (-- TODO: how to differentiate artists with same name?
  artist_id   SERIAL PRIMARY KEY,
  artist_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS track (
  track_id         SERIAL PRIMARY KEY,
  track_title      VARCHAR(100)             NOT NULL,
  track_added      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS track__artist (
  track__artist_id   SERIAL PRIMARY KEY,
  track_id           INTEGER REFERENCES track (track_id)   NOT NULL,
  artist_id          INTEGER REFERENCES artist (artist_id) NOT NULL,
  track__artist_role TRACK__ARTIST_ROLE DEFAULT 'author',
  UNIQUE (track_id, artist_id, track__artist_role)
);

CREATE TABLE IF NOT EXISTS label (
  label_id   SERIAL PRIMARY KEY,
  label_name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS track__label (-- Same track might be released on multiple labels?
  track__label_id SERIAL PRIMARY KEY,
  track_id        INTEGER REFERENCES track (track_id) NOT NULL,
  label_id        INTEGER REFERENCES label (label_id) NOT NULL,
  UNIQUE (track_id, label_id)
);

CREATE TABLE IF NOT EXISTS store__artist (
  store__artist_id            SERIAL PRIMARY KEY,
  artist_id                   INTEGER REFERENCES artist (artist_id) NOT NULL,
  store_id                    INTEGER REFERENCES store (store_id)   NOT NULL,
  store__artist_store_id      TEXT UNIQUE                           NOT NULL,
  store__artist_store_details JSONB                                 NOT NULL
);

CREATE TABLE IF NOT EXISTS store__track (
  store__track_id            SERIAL PRIMARY KEY,
  track_id                   INTEGER REFERENCES track (track_id)   NOT NULL,
  store_id                   INTEGER REFERENCES store (store_id)   NOT NULL,
  store__track_store_id      TEXT UNIQUE                           NOT NULL,
  store__track_store_details JSONB                                 NOT NULL
);

CREATE TABLE IF NOT EXISTS store__track_preview (
  store__track_preview_id     SERIAL PRIMARY KEY,
  store__track_id             INTEGER REFERENCES store__track (store__track_id) NOT NULL,
  store__track_preview_url    TEXT                                              NOT NULL,
  store__track_preview_format PREVIEW_FORMAT                                    NOT NULL
);

CREATE TABLE IF NOT EXISTS store__label (
  store__label_id            SERIAL PRIMARY KEY,
  label_id                   INTEGER REFERENCES label (label_id)   NOT NULL,
  store_id                   INTEGER REFERENCES store (store_id)   NOT NULL,
  store__label_store_id      TEXT UNIQUE                           NOT NULL,
  store__label_store_details JSONB
);

CREATE TABLE IF NOT EXISTS user__track (
  user__track_id       SERIAL PRIMARY KEY,
  track_id             INTEGER REFERENCES track (track_id),
  meta_account_user_id INTEGER REFERENCES meta_account (meta_account_user_id),
  user__track_heard    timestamptz,
  UNIQUE (track_id, meta_account_user_id)
);

-- is this needed? an artist already relates to a label through artist__track
-- CREATE TABLE artist__label (
--   artist__label_id SERIAL PRIMARY KEY,
--   artist_id        INTEGER REFERENCES artist (artist_id),
--   label_id         INTEGER REFERENCES label (label_id)
-- );

CREATE TABLE user__artist__label_ignore (
  user__artist__label_ignore_id SERIAL PRIMARY KEY,
  meta_account_user_id          INTEGER REFERENCES meta_account (meta_account_user_id),
  artist_id                     INTEGER REFERENCES artist (artist_id),
  label_id                      INTEGER REFERENCES label (label_id)
);

-- CREATE TABLE IF NOT EXISTS meta_store_session (
--   meta_store_session_id      SERIAL PRIMARY KEY,
--   store_id                   INTEGER REFERENCES store (store_id)                     NOT NULL,
--   meta_session_is            INTEGER REFERENCES meta_session (meta_store_session_id) NOT NULL,
--   meta_store_session_session JSONB                                                   NOT NULL
-- );

INSERT INTO store (store_name) VALUES ('Beatport');
