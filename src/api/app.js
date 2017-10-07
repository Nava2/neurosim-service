'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const bodyParser = require('body-parser');

const cors = require('cors');
const Joi = require('joi');

const jsonlint = require("jsonlint-mod");
const jsonFormatter = require('jsonlint-mod/lib/formatter');

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


const OBJECT_ID_SCHEMA = Joi.string().min(2)
  .description('Object identifier interacted with.')
  .required();

const SPATIAL_POSITION_SCHEMA = Joi.object({
  'x': Joi.number()
    .description('X position')
    .required(),
  'y': Joi.number()
    .description('Y position')
    .required(),
  'zoom': Joi.number()
    .description('Zoom position')
    .required(),
  'alpha': Joi.number()
    .description('Camera alpha angle')
    .required(),
  'beta': Joi.number()
    .description('Camera beta angle')
    .required(),
  'gamma': Joi.number()
    .description('Camera gamma angle')
    .required(),
}).required();

const TIMESTAMP_SCHEMA = Joi.date().iso()
  .required();

module.exports = (argv, postInit) => {

  let app = express();
  let db = argv.database;

  app.use(logger('dev'));
  app.use(bodyParser.json({
    verify: (req, res, buf, encoding) => {
      const fromBuffer = buf.toString(encoding);
      try {
        jsonlint.parse(fromBuffer);
      } catch (e) {
        if (process.env['NODE_ENV'] !== 'production') {
          const json = jsonFormatter.formatter.formatJson(fromBuffer, '  ');
          const fromError = e.message;

          // Now that an error happened, we need to extract the "context" of the error
          // so we get a pretty message for developers to debug.
          const lineNo = Number.parseInt(/line\s+(\d+)$/.exec(fromError)[1]);

          const lines = json.split('\n');

          const COUNT = Math.min(11, lines.length);
          const HALF_COUNT = Math.floor(COUNT / 2);
          const sIdx = Math.min(Math.max(0, lineNo - HALF_COUNT), lines.length - COUNT);
          const focus = lines.slice(sIdx, sIdx + COUNT)
              .map((line, i) => {
                const lIdx = i + sIdx;
                if (lIdx !== lineNo) {
                  return `${lIdx}:\t${line}`;
                } else {
                  return `>>>\t${line}`;
                }
              });

          const withContext = `${fromError}:\n${focus.join('\n')}`;
          throw new Error(withContext);
        } else {
          // in prod, rethrow e
          throw e;
        }
      }
    },
  }));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(cors({
    allowedOrigins: ['*'],
    methods: ['POST', 'OPTIONS'],
    headers: ['Content-Type', 'Content-Length']
  }));

  app.set('view engine', 'pug');

  function initApp(err, db) {

    if (err) throw err;

    app.route('/', (req, res) => {
      res.status(404);
      res.send();
    });

    app.set('db', db);

    const SESSION_START_SPEC = Joi.object({
      'userId': Joi.string().regex(/^[a-zA-Z]{2,6}\d*$/)
        .description('User UWO ID.')
        .lowercase()
        .trim()
        .required(),
      'modelId': Joi.string().min(1)
        .description('Model name')
        .lowercase()
        .trim()
        .required(),
      'start': TIMESTAMP_SCHEMA.description('Start of the session'),
    });
    app.options('/session/new');
    app.post('/session/new', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      Joi.validate(req.body, SESSION_START_SPEC, (err, body) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        const { userId, modelId } = body;
        const start = moment(body.start).valueOf();

        let meta = {
          userId,
          start,
          modelId,
        };

        db.session.create(meta, (err, uuid) => {
          if (err) {
            return res.status(403).send(err.message);
          }

          w.info(`Created new session: ${uuid}`);
          return res.send(uuid);
        });
      });
    });

    const SESSION_END_SPEC = Joi.object({
      'end': TIMESTAMP_SCHEMA.description('End time of the session'),
    });
    app.options('/session/end/:uuid');
    app.post('/session/end/:uuid', (req, res) => {
      req.accepts('json');
      res.type('text');

      const sessionId = req.params.uuid;

      Joi.validate(req.body, SESSION_END_SPEC, (err, body) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        const endTime = moment(req.body.end);

        db.session.check_end(sessionId, endTime, err => {
          if (err) {
            return res.status(403).send(err.message);
          }

          db.session.end(sessionId, endTime, err => {
            if (err) {
              return res.status(403).send(err.message);
            }

            return res.send(sessionId);
          });
        });
      });


    });

    const SPATIAL_SPEC = Joi.object({
      data: Joi.array()
        .description('Array of data entries for spatial input')
        .items(SPATIAL_POSITION_SCHEMA.concat(Joi.object({
          'objectId': OBJECT_ID_SCHEMA,
          'start': TIMESTAMP_SCHEMA.description('Start time'),
          'end': TIMESTAMP_SCHEMA.description('End time'),
        }))).required(),
    });
    app.options('/spatial/:uuid');
    app.post('/spatial/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;
      Joi.validate(req.body, SPATIAL_SPEC, (err, body) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        db.spatial.add(sessionId, body.data, err => {
          if (err) {
            w.error(err);
            return res.status(403).send(err.message);
          }

          return res.send(`${body.data.length}`);
        });
      });
    });

    // Joi schema for Score data
    const SCORE_SPEC = Joi.object({
      data: Joi.array()
        .description('Array of data entries for score inputs')
        .items(Joi.object({
          'objectId': OBJECT_ID_SCHEMA,
          'actual': SPATIAL_POSITION_SCHEMA.description('Actual score position'),
          'expected': SPATIAL_POSITION_SCHEMA.description('Expected score position'),
        })).required(),
    }).description('Tooltip Data');
    app.options('/score/:uuid');
    app.post('/score/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;
      Joi.validate(req.body, SCORE_SPEC, (err, body) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        db.score.add(sessionId, body.data, err => {
          if (err) {
            return res.status(403).send(err.message);
          }

          return res.send(`${body.data.length}`);
        });
      });

    });

    // Joi schema for Tooltip data
    const TOOLTIP_SPEC = Joi.object({
      data: Joi.array()
        .description('Array of data entries for tooltip inputs')
        .items(Joi.object({
          'start': TIMESTAMP_SCHEMA.description('Time the event started'),
          'end': TIMESTAMP_SCHEMA.description('Time the event ended'),
          'start_x': Joi.number()
            .description('Starting X position')
            .required(),
          'start_y': Joi.number()
            .description('Starting Y position')
            .required(),
          'end_x': Joi.number()
            .description('Starting X position')
            .required(),
          'end_y': Joi.number()
            .description('Starting Y position')
            .required(),
          'objectId': OBJECT_ID_SCHEMA,
        })).required(),
    }).description('Tooltip Data');

    app.options('/tooltip/:uuid');
    app.post('/tooltip/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;

      Joi.validate(req.body, TOOLTIP_SPEC, (err, body) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        const data = body.data;
        db.tooltip.add(sessionId, data, err => {
          if (err) {
            w.error(err);
            return res.status(403).send(err.message);
          }

          return res.send(`${data.length}`);
        });
      });
    });

    // Joi schema for Mouse data
    const MOUSE_SPEC = Joi.object({
      data: Joi.array()
        .description('Array of data entries for mouse inputs')
        .items(Joi.object({
          'timestamp': TIMESTAMP_SCHEMA
            .description('Time the event occurred'),
          'objectId': Joi.string().min(3)
            .description('Object identifier interacted with.')
            .required(),
          'downUp': Joi.number().min(0)
            .description('Mouse action performed.')
            .required()
        })).required(),
    }).description('Mouse Data');
    app.options('/mouse/:uuid');
    app.post('/mouse/:uuid', (req, res) => {
      req.accepts('application/json');
      res.type('text');

      const sessionId = req.params.uuid;

      Joi.validate(req.body, MOUSE_SPEC, (err, body) => {
        if (err) {
          return res.status(403).send(err.message);
        }

        const data = body.data;

        db.mouse.add(sessionId, data, err => {
          if (err) {
            return res.status(403).send(err.message);
          }

          return res.send(`${data.length}`);
        });
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
        if (err && err.code !== 'ENOENT') {
          return next(err, null);
        }

        return next(null, db);
      });
    } else if (argv.debug) {
      db.purge(err => {
        if (err && err.code !== 'ENOENT') {
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
