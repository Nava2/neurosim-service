'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const bodyParser = require('body-parser');

const w = require('winston');

w.add(w.transports.File, {
    name: 'debug-file',
    filename: 'neurosim-debug.log',
    level: 'debug'
  });

const moment = require('moment');
const _ = require('lodash');

const dblib = require(__dirname + '/../lib/db')(w);

// Init the express api

module.exports = (argv, postInit) => {

  if (argv.quiet) {
    w.level = 'warn';
  } else {
    w.level = argv['log-level'];
  }

  let app = express();
  let db = argv.database;

  app.use(logger('dev'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.set('view engine', 'pug');

  function initApp(err, db) {

    if (err) throw err;

    app.route('/', (req, res) => {
      res.status(404);
      res.send();
    });

    app.set('db', db);

    app.post('/session/new', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const userId = req.body.userId;
      const startTime = moment(req.body.start.trim()).valueOf();
      const model = req.body.model.toLowerCase().trim();

      let meta = {
        userId: userId,
        start: startTime,
        model: model
      };

      db.session.create(meta, (err, uuid) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        w.info(`Created new session: ${uuid}`);
        return res.send(uuid);
      });
    });

    app.post('/session/end/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;
      let end_time;
      if (_.isString(req.body.end)) {
        end_time = moment(req.body.end.trim()).valueOf();
      } else if (_.isInteger(req.body.end)) {
        end_time = moment(req.body.end).valueOf();
      }

      if (!end_time) {
        return res.status(403).send(`No end-time specified.`);
      }

      db.session.exists_open(sessionId, (err, exists) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        if (!exists) {
          return res.status(403).send(`Session ID (${sessionId}) does not exist.`);
        } else if (exists === 'closed') {
          return res.status(403).send(`Session ID (${sessionId}) is already closed.`);
        } else {
          db.session.end(sessionId, end_time, err => {
            if (err) {
              return res.status(403).send(err.message);
            }

            return res.send(sessionId);
          });
        }
      });
    });


    app.post('/spatial/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;
      const data = req.body.data;

      db.session.exists_open(sessionId, (err, exists) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        if (!exists) {
          return res.status(403).send(`Session ID (${sessionId}) does not exist.`);
        } else if (exists === 'closed') {
          return res.status(403).send(`Session ID (${sessionId}) is closed.`);
        } else {
          db.spatial.add(sessionId, data, err => {
            if (err) {
              return res.status(403).send(err.message);
            }

            return res.send(`${data.length}`);
          });
        }
      });
    });

    app.post('/click/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;
      const data = req.body.data;

      db.session.exists_open(sessionId, (err, exists) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        if (!exists) {
          return res.status(403).send(`Session ID (${sessionId}) does not exist.`);
        } else if (exists === 'closed') {
          return res.status(403).send(`Session ID (${sessionId}) is closed.`);
        } else {
          db.click.add(sessionId, data, err => {
            if (err) {
              return res.status(403).send(err.message);
            }

            return res.send(`${data.length}`);
          });
        }
      });
    });

    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
      let err = new Error('Not Found');
      err.status = 404;
      next(err);
    });

    // error handlers

    // development error handler
    // will print stacktrace
    if (app.get('env') === 'development') {
      app.use(function(err, req, res) {
        res.status(err.status || 500);
        res.render('error', {
          message: err.message,
          error: err
        });
      });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res) {
      res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: {}
      });
    });

    if (_.isFunction(postInit)) {
      postInit(app);
    }
  }

  if (_.isString(argv.database)) {
    db = new dblib({
      path: argv.database,
      timeout: argv.timeout
    });
  } else {
    db = new dblib({
      db_handle: argv.database,
      timeout: argv.timeout
    });
  }

  (function initDatabase() {

    // make sure the app gets initialized properly
    function next(err, db) {
      if (err) {
        return initApp(err);
      }

      return db.init(initApp);
    }

    if (argv.purge) {
      db.purge(err => {
        if (err && err.code != 'ENOENT') {
          return next(err, null);
        }

        return next(null, db);
      });
    } else if (argv.debug) {
      db.purge(err => {
        if (err && err.code != 'ENOENT') {
          return next(err, null);
        }

        return next(null, db);
      });
    } else {
      return next(null, db);
    }
  })();

  return app;
};
