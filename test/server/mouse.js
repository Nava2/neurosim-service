'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');

const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();
const _ = require('lodash');

const should = chai.should();
const expect = chai.expect;

chai.use(chaiHttp);

const test_server = require(__dirname + '/../../src/server/app');

let dbHandle;

function new_server(next) {
  dbHandle = new sqlite3.Database(':memory:');

  return test_server({
    database: dbHandle
  }, next);
}

describe('mouse', function() {

  const UUID_REG = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

  let app = null;
  let uuid = null;

  const START_TIME = moment("2016-04-05T12:02:32.022");

  let sessionData = {
    "start": START_TIME,
    "userId": "demo",
    "modelId": "demo_model"
  };

  beforeEach(done => {
    new_server(newApp => {
      app = newApp;
      chai.request(app)
        .post('/session/new')
        .send(sessionData)
        .end((err, res) => {
          res.should.have.status(200);
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

  const GOOD_DATA = {
    "data": [
      {
        "timestamp": START_TIME.clone().add(2, 'm'),
        "objectId": "button_id",
        "downUp": 1
      }, {
        "timestamp": START_TIME.clone().add(4, 'm'),
        "objectId": "button_id",
        "downUp": 0
      }
    ]
  };

  function verify_good_data(done) {
    dbHandle.all('SELECT * FROM mouse_data WHERE session_id=? ORDER BY time_ms', uuid,
      (err, rows) => {
        if (err) throw err;

        _.zip(rows, GOOD_DATA.data).forEach(arr => {
          let a = arr[0];
          let e = arr[1];

          expect(a.session_id).to.equal(uuid);
          expect(a.time_ms).to.equal(e.timestamp.valueOf());
          expect(a.button_id).to.equal(e.button);
        });

        done();
      });
  }

  it('should add mouse data points to a session on /mouse/<id> POST', done => {
    chai.request(app)
      .post('/mouse/' + uuid)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal("2");

        verify_good_data(done);
      });
  });

  it('should add mouse data points to a session on /mouse/<id> POST after end is passed', done => {
    let end_time = moment(sessionData.start).add(5, 'day');

    chai.request(app)
      .post('/session/end/' + uuid)
      .send({ end: end_time })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        chai.request(app)
          .post('/mouse/' + uuid)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(200);
            res.text.should.equal("2");

            verify_good_data(done);
          });
      });
  });

  it('should fail to add data points to a non-existant session on /mouse/<id> POST', done => {
    // uuid that doesn't exist
    const bad_uuid = require('uuid').v1();

    chai.request(app)
      .post('/mouse/' + bad_uuid)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(403);
        res.text.should.equal(`Session ID (${bad_uuid}) does not exist.`);

        done();
      });
  });

  it('should fail to add non-unique data points to a session on /mouse/<id> POST', done => {
    // make bad data with a duplicate value
    let bad_data = _.cloneDeep(GOOD_DATA);
    bad_data.data.push(bad_data.data[0]);

    chai.request(app)
      .post('/mouse/' + uuid)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: UNIQUE constraint failed:/);

        done();
      });
  });


  it('should fail to add data points to an ended session on /mouse/<id> POST', done => {
    // Close the session via /session/end/:uuid
    const end_time = START_TIME.clone().add(1, 's');

    chai.request(app)
      .post('/session/end/' + uuid)
      .send({
        end: end_time
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        // now try to add mouse data
        chai.request(app)
          .post('/mouse/' + uuid)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(403);
            res.text.should.equal(`Tried to insert data that is older than session (ID: ${uuid}).`);

            done();
          });
      });
  });

  it('should fail to add malformed data to a session on /mouse/<id> POST', done => {

    let bad_data = _.cloneDeep(GOOD_DATA);
    delete bad_data.data[0]['timestamp'];

    chai.request(app)
      .post(`/mouse/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: NOT NULL constraint failed:/);

        done();
      });

  });

  it('After an error, correct requests should pass /mouse/<id> POST', done => {

    let bad_data = _.cloneDeep(GOOD_DATA);
    delete bad_data.data[0]['timestamp'];

    chai.request(app)
      .post(`/mouse/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: NOT NULL constraint failed:/);

        chai.request(app)
          .post(`/mouse/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(200);
            res.text.should.equal("2");

            verify_good_data(done);
          });
      });

  });
});
