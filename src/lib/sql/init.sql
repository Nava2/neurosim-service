CREATE TABLE IF NOT EXISTS session_data (
    uuid VARCHAR(36) NOT NULL UNIQUE
  , user_id VARCHAR(10) NOT NULL
  , start_ms INTEGER NOT NULL
  , end_ms INTEGER
  , model VARCHAR(10) NOT NULL
  , UNIQUE(user_id, start_ms, model)
  , CHECK ((end_ms IS NULL) OR (start_ms <= end_ms))
);

CREATE TABLE IF NOT EXISTS spatial_data (
    session_id VARCHAR(36) REFERENCES session_data(uuid)
  , start_ms INTEGER NOT NULL
  , end_ms INTEGER NOT NULL
  , x DOUBLE NOT NULL
  , y DOUBLE NOT NULL
  , zoom DOUBLE DEFAULT 1.0
  , alpha DOUBLE NOT NULL
  , beta DOUBLE NOT NULL
  , gamma DOUBLE DEFAULT 0.0
  , UNIQUE (start_ms, session_id)
  , CHECK (start_ms <= end_ms)
);

CREATE TABLE IF NOT EXISTS click_data ( 
    session_id VARCHAR(36) REFERENCES session_data(uuid)
  , time_ms INTEGER NOT NULL
  , button_id VARCHAR(32) NOT NULL
  , UNIQUE(session_id, time_ms)
);

-- Meta table used for calculations
CREATE VIEW get_now AS
  SELECT
      (strftime('%s', 'now') - strftime('%S', 'now') + strftime('%f', 'now'))*1000.0 as ms
    , (strftime('%s', 'now') - strftime('%S', 'now') + strftime('%f', 'now')) AS secs;


-- Table used for looking for the last update for a UUID
CREATE VIEW IF NOT EXISTS last_update_for_uuid AS
    WITH m AS (SELECT
          uuid AS session_id
        , MAX(s.start_ms
          , IFNULL(click_data.time_ms, -1)
          , IFNULL(spatial_data.end_ms, -1)) AS max_ms
      FROM session_data s
      LEFT OUTER JOIN click_data ON s.uuid=click_data.session_id
      LEFT OUTER JOIN spatial_data ON s.uuid=spatial_data.session_id
      WHERE s.end_ms IS NULL)
    SELECT
        session_id
      , m.max_ms
      , (get_now.ms - m.max_ms) AS from_now
    FROM m, get_now;

-- View for spatial for Lauren :)
CREATE VIEW IF NOT EXISTS spatial_view AS
  SELECT
      session_id
    , user_id
    , model
    , spatial_data.start_ms as start_ms
    , spatial_data.end_ms as end_ms
    , strftime('%Y-%m-%dT%H:%M:%f', spatial_data.start_ms, 'unixepoch') as start
    , strftime('%Y-%m-%dT%H:%M:%f', spatial_data.end_ms, 'unixepoch') as end
    , x
    , y
    , zoom
    , alpha
    , beta
    , gamma
  FROM session_data, spatial_data
  WHERE session_data.uuid=spatial_data.session_id
  ORDER BY user_id, start_ms;

CREATE VIEW IF NOT EXISTS click_view AS
  SELECT
      session_id
    , user_id
    , model
    , click_data.time_ms as time_ms
    , strftime('%Y-%m-%dT%H:%M:%f', time_ms, 'unixepoch') as time
    , button_id
 FROM session_data, click_data
 WHERE session_data.uuid=click_data.session_id
 ORDER BY user_id, time_ms;