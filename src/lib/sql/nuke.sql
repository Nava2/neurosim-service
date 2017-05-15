-- Drop views:

DROP VIEW IF EXISTS click_view;
DROP VIEW IF EXISTS zoom_view;
DROP VIEW IF EXISTS position_view;
DROP VIEW IF EXISTS rotation_view;
DROP VIEW IF EXISTS spatial_view;

-- Now drop tables:

DROP TABLE IF EXISTS mouse_data;
DROP TABLE IF EXISTS spatial_data;
DROP TABLE IF EXISTS session_data;
DROP TABLE IF EXISTS score_data;
DROP TABLE IF EXISTS tooltip_data;

DROP TRIGGER IF EXISTS check_spatial_times_acceptable;
DROP TRIGGER IF EXISTS check_tooltip_times_acceptable;
