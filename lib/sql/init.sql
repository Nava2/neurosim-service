CREATE TABLE IF NOT EXISTS session_data (
    uuid VARCHAR(36) NOT NULL UNIQUE
  , user_id VARCHAR(10) NOT NULL
  , start INTEGER NOT NULL
  , end INTEGER
  , model VARCHAR(10) NOT NULL
  , UNIQUE(user_id, start, model)
);

CREATE TABLE IF NOT EXISTS spatial_data (
    session_id VARCHAR(36) REFERENCES session_data(uuid)
  , timestamp INTEGER NOT NULL
  , x DOUBLE NOT NULL
  , y DOUBLE NOT NULL
  , zoom DOUBLE DEFAULT 1.0
  , rot_x DOUBLE NOT NULL
  , rot_y DOUBLE NOT NULL
  , rot_z DOUBLE DEFAULT 0.0
  , UNIQUE (timestamp, session_id)
);

CREATE TABLE IF NOT EXISTS click_data ( 
    session_id VARCHAR(36) REFERENCES session_data(uuid)
  , timestamp INTEGER NOT NULL
  , button_id VARCHAR(32) NOT NULL
  , UNIQUE(session_id, timestamp)
);

CREATE VIEW IF NOT EXISTS spatial_view AS
  SELECT
      session_id
    , user_id
    , model
    , spatial_data.timestamp as time_int
    , strftime('%Y-%m-%dT%H:%M:%f', timestamp/1000.0, 'unixepoch') as timestamp
    , x DOUBLE
    , y DOUBLE
    , zoom DOUBLE
    , rot_x DOUBLE
    , rot_y DOUBLE
    , rot_z DOUBLE
  FROM session_data, spatial_data
  WHERE session_data.uuid=spatial_data.session_id
  ORDER BY user_id, time_int;

CREATE VIEW IF NOT EXISTS rotation_view AS
  SELECT
      session_id
    , user_id
    , model
    , spatial_data.timestamp as time_int
    , strftime('%Y-%m-%dT%H:%M:%f', timestamp/1000.0, 'unixepoch') as timestamp
    , rot_x
    , rot_y
    , rot_z
  FROM session_data, spatial_data
  WHERE session_data.uuid=spatial_data.session_id
  ORDER BY user_id, time_int;

CREATE VIEW IF NOT EXISTS position_view AS
  SELECT
      session_id
    , user_id
    , model
    , position_data.timestamp as time_int
    , strftime('%Y-%m-%dT%H:%M:%f', timestamp/1000.0, 'unixepoch') as timestamp
    , x
    , y
    , zoom
 FROM session_data, spatial_data
 WHERE session_data.uuid=spatial_data.session_id
 ORDER BY user_id, time_int;

CREATE VIEW IF NOT EXISTS click_view AS
  SELECT
      session_id
    , user_id
    , model
    , click_data.timestamp as time_int
    , strftime('%Y-%m-%dT%H:%M:%f', timestamp/1000.0, 'unixepoch') as timestamp
    , button_id
 FROM session_data, click_data
 WHERE session_data.uuid=click_data.session_id
 ORDER BY user_id, time_int;
