'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');

const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();
const _ = require('lodash');

const should = chai.should();
const expect = chai.expect;

chai.use(chaiHttp);

const test_server = require(__dirname + '/../../src/api/app');

let dbHandle;

const TIMEOUT_SECS = 0.250;

function new_server(next) {
  dbHandle = new sqlite3.Database(':memory:');

  return test_server({
    database: dbHandle,
    timeout: TIMEOUT_SECS
  }, next);
}

describe('db.session_end', function() {
  let app = null;
  let uuid = null;

  beforeEach(done => {
    let data = {
      "start": moment("2016-04-05T12:02:32.022"),
      "userId": "demo",
      "model": "demo_model"
    };

    new_server(newApp => {
      app = newApp;
      chai.request(app)
        .post('/session/new')
        .send(data)
        .end((err, res) => {
          res.should.have.status(200);

          const UUID_REG = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
          res.text.should.match(UUID_REG);

          uuid = res.text;

          done();
        });
    });
  });

  afterEach(done => {
    app.get('db').close(err => {
      if (err) throw err;

      done();
    });
  });

  it('with a timeout for sessions of 15s, after 20s the session should close', done => {
    setTimeout(() => {
      dbHandle.all('SELECT * FROM session_data WHERE uuid=? AND end_ms NOT NULL ORDER BY start_ms', uuid,
        (err, rows) => {
          if (err) throw err;

          expect(rows.length).to.equal(1);
          done();
        });
    }, TIMEOUT_SECS * 1.5 * 1000);
  });
});
