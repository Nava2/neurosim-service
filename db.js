const moment  = require('moment');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const _ = require('lodash');


module.exports = (w) => {

  // Simple callback for creating a db
  function create_db(path, next) {
    w.info("Creating a new Database");
    // Create a new 'db' database.

    const db = new sqlite3.Database(path);

    return init_db(db, next);
  }

  function init_db(db, next) {
    if (!db) {
      next(new Error('db was invalid.'));
      return;
    }

    function runInit() {
      w.debug("Initializing database");

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run('CREATE TABLE session ('
          + '  user_id VARCHAR(10) NOT NULL'
          + ', start INTEGER NOT NULL'
          + ', end INTEGER NOT NULL'
          + ', model VARCHAR(10) NOT NULL'
          + ', UNIQUE (user_id, start, model)'
          + ')');

        db.run('CREATE TABLE click_data ('
          + '  session_id INTEGER REFERENCES session(ROWID)'
          + ', timestamp INTEGER'
          + ', button_id VARCHAR(30)'
          + ')');

        db.run('CREATE TABLE position_data ('
          + '  session_id INTEGER REFERENCES session(ROWID)'
          + ', timestamp INTEGER'
          + ', x DOUBLE'
          + ', y DOUBLE'
          + ', z DOUBLE'
          + ')');

        db.run('CREATE TABLE zoom_data ('
          + '  session_id INTEGER REFERENCES session(ROWID)'
          + ', timestamp INTEGER'
          + ', zoom DOUBLE'
          + ')');

        db.run('CREATE TABLE rotation_data ('
          + '  session_id INTEGER REFERENCES session(ROWID)'
          + ', timestamp INTEGER'
          + ', x DOUBLE'
          + ', y DOUBLE'
          + ')');

        db.run('CREATE VIEW rotation_view AS ' +
          'SELECT session.ROWID as session_id' +
            ', session.user_id as user_id' +
            ', session.model as model' +
            ', rotation_data.timestamp as time' +
            ', strftime(\'%Y-%m-%dT%H:%M:%f\', timestamp/1000.0, \'unixepoch\') as timestamp' +
            ', rotation_data.x as x' +
            ', rotation_data.y as y ' +
          'FROM session, rotation_data WHERE session.ROWID=rotation_data.session_id');

        db.run('CREATE VIEW position_view AS ' +
          'SELECT session.ROWID as session_id' +
          ', session.user_id as user_id' +
          ', session.model as model' +
          ', position_data.timestamp as time' +
          ', strftime(\'%Y-%m-%dT%H:%M:%f\', timestamp/1000.0, \'unixepoch\') as timestamp' +
          ', position_data.x as x' +
          ', position_data.y as y ' +
          'FROM session, position_data WHERE session.ROWID=position_data.session_id');

        db.run('CREATE VIEW zoom_view AS ' +
          'SELECT session.ROWID as session_id' +
          ', session.user_id as user_id' +
          ', session.model as model' +
          ', zoom_data.timestamp as time' +
          ', strftime(\'%Y-%m-%dT%H:%M:%f\', timestamp/1000.0, \'unixepoch\') as timestamp' +
          ', zoom_data.button_id as button_id' +
          'FROM session, zoom_data WHERE session.ROWID=zoom_data.session_id');

        db.run('CREATE VIEW click_view AS ' +
          'SELECT session.ROWID as session_id' +
          ', session.user_id as user_id' +
          ', session.model as model' +
          ', click_data.timestamp as time' +
          ', strftime(\'%Y-%m-%dT%H:%M:%f\', timestamp/1000.0, \'unixepoch\') as timestamp' +
          ', click_data.button_id as button_id' +
          'FROM session, click_data WHERE session.ROWID=click_data.session_id');

        db.run('COMMIT', err => {
          return next(err, db);
        });
      });
    }

    db.get("SELECT ROWID FROM session WHERE 1=1 LIMIT 1", (err, row) => {
      if (err) {
        if (err.code === 'SQLITE_ERROR') {
          return runInit();
        } else {
          throw err;
        }
      }

      return next(null, db);
    });
  }

  function delete_db(path, next) {
    w.info("Nuking Database");

    fs.unlink(path, err => {
      return next(err);
    });
  }

  function _insertIntoSession(db, meta) {
    db.get("SELECT ROWID FROM session WHERE user_id=? AND start=? AND model=?", meta.userId, meta.start, meta.model, (err, row) => {
      if (!row) {
        const stmt = db.prepare("INSERT OR ABORT INTO session(user_id, start, end, model) VALUES (?, ?, ?, ?)");

        stmt.run(meta.userId, meta.start, meta.end, meta.model);

        stmt.finalize();
      }
    });

  }

  function _insertIntoClickData(db, meta, rows) {
    const stmt = db.prepare("INSERT INTO click_data(session_id, timestamp, button_id) " +
      "VALUES ((SELECT ROWID FROM session WHERE user_id=? AND start=? AND model=?), ?, ?)");
    rows.forEach(r => {
      stmt.run(meta.userId, meta.start, meta.model, r.timestamp, r.button);
    });

    stmt.finalize();
  }

  function _insertIntoPosition(db, meta, rows) {
    const stmt = db.prepare("INSERT INTO position_data(session_id, timestamp, x, y, z) " +
      "VALUES ((SELECT ROWID FROM session WHERE user_id=? AND start=? AND model=?), ?, ?, ?, ?)");
    rows.forEach(r => {
      stmt.run(meta.userId, meta.start, meta.model, r.timestamp, r.x, r.y, (r.z ? r.z : 0.0));
    });

    stmt.finalize();
  }

  function _insertIntoRotation(db, meta, rows) {
    const stmt = db.prepare("INSERT INTO rotation_data(session_id, timestamp, x, y) " +
      "VALUES ((SELECT ROWID FROM session WHERE user_id=? AND start=? AND model=?), ?, ?, ?)");
    rows.forEach(r => {
      stmt.run(meta.userId, meta.start, meta.model, r.timestamp, r.x, r.y);
    });

    stmt.finalize();
  }

  const TABLE_MAP = {
    'session':  _insertIntoSession,
    'click': _insertIntoClickData,
    'rotation': _insertIntoRotation,
    'position': _insertIntoPosition
  };

  function insertInto(db, table, meta, rows, next) {
    if (!db) {
      return next(new Error('Received bad db value'));
    }

    if (!table || table === '') {
      return next(new Error('Received bad table value: ' + table));
    }

    if (!Array.isArray(rows) && !_.isFunction(rows)) {
      rows = _.compact([rows]);
    } else if (_.isFunction(rows)) {
      // no rows specified
      next = rows;
      rows = []
    }

    // The following run serially
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      let fn = TABLE_MAP[table];
      if (!_.isFunction(fn)) {
        db.run("ROLLBACK", () => (next(new Error(`Invalid table specified: ${table}`))));
      }

      fn(db, meta, rows);

      db.run("COMMIT", () => (next(null)));
    });
  }

  return {
    init_db: init_db,

    create_db: create_db,

    delete_db: delete_db,

    insertInto: insertInto
  }
};
