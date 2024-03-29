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

function new_server(next) {
  dbHandle = new sqlite3.Database(':memory:');

  return test_server({
    database: dbHandle
  }, next);
}

const START_TIME = moment("2012-04-05T12:02:32.022");

function createSession(userId, app, next) {
  let data = {
    "start": START_TIME,
    "userId": userId,
    "modelId": "demo_model"
  };

  chai.request(app)
    .post('/session/new')
    .send(data)
    .end((err, res) => {
      res.should.have.status(200);

      const UUID_REG = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
      res.text.should.match(UUID_REG);

      next(res.text);
    });
}

describe('tooltip', () => {
  let app = null;
  let uuid = null;

  beforeEach(done => {
    new_server(newApp => {
      app = newApp;

      createSession("demo", newApp, newId => {
        uuid = newId;
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
        "objectId": "lobe",
        "start": START_TIME.clone().add(1, 'm'),
        "end": START_TIME.clone().add(1, 'm').add(23, 's'),
        "start_x": 20.0,
        "start_y": 23.0,
        "end_x": 40.0,
        "end_y": 50.0
      },

      {
        "objectId": "lobe",
        "start": START_TIME.clone().add(3, 'm'),
        "end": START_TIME.clone().add(3, 'm').add(23, 's'),
        "start_x": 41.0,
        "start_y": 49.0,
        "end_x": 32.0,
        "end_y": 32.0
      },
      {
        "objectId": "lobe",
        "start": START_TIME.clone().add(3, 'm').add(23, 's'),
        "end": START_TIME.clone().add(5, 'm'),
        "start_x": 41.0,
        "start_y": 49.0,
        "end_x": 32.0,
        "end_y": 32.0
      }
    ]
  };

  function verify_good_data(done) {
    dbHandle.all('SELECT * FROM tooltip_data WHERE session_id=? ORDER BY start_ms', uuid,
      (err, rows) => {
        if (err) throw err;

        _.zip(rows, GOOD_DATA.data).forEach(arr => {
          let a = arr[0];
          let e = arr[1];

          expect(a.session_id).to.equal(uuid);

          expect(a.start_ms).to.equal(e.start.valueOf());
          expect(a.end_ms).to.equal(e.end.valueOf());

          expect(a.start_x).to.equal(e.start_x);
          expect(a.start_y).to.equal(e.start_y);

          expect(a.end_x).to.equal(e.end_x);
          expect(a.end_y).to.equal(e.end_y);
        });

        done();
      });

  }

  it('should add tooltip data points to a session on /tooltip/<id> POST', done => {
    chai.request(app)
      .post(`/tooltip/${uuid}`)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal("3");

        verify_good_data(done);
      });
  });

  it('should fail to add data points to a non-existant session on /tooltip/<id> POST', done => {
    // uuid that doesn't exist
    const bad_uuid = require('uuid').v1();

    chai.request(app)
      .post('/tooltip/' + bad_uuid)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(403);
        res.text.should.equal(`Session ID (${bad_uuid}) does not exist.`);

        done();
      });
  });

  it('should fail to add non-unique data points to a session on /tooltip/<id> POST', done => {
    // make bad data with a duplicate value
    let bad_data = _.cloneDeep(GOOD_DATA);
    bad_data.data.push(bad_data.data[0]);

    chai.request(app)
      .post(`/tooltip/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT:/);

        done();
      });
  });


  it('should fail to add data points to an ended session on /tooltip/<id> POST', done => {

    // Close the session via /session/end/:uuid
    chai.request(app)
      .post(`/session/end/${uuid}`)
      .send({
        end: START_TIME.clone().add(10, 's')
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        // now try to add mouse data
        chai.request(app)
          .post(`/tooltip/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(403);

            res.text.should.equal(`Tried to insert data that is older than session (ID: ${uuid}).`);

            done();
          });
      });
  });

  it('should add data points to an ended session on /tooltip/<id> POST if they are before end', done => {

    // Close the session via /session/end/:uuid
    chai.request(app)
      .post(`/session/end/${uuid}`)
      .send({
        end: START_TIME.clone().add(1, 'h')
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        // now try to add mouse data
        chai.request(app)
          .post(`/tooltip/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(200);

            res.text.should.equal(`${GOOD_DATA.data.length}`);

            done();
          });
      });
  });

  it('should fail to add malformed data to a session on /tooltip/<id> POST', done => {

    let bad_data = _.cloneDeep(GOOD_DATA);
    delete bad_data.data[0]['start'];

    chai.request(app)
      .post(`/tooltip/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/"start" is required/);

        done();
      });

  });

  it('After an error, correct requests should pass /tooltip/<id> POST', done => {

    let bad_data = _.cloneDeep(GOOD_DATA);
    bad_data.data[0]['asdf'] = moment(moment.now()).toISOString();

    chai.request(app)
      .post(`/tooltip/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/"asdf" is not allowed/);

        chai.request(app)
          .post(`/tooltip/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(200);
            res.text.should.equal("3");

            verify_good_data(done);
          });
      });

  });

  it('should not add overlapping time interval data', done => {
    let bad_data = _.cloneDeep(GOOD_DATA);
    bad_data.data[1].start = bad_data.data[0].start.add(6, 's');

    chai.request(app)
      .post(`/tooltip/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);
        res.text.should.match(/^SQLITE_CONSTRAINT:/);
        res.text.should.match(/.*overlap.*/);

        done();
      });
  });

  it('multiple users are the same time should not be problematic', done => {
    let data = {
      "data": [{
        "objectId": "Skull",
        "start": "2017-05-23T13:43:36.1150000-04:00",
        "end": "2017-05-23T13:43:36.1970000-04:00",
        "start_x": 566.0,
        "start_y": 356.0,
        "end_x": 502.0,
        "end_y": 330.0
      }, {
        "objectId": "Left Facial Artery",
        "start": "2017-05-23T13:43:36.1990000-04:00",
        "end": "2017-05-23T13:43:36.2820000-04:00",
        "start_x": 502.0,
        "start_y": 330.0,
        "end_x": 476.0,
        "end_y": 302.0
      }]
    };


    let otherUUID;

    let next = () => {
      chai.request(app)
        .post(`/tooltip/${uuid}`)
        .send(data)
        .end((err, res) => {
          res.should.have.status(200);
          res.text.should.equal("" + data.data.length);

          chai.request(app)
            .post(`/tooltip/${otherUUID}`)
            .send(data)
            .end((err, res) => {
              res.should.have.status(200);
              res.text.should.equal("" + data.data.length);
              done();
            });
        });
    };

    createSession("demo2", app, newUUID => {
      otherUUID = newUUID;

      next();
    });

  });

});
