CREATE TABLE IF NOT EXISTS session_data (
    uuid VARCHAR(36) NOT NULL UNIQUE
  , user_id VARCHAR(10) NOT NULL
  , start_ms DOUBLE NOT NULL
  , end_ms DOUBLE
  , model VARCHAR(10) NOT NULL
  , UNIQUE(user_id, start_ms, model)
  , CHECK ((end_ms IS NULL) OR (start_ms <= end_ms))
);

CREATE TABLE IF NOT EXISTS spatial_data (
    session_id VARCHAR(36) REFERENCES session_data(uuid) ON DELETE CASCADE
  , start_ms DOUBLE NOT NULL
  , end_ms DOUBLE NOT NULL
  , x DOUBLE NOT NULL
  , y DOUBLE NOT NULL
  , zoom DOUBLE DEFAULT 1.0
  , alpha DOUBLE NOT NULL
  , beta DOUBLE NOT NULL
  , gamma DOUBLE DEFAULT 0.0
  , UNIQUE (session_id, start_ms, end_ms)
  , CHECK (start_ms <= end_ms)
);

CREATE TABLE IF NOT EXISTS tooltip_data (
    session_id VARCHAR(36) REFERENCES session_data(uuid) ON DELETE CASCADE
  , object_id VARCHAR(64) NOT NULL
  , start_ms DOUBLE NOT NULL
  , end_ms DOUBLE NOT NULL
  , start_x DOUBLE NOT NULL
  , start_y DOUBLE NOT NULL
  , end_x DOUBLE NOT NULL
  , end_y DOUBLE NOT NULL
  , UNIQUE (session_id, object_id, start_ms, end_ms)
  , CHECK (start_ms <= end_ms)
);

CREATE TABLE IF NOT EXISTS click_data ( 
    session_id VARCHAR(36) REFERENCES session_data(uuid) ON DELETE CASCADE
  , time_ms DOUBLE NOT NULL
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
          , IFNULL(spatial_data.end_ms, -1)
          , IFNULL(tooltip_data.end_ms, -1)) AS max_ms
      FROM session_data s
      LEFT OUTER JOIN click_data ON s.uuid=click_data.session_id
      LEFT OUTER JOIN spatial_data ON s.uuid=spatial_data.session_id
      LEFT OUTER JOIN tooltip_data ON s.uuid=tooltip_data.session_id
      WHERE s.end_ms IS NULL)
    SELECT
        session_id
      , m.max_ms
      , (get_now.ms - m.max_ms) AS from_now
    FROM m, get_now;

-- View for spatial for Lauren
CREATE VIEW IF NOT EXISTS spatial_view AS
  SELECT
      session_id
    , user_id
    , model
    , spatial_data.start_ms as start_ms
    , spatial_data.end_ms as end_ms
    , strftime('%Y-%m-%dT%H:%M:%f', spatial_data.start_ms/1000.0, 'unixepoch') as start
    , strftime('%Y-%m-%dT%H:%M:%f', spatial_data.end_ms/1000.0, 'unixepoch') as end
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
    , strftime('%Y-%m-%dT%H:%M:%f', time_ms/1000.0, 'unixepoch') as time
    , button_id
 FROM session_data, click_data
 WHERE session_data.uuid=click_data.session_id
 ORDER BY user_id, time_ms;

CREATE VIEW IF NOT EXISTS session_view AS 
  SELECT uuid AS 
      session_id 
    , model 
    , user_id 
    , start_ms 
    , end_ms 
    , strftime('%Y-%m-%dT%H:%M:%f', start_ms/1000.0, 'unixepoch') as start_time 
    , strftime('%Y-%m-%dT%H:%M:%f', end_ms/1000.0, 'unixepoch') as end_time 
  FROM session_data 
  ORDER BY model, user_id, start_ms;

CREATE VIEW IF NOT EXISTS tooltip_view AS 
  SELECT 
      session_id 
    , user_id 
    , object_id 
    , tooltip_data.start_ms AS start_ms 
    , tooltip_data.end_ms AS end_ms 
    , start_x 
    , start_y 
    , end_x 
    , end_y 
    , strftime('%Y-%m-%dT%H:%M:%f', tooltip_data.start_ms/1000.0, 'unixepoch') as start_time 
    , strftime('%Y-%m-%dT%H:%M:%f', tooltip_data.end_ms/1000.0, 'unixepoch') as end_time 
  FROM tooltip_data, session_data 
  WHERE tooltip_data.session_id = session_data.uuid 
  ORDER BY user_id, start_ms, object_id;