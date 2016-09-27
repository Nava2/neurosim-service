'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const w = require('winston');
const moment = require('moment');
const _ = require('lodash');

const dblib = require('../lib/db')(w);

const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['debug'],
  string: ['database'],
  default: {
    'debug': false,
    'quiet': false,
    'log-level': 'info'
  }
});

if (argv.quiet) {
  w.level = 'warn';
} else {
  w.level = argv['log-level'];
}

if (argv.debug && !argv.database) {
  argv.database = __dirname + '/student-data.debug.db';
} else {
  argv.database = __dirname + '/student-data.db';
}

// Init the express server

let app = express();

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'pug');

function initApp(err, db) {

  if (err) throw err;

  app.route('/', (req, res) => {
    res.status(404);
    res.send();
  });

  app.post('/session/end/:uuid', (req, res) => {
    req.accepts('application/json');
    res.type('text');

    const sessionId = req.params.uuid;
    const end = _.isString(req.body.end) ? moment(req.body.end.trim()).valueOf() : null;

    if (!end) {
      return res.status(403).send(`false:No end-time specified.`);
    }

    dblib.session.open_exists(db, sessionId, (err, exists) => {
      if (err) {
        return res.status(403).send(`false:${err.message}`);
      }

      if (!exists) {
        return res.status(403).send(`false:Session ID (${sessionId}) does not exist.`);
      } else {
        dblib.session.set_end(db, sessionId, end, err => {
          if (err) {
            return res.status(403).send(`false:${err.message}`);
          }

          return res.send(`true:${sessionId}`);
        });
      }
    });
  });

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

    dblib.session.create(db, meta, (err, uuid) => {
      if (err) {
        return res.status(403).send(`${false}:${err.message}`);
      }

      w.info(`Created new session: ${uuid}`);
      return res.send(`true:${uuid}`);
    });
  });

  app.post('/spatial/:uuid', (req, res) => {
    req.accepts('application/json');
    res.type('text');

    const sessionId = req.params.uuid;
    const data = req.body.data;

    dblib.session.open_exists(db, sessionId, (err, exists) => {
      if (err) {
        return res.status(403).send(`false:${err.message}`);
      }

      if (!exists) {
        return res.status(403).send(`false:Session ID (${sessionId}) does not exist.`);
      } else {
        dblib.spatial.add(db, sessionId, data, err => {
          if (err) {
            return res.status(403).send(`false:${err.message}`);
          }

          return res.send(`true:${data.length}`);
        });
      }
    });
  });

  app.post('/click/:uuid', (req, res) => {
    req.accepts('application/json');
    res.type('text');

    const sessionId = req.params.uuid;
    const data = req.body.data;

    dblib.session.open_exists(db, sessionId, (err, exists) => {
      if (err) {
        return res.status(403).send(`false:${err.message}`);
      }

      if (!exists) {
        return res.status(403).send(`false:Session ID (${sessionId}) does not exist.`);
      } else {
        dblib.click.add(db, sessionId, data, err => {
          if (err) {
            return res.status(403).send(`false:${err.message}`);
          }

          return res.send(`true:${data.length}`);
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
    app.use(function(err, req, res, next) {
      res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: err
      });
    });
  }

  // production error handler
  // no stacktraces leaked to user
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: {}
    });
  });
}

dblib.open_db(argv.database, (err, db) => {
  if (err) throw err;

  function next(err, db) {
    if (err) {
      return initApp(err);
    }

    return dblib.init_db(db, initApp);
  }

  if (argv.debug) {
    dblib.delete_db(db, err => {
      if (err && err.code != 'ENOENT') {
        return next(err, null);
      }

      return next(null, db);
    });
  } else {
    return next(null, db);
  }
});



module.exports = app;
