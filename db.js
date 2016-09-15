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

    w.debug("Initializing database");

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run('CREATE TABLE session ('
        + '  user_id VARCHAR(10)'
        + ', start INTEGER'
        + ', model VARCHAR(10)'
        + ', id INTEGER PRIMARY ASC AUTOINCREMENT'
        + ')');

      db.run('CREATE TABLE click_data ('
        + '  session_id INTEGER REFERENCES sessions(id)'
        + ', start INTEGER'
        + ', button_id VARCHAR(30)'
        + ')');

      db.run('CREATE TABLE position_data ('
        + '  session_id INTEGER REFERENCES sessions(id)'
        + ', start INTEGER'
        + ', x DOUBLE'
        + ', y DOUBLE'
        + ', z DOUBLE'
        + ')');

      db.run('CREATE TABLE rotation_data ('
        + '  session_id INTEGER REFERENCES sessions(id)'
        + ', start INTEGER'
        + ', x DOUBLE'
        + ', y DOUBLE'
        + ')');

      db.run('COMMIT');
    });

    return next(null, db);
  }

  function delete_db(path, next) {
    w.info("Nuking Database");

    fs.unlink(path, err => {
      if (err) {
        next(err);
      } else {
        create_db(next);
      }
    });
  }

  function _insertIntoSession(db, rows) {
    const stmt = db.prepare("INSERT INTO session VALUES (?, ?, ?)");
    rows.forEach(r => {
      stmt.run(r.userId, r.start, r.model);
    });

    stmt.finalize();
  }

  function _insertIntoClickData(db, meta, rows) {
    const stmt = db.prepare("INSERT INTO click_data VALUES ((SELECT id FROM sessions WHERE user_id=? AND start=? AND model=?), ?, ?)");
    rows.forEach(r => {
      stmt.run(meta.userId, meta.start, meta.model, r.start, r.button);
    });

    stmt.finalize();
  }

  function _insertIntoPosition(db, sessionId, rows) {
    const stmt = db.prepare("INSERT INTO position_data VALUES (?, ?, ?, ?, ?)");
    rows.forEach(r => {
      stmt.run(sessionId, r.start, r.button);
    });

    stmt.finalize();
  }

  const TABLE_MAP = {
    'session': (db, meta, rows) => {
      // ignore meta parameter
      return _insertIntoSession(db, rows);
    },
    'click': _insertIntoClickData,
    'rotation'
  }

  function insertInto(db, table, meta, rows, next) {
    if (!db) {
      return next(new Error('Received bad db value'));
    }

    if (!table || table === '') {
      return next(new Error('Received bad table value: ' + table));
    }

    if (!Array.isArray(rows) && !Function.isFunction(rows)) {
      rows = _.compact([rows]);
    } else if (Function.isFunction(rows)) {
      // no rows specified
      next = rows;
      rows = []
    }

    if (rows.length == 0) {
      // Nothing to insert
      return next(null);
    }

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      if (table === 'session') {
        _insertIntoSession(db, rows);
      }


      db.run("COMMIT", next);
    });

  }

  return {
    init_db: init_db,

    create_db: create_db,

    delete_db: delete_db,

    insertInto: insertInto
  }
};
