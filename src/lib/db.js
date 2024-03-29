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
   * @param next
   */
  function run_multi_stmt(db, stmt, rows, next) {
    if (rows.length <= 0) {
      return next(null, rows.length);
    }

    let finalized = false;
    const finalize = (err) => {
      if (!finalized) {
        stmt.finalize((f_err) => {
          finalized = true;
          next(err || f_err, rows.length);
        });
      }
    };

    const handleErr = (err) => {
      if (err) {
        return finalize(err);
      }
    };
    db.serialize(() => {
      db.exec("BEGIN TRANSACTION", handleErr);

      for (const row of rows) {
        stmt.run(row, handleErr);
      }

      db.exec("COMMIT TRANSACTION", finalize);
    });
  }

  class DbSession {

    constructor(handler) {
      this._db = handler._db;
    }

    create(meta, next) {
      const insert_stmt = this._db.prepare("INSERT OR ABORT INTO session_data(user_id, start_ms, end_ms, model_id, uuid) VALUES (?, ?, ?, ?, ?)");

      const new_uuid = uuid.v1();
      insert_stmt.run(meta.userId, meta.start, meta.end, meta.modelId, new_uuid, prev_err => {
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
      this._db.get("SELECT uuid FROM session_data WHERE user_id=? AND start_ms=? AND model_id=?",
                   meta.userId, meta.start, meta.modelId,
        (err, row) => {
          if (err) {
            return next(err, null);
          }

          if (!row) {
            return next(new Error(`Unknown uuid for: user_id=${meta.userId}, start=${meta.start}, model_id=${meta.modelId}`), null);
          }

          return next(null, row.uuid);
        });
    }

    /**
     * Checks if a uuid for a session is open
     * @param uuid
     * @param against {moment|Number} The time to check against (moment)
     * @param next
     */
    exists(uuid, next) {
      this._db.get("SELECT end_ms FROM session_data WHERE uuid=?", uuid, (err, row) => {
        if (err) return next(err);
        if (!row) {
          return next(new Error(`Session ID (${uuid}) does not exist.`));
        }

        return next(null, true);
      });
    }

    /**
     * Checks if a uuid for a session is open
     * @param uuid
     * @param against {moment|Number} The time to check against (moment)
     * @param next
     */
    check_end(uuid, against, next) {
      const checkAgainst = moment.isMoment(against) ? against.valueOf() : against;

      this._db.get("SELECT end_ms FROM session_data WHERE uuid=?", uuid, (err, row) => {
        if (err) return next(err);
        if (!row) {
          return next(new Error(`Session ID (${uuid}) does not exist.`));
        }

        if (!row["end_ms"] || moment(row.end_ms).valueOf() >= checkAgainst) {
          return next(null);
        } else {
          return next(new Error(`Tried to insert data that is older than session (ID: ${uuid}).`))
        }
      });
    }

    /**
     * Ends a session
     *
     * @param session_id {String}
     * @param end_time {moment|Number}
     * @param next {Function}
     */
    end(session_id, end_time, next) {
      this._db.run("UPDATE session_data SET end_ms=$end WHERE uuid=$session_id", {
        $end: moment.isMoment(end_time) ? end_time.valueOf() : end_time,
        $session_id: session_id
      }, next);
    }

    end_open(timeout_s, next) {
      this._db.run("UPDATE session_data SET end_ms=(SELECT ms FROM get_now) " +
        "WHERE session_data.uuid IN (SELECT session_id FROM last_update_for_uuid WHERE from_now > ?)",
        timeout_s * 1000.0,
        next);
    }
  }



  class DbMouse {

    constructor(handler) {
      this._parent = handler;
      this._db = handler._db;
    }

    add(session_id, rows, next) {
      // nothing to add, so don't bother with database stuff
      if (rows.length <= 0) {
        return next(null, rows.length);
      }

      const max_time = _.reduce(rows.map(r => (moment(r.timestamp).valueOf())),
        (v, n) => (Math.max(v, n)), 0);

      const insert_rows = rows.map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .map(r => {
          r["$timestamp"] = r["$timestamp"] ? moment(r["$timestamp"]).valueOf() : null; // fix timestamps
          r["$session_id"] = session_id;

          return r;
        });

      this._parent.session.check_end(session_id, max_time, err => {
        if (err) {
          return next(err);
        }

        const stmt = this._db.prepare("INSERT INTO mouse_data" +
          "(session_id, time_ms, object_id, down_up) " +
          "VALUES ($session_id, $timestamp, $objectId, $downUp)");
        run_multi_stmt(this._db, stmt, insert_rows, next);
      });
    }
  }

  class DbSpatial {

    constructor(handler) {
      this._db = handler._db;
      this._parent = handler;
    }

    add(session_id, rows, next) {
      // nothing to add, so don't bother with database stuff
      if (rows.length <= 0) {
        return next(null, rows.length);
      }

      const max_time = _.reduce(rows.map(r => Math.max(moment(r.start).valueOf(), moment(r.end).valueOf())),
        (v, n) => (Math.max(v, n)), 0);

      const insert_rows = rows.map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .map(r => {
          r["$start"] = moment(r["$start"]).valueOf(); // fix timestamps
          r["$end"] = moment(r["$end"]).valueOf();

          r["$session_id"] = session_id;

          return r;
        });

      this._parent.session.check_end(session_id, max_time, err => {
        if (err) {
          return next(err);
        }

        const stmt = this._db.prepare("INSERT INTO spatial_data(session_id, object_id, start_ms, end_ms," +
          " x, y, zoom, alpha, beta, gamma)" +
          " VALUES ($session_id, $objectId, $start, $end, $x, $y, $zoom, $alpha, $beta, $gamma)");
        run_multi_stmt(this._db, stmt, insert_rows, next);
      });
    }
  }

  class DbScore {

    constructor(handler) {
      this._db = handler._db;
      this._parent = handler;
    }

    add(session_id, rows, next) {
      // nothing to add, so don't bother with database stuff
      if (rows.length <= 0) {
        return next(null, rows.length);
      }


      const insert_rows = rows
        .map(r => {
          let out = { objectId: r.objectId };
          _.extend(out, _.fromPairs(_.map(r.expected, (value, key) => ["e_" + key, value])));
          _.extend(out, _.fromPairs(_.map(r.actual, (value, key) => ["a_" + key, value])));

          return out;
        })
        .map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .map(r => {
          r["$session_id"] = session_id;

          return r;
        });

      this._parent.session.exists(session_id, err => {
        if (!!err) {
          return next(err);
        }

        const stmt = this._db.prepare("INSERT INTO score_data(session_id, object_id, " +
          " e_x, e_y, e_zoom, e_alpha, e_beta, e_gamma," +
          " a_x, a_y, a_zoom, a_alpha, a_beta, a_gamma)" +
          " VALUES ($session_id, $objectId, " +
          "$e_x, $e_y, $e_zoom, $e_alpha, $e_beta, $e_gamma, " +
          "$a_x, $a_y, $a_zoom, $a_alpha, $a_beta, $a_gamma" +
          ")");
        run_multi_stmt(this._db, stmt, insert_rows, next);
      });
    }
  }

  class DbTooltip {

    constructor(handler) {
      this._db = handler._db;
      this._parent = handler;
    }

    add(session_id, rows, next) {
      // nothing to add, so don't bother with database stuff
      if (rows.length <= 0) {
        return next(null, rows.length);
      }

      const max_time = _.reduce(rows.map(r => Math.max(moment(r.start).valueOf(), moment(r.end).valueOf())),
        (v, n) => (Math.max(v, n)), 0);

      const insert_rows = rows.map(r => (_.mapKeys(r, (v, k) => ("$" + k))))
        .map(r => {
          r["$start"] = moment(r["$start"]).valueOf(); // fix timestamps
          r["$end"] = moment(r["$end"]).valueOf();

          r["$session_id"] = session_id;

          return r;
        });

      this._parent.session.check_end(session_id, max_time, err => {
        if (err) {
          return next(err);
        }

        const stmt = this._db.prepare("INSERT INTO tooltip_data(session_id, object_id, " +
          " start_ms, end_ms," +
          " start_x, start_y, " +
          " end_x, end_y)" +
          " VALUES ($session_id, $objectId, $start, $end, $start_x, $start_y, $end_x, $end_y)");
        run_multi_stmt(this._db, stmt, insert_rows, next);
      });
    }
  }

  class Db {

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
          w.debug(`[${args.path}] Running query: ${query}`);
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

      this._session = new DbSession(this);
      this._mouse = new DbMouse(this);
      this._spatial = new DbSpatial(this);
      this._score = new DbScore(this);
      this._tooltip = new DbTooltip(this);
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
      return this._session;
    }

    get mouse() {
      return this._mouse;
    }

    get spatial() {
      return this._spatial;
    }

    get score() {
      return this._score;
    }

    get tooltip() {
      return this._tooltip;
    }
  }

  return Db;
};
