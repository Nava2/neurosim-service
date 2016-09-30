const moment  = require('moment');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const uuid = require('uuid');
const _ = require('lodash');


module.exports = (w) => {

  function runScript(db, scriptName, next) {
    w.debug(`Running script: ${scriptName} (db: ${db.filename}`);

    fs.readFile(__dirname + `/sql/${scriptName}.sql`, (err, data) => {
      if (err) {
        return next(err);
      }

      db.exec(data.toString(), err => {
        return next(err, db);
      });
    });
  }

  // Simple callback for creating a db
  function open_db(path, next) {
    w.info(`Opening a new Database connection: ${path}`);
    if (!path) {
      next(new Error('Invalid database path specified'));
    }

    // Create a new 'db' database.
    const db = new sqlite3.Database(path, err => {
      if (err) {
        return next(err, null);
      }

      db.on('trace', query => {
        w.info(`[${path}] Running query: ${query}`);
      });

      return next(null, db);
    });
  }

  function init_db(db, next) {
    if (!db) {
      next(new Error('db was invalid.'));
      return;
    }

    function runInit() {
      w.info(`Initializing database: ${db.filename}`);

      runScript(db, 'init', next);
    }

    db.get("SELECT uuid FROM session_data WHERE 1=1 LIMIT 1", (err, row) => {
      if (err) {
        if (err.code === 'SQLITE_ERROR' && err.message.indexOf('no such table') !== -1) {
          return runInit();
        } else {
          throw err;
        }
      }

      return next(null, db);
    });
  }

  function delete_db(db, next) {
    w.info(`Nuking database tables: ${db.filename}`);

    runScript(db, 'nuke', err => {
      return next(err, db);
    });
  }

  function purge_db(db, next) {
    w.info(`[${db.filename}] Purging database tables`);

    runScript(db, 'purge', err => {
      return next(err, db);
    });
  }

  function new_session(db, meta, next) {
    const insert_stmt = db.prepare("INSERT OR ABORT INTO session_data(user_id, start_ms, end_ms, model, uuid) VALUES (?, ?, ?, ?, ?)");

    const new_uuid = uuid.v1();
    insert_stmt.run(meta.userId, meta.start, meta.end, meta.model, new_uuid, err => {
      if (err) return next(err, null);

      insert_stmt.finalize(err => {
        return next(err, new_uuid);
      });
    });
  }

  /**
   * Get the uuid from session meta data.
   * @param db Database to read from
   * @param meta Meta information, userId, start, and model
   * @param next Callback
   */
  function get_session_uuid(db, meta, next) {
    const select_stmt = db.prepare("SELECT uuid FROM session_data WHERE user_id=? AND start_ms=? AND model=?");

    function real_next(err, uuid) {
      if (err) return next(err, null);

      select_stmt.finalize(err => {
        return next(err, uuid);
      });
    }

    select_stmt.get(meta.userId, meta.start, meta.model, (err, row) => {
      if (err) {
        return real_next(err, null);
      }

      if (!row) {
        return real_next(new Error(`Unknown uuid for: user_id=${meta.userId}, start=${meta.start}, model=${meta.model}`), null);
      }

      return real_next(null, row.uuid);
    });
  }

  function open_session_exists(db, uuid, next) {
    const select_stmt = db.prepare("SELECT ROWID FROM session_data WHERE uuid=? AND end_ms IS NULL");

    select_stmt.get(uuid, (err, row) => {
      if (err) return next(err);

      select_stmt.finalize(err => {
        return next(err, !!row)
      });
    });
  }

  /**
   * Ends a session
   * @param db
   * @param session_id
   * @param end
   * @param next
   */
  function set_session_end(db, session_id, end, next) {
    db.run("UPDATE session_data SET end_ms=$end WHERE uuid=$session_id", {
      $end: end,
      $session_id: session_id
    }, err => {
      return next(err);
    });
  }

  function add_click_data(db, session_id, rows, next) {
    db.serialize(() => {
      db.exec("BEGIN TRANSACTION");

      const stmt = db.prepare("INSERT INTO click_data(session_id, time_ms, button_id) VALUES (?, ?, ?)");

      rows.forEach(r => {
        r.timestamp = moment(r.timestamp).valueOf(); // fix timestamp
        stmt.run(session_id, r.timestamp, r.button);
      });

      stmt.finalize(err => {
        if (err) return next(err);

        db.exec("COMMIT TRANSACTION", next);
      });
    });
  }

  function add_spatial_data(db, session_id, rows, next) {
    db.serialize(() => {
      db.exec("BEGIN TRANSACTION");

      const stmt = db.prepare("INSERT INTO spatial_data(session_id, start_ms, end_ms," +
        " x, y, zoom, alpha, beta, gamma)" +
        " VALUES ($session_id, $start, $end, $x, $y, $zoom, $alpha, $beta, $gamma)");

      rows.map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .forEach(r => {
          r["$start"] = moment(r["$start"]).valueOf(); // fix timestamps
          r["$end"] = moment(r["$end"]).valueOf();

          r["$session_id"] = session_id;

          stmt.run(r);
        });

      stmt.finalize(err => {
        if (err) return next(err);

        db.exec("COMMIT TRANSACTION", next);
      });
    });
  }

  return {
    init_db: init_db,

    open_db: open_db,

    purge_db: purge_db,

    delete_db: delete_db,

    session: {
      create: new_session,
      open_exists: open_session_exists,
      get_uuid: get_session_uuid,
      set_end: set_session_end
    },

    click: {
      add: add_click_data
    },

    spatial: {
      add: add_spatial_data
    }
  }
};
