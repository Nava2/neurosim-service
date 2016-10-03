'use strict';

const moment  = require('moment');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const uuid = require('uuid');
const _ = require('lodash');


module.exports = (w) => {

  /**
   * Inserts multiple rows using a prepared statement
   * @param db Database handle
   * @param stmt Prepared statement
   * @param rows Rows to insert
   */
  function run_multi_stmt(db, stmt, rows, next) {
    if (rows.length <= 0) {
      return next(null, rows.length);
    }

    const finalize = (prev_err) => {
      stmt.finalize(err => {
        if (prev_err) return next(prev_err, rows.length);
        if (err) return next(err, rows.length);

        db.exec("COMMIT TRANSACTION", err => {
          return next(err, rows.length);
        });
      });
    };

    let run_stmt = (index) => {
      let r = rows[index];
      stmt.run(r, err => {
        if (err) return finalize(err);

        if (index < rows.length - 1) {
          return run_stmt(index + 1);
        } else {
          return finalize();
        }
      });
    };

    db.serialize(() => {
      db.exec("BEGIN TRANSACTION", err => {
        if (err) return finalize(err);

        run_stmt(0);
      });
    });
  }

  class DbSession {

    constructor(handler) {
      this._db = handler._db;
    }

    create(meta, next) {
      const insert_stmt = this._db.prepare("INSERT OR ABORT INTO session_data(user_id, start_ms, end_ms, model, uuid) VALUES (?, ?, ?, ?, ?)");

      const new_uuid = uuid.v1();
      insert_stmt.run(meta.userId, meta.start, meta.end, meta.model, new_uuid, prev_err => {
        insert_stmt.finalize(err => {
          if (prev_err) return next(prev_err, null);
          if (err) return next(err, null);

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
    get_uuid(meta, next) {
      const select_stmt = this._db.prepare("SELECT uuid FROM session_data WHERE user_id=? AND start_ms=? AND model=?");

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

    /**
     * Checks if a uuid for a session is open
     * @param uuid
     * @param next
     */
    exists_open(uuid, next) {
      const select_stmt = this._db.prepare("SELECT end_ms FROM session_data WHERE uuid=?");

      select_stmt.get(uuid, (err, row) => {
        if (err) return next(err);

        let result;
        if (!row) {
          result = null;
        } else if (!row.end_ms) {
          result = 'open';
        } else {
          result = 'closed';
        }

        select_stmt.finalize(err => {
          return next(err, result)
        });
      });
    }

    /**
     * Ends a session
     *
     * @param session_id
     * @param end_time
     * @param next
     */
    end(session_id, end_time, next) {
      this._db.run("UPDATE session_data SET end_ms=$end WHERE uuid=$session_id", {
        $end: end_time,
        $session_id: session_id
      }, next);
    }

    end_open(timeout_s, next) {
      this._db.run("UPDATE session_data SET end_ms=(SELECT ms FROM get_now) " +
        "WHERE session_data.uuid IN (SELECT session_id FROM last_update_for_uuid WHERE from_now > ?)", timeout_s * 1000.0,
        next);
    }
  }



  class DbClick {

    constructor(handler) {
      this._db = handler._db;
    }

    add(session_id, rows, next) {
      // nothing to add, so don't bother with database stuff
      if (rows.length <= 0) {
        return next(null, rows.length);
      }

      const stmt = this._db.prepare("INSERT INTO click_data" +
        "(session_id, time_ms, button_id) " +
        "VALUES ($session_id, $timestamp, $button)");

      const insert_rows = rows.map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .map(r => {
          r["$timestamp"] = moment(r["$timestamp"]).valueOf()/1000.0; // fix timestamps
          r["$session_id"] = session_id;

          return r;
        });

      run_multi_stmt(this._db, stmt, insert_rows, next);
    }
  }

  class DbSpatial {

    constructor(handler) {
      this._db = handler._db;
    }

    add(session_id, rows, next) {
      // nothing to add, so don't bother with database stuff
      if (rows.length <= 0) {
        return next(null, rows.length);
      }

      const stmt = this._db.prepare("INSERT INTO spatial_data(session_id, start_ms, end_ms," +
        " x, y, zoom, alpha, beta, gamma)" +
        " VALUES ($session_id, $start, $end, $x, $y, $zoom, $alpha, $beta, $gamma)");

      const insert_rows = rows.map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .map(r => {
          r["$start"] = moment(r["$start"]).valueOf()/1000.0; // fix timestamps
          r["$end"] = moment(r["$end"]).valueOf()/1000.0;

          r["$session_id"] = session_id;

          return r;
        });

      run_multi_stmt(this._db, stmt, insert_rows, next);
    }
  }

  class Db {

    // Simple callback for creating a db
    static from_path(args, next) {

    }

    /**
     * Creates a
     * @param args
     * @param next Callback when completed creation
     */
    constructor(args) {
      if (args.db_handle) {

        this._db = args.db_handle;
      } else if (args.path) {
        // from a file path
        w.info(`Opening a new Database connection: ${args.path}`);
        if (!args.path) {
          next(new Error('Invalid database path specified'));
        }

        // Create a new 'db' database.
        // It's okay to just throw the error here since this only happens at init time.
        this._db = new sqlite3.Database(args.path, err => {
          if (err) throw err;
        });

        this._db.on('trace', query => {
          w.info(`[${args.path}] Running query: ${query}`);
        });
      }

      if (!args.timeout) {
        args.timeout = 5 * 60;
      }

      this._TIMEOUT_INTERVAL = args.timeout;

      this._updateInterval = null;

      const update_closed = () => {
        // Run a database query to try to end all open sessions that are open longer than
        if (this.isOpen()) {
          this.session.end_open(this._TIMEOUT_INTERVAL, err => {
            if (err) {
              clearTimeout(this._updateInterval);

              throw err;
            }
          });
        } else {
          clearTimeout(this._updateInterval);
        }
      };

      this._updateInterval = setInterval(update_closed, (this._TIMEOUT_INTERVAL / 2.0) * 1000);
    }

    get filename() {
      return this._db.filename;
    }

    runScript(scriptName, next) {
      w.debug(`[${this.filename}] Running script: ${scriptName}`);

      fs.readFile(__dirname + `/sql/${scriptName}.sql`, (err, data) => {
        if (err) {
          return next(err);
        }

        this._db.exec(data.toString(), err => {
          return next(err, this);
        });
      });
    }

    init(next) {
      let runInit = () => {
        w.info(`[${this.filename}] Initializing database`);

        return this.runScript('init', next);
      };

      this._db.get("SELECT uuid FROM session_data WHERE 1=1 LIMIT 1", err => {
        if (err) {
          if (err.code === 'SQLITE_ERROR' && err.message.indexOf('no such table') !== -1) {
            return runInit();
          } else {
            next(err);
          }
        }

        return next(null, this);
      });
    }

    nuke(next) {
      w.info(`[${this.filename}] Nuking database tables`);

      return this.runScript('nuke', next);
    }

    /**
     * Delete all of the contents of the tables
     * @param next
     * @returns Result of #runScript(String, function)
     */
    purge(next) {
      w.info(`[${this.filename}] Purging database tables`);

      return this.runScript('purge', next);
    }

    isOpen() {
      return !!this._db;
    }

    close(next) {
      this._db.close(err => {
        this._db = null;

        return next(err);
      });
    }

    get session() {
      return new DbSession(this);
    }

    get click() {
      return new DbClick(this);
    }

    get spatial() {
      return new DbSpatial(this);
    }
  }

  return Db;
};
