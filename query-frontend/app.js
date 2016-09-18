var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

const sqlite3 = require('sqlite3').verbose();
const w = require('winston');
const moment = require('moment');

// const dblib = require('../server/db')(w);

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
  argv.database = '../server/student-data.debug.db';
} else {
  argv.database = '../server/student-data.db';
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

app.get('/', (req, res) => {
  res.redirect('/query');
});

const db = new sqlite3.Database(argv.database);

app.get('/query', (req, res) => {
  res.render('query', {
    "queryStr": '',
    "rowHeaders": [],
    "rows": []
  });
});

app.post('/query', (req, res, next) => {

  let queryStr = req.body.query || '';

  function render(err, rows) {
    if (err) {
      return res.render('query', {
        "queryStr": queryStr,
        "error": err
      });
    }

    let headers = [];
    if (rows.length > 0) {
      headers = Object.keys(rows[0]);
    }

    res.render('query', {
      "queryStr": queryStr,
      "rowHeaders": headers,
      "rows": rows
    });
  }

  if (queryStr) {

    // Query the database
    db.all(queryStr, (err, rows) => {
      render(err, rows);
    });

  } else {
    render(null, []);
  }


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

module.exports = app;
