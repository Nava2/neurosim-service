var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');


const w = require('winston');
const moment = require('moment');

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
  argv.database = './student-data.debug.db';
} else {
  argv.database = './student-data.db';
}

// Init the express server

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const STREAM_TABLE_MAPPING = {
  'click': 'click_data',
  'position': 'position_data',
  'rotation': 'rotation_data'
};

function initApp() {

  dblib.create_db(argv.database, (err, db) => {
    if (err) throw err;

    /**
     {
        "start": "2016-04-05T",
        "end": "2016-04-05T",
        "stream": "click",
        "userId": "kbright2",
        "model": "brain_3d",
        "data": [
            {
                "timestamp": "2016....",
                "button": "button_id"
            },

            { // position
                "timestamp": "2016....",
                "x": 20.0,
                "y": 23.4,
                "z": 32.4
            },

            {   // rotation
                "timestamp": "234sfsadf",
                "x": 234.0,
                "y": 234.0
            }
        ]
    }
     */
    app.post('/session', (req, res) => {

      req.accepts('application/json');

      const userId = req.body.userId;
      const startTime = moment(req.body.start.trim()).valueOf();
      const endTime = moment(req.body.end.trim()).valueOf();
      const stream = req.body.stream.toLowerCase().trim();
      const model = req.body.model.toLowerCase().trim();
      const data = req.body.data.map(v => {
        v.timestamp = moment(v.timestamp.trim()).valueOf();
        return v;
      });

      let table = STREAM_TABLE_MAPPING[stream];
      if (!table) {
        res.status(403).json({
          success: false,
          error: `Unknown stream: ${stream}`
        });

        return;
      }

      let meta = {
        userId: userId,
        start: startTime,
        end: endTime,
        model: model
      };

      dblib.insertInto(db, 'session', meta, [], err => {
        if (err) {
          return res.status(403).json({
            success: false,
            error: err.toString()
          });
        }

        dblib.insertInto(db, stream, meta, data, err => {
          if (err) {
            return res.status(403).json({
              success: false,
              error: err.toString()
            });
          }

          return res.json({
            success: true
          });
        });
      });

    });

    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
      var err = new Error('Not Found');
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


  });
}

if (argv.debug) {
  dblib.delete_db(argv.database, err => {
    if (err && err.code != 'ENOENT') throw err;

    initApp();
  });
} else {
  initApp();
}


module.exports = app;
