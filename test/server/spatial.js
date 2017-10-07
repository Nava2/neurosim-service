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


describe('spatial', () => {
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

  function sampleData() {
    return {
      uuid,
      "data": [
        {
          "objectId": "2d",
          "start": START_TIME.clone().add(1, 'm'),
          "end": START_TIME.clone().add(1, 'm').add(23, 's'),
          "x": 20.0,
          "y": 23.4,
          "zoom": -1.0,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0
        },

        {
          "objectId": "3d",
          "start": START_TIME.clone().add(1, 'm'),
          "end": START_TIME.clone().add(1, 'm').add(23, 's'),
          "x": 20.0,
          "y": 23.4,
          "zoom": -1.0,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0
        },

        {
          "objectId": "3d",
          "start": START_TIME.clone().add(3, 'm'),
          "end": START_TIME.clone().add(3, 'm').add(23, 's'),
          "x": 20.0,
          "y": 23.4,
          "zoom": 32.4,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0
        },
        {
          "objectId": "3d",
          "start": START_TIME.clone().add(3, 'm').add(23, 's'),
          "end": START_TIME.clone().add(5, 'm'),
          "x": 20.0,
          "y": 23.4,
          "zoom": 3.4,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0
        }
      ]
    };
  }

  function verify_good_data(check, done) {
    dbHandle.all('SELECT * FROM spatial_data WHERE session_id=? ORDER BY start_ms, object_id', uuid,
      (err, rows) => {
        if (err) throw err;

        _.zip(rows, check.data).forEach(arr => {
          let a = arr[0];
          let e = arr[1];

          expect(a.object_id).to.equal(e.objectId);
          expect(a.start_ms).to.equal(e.start.valueOf());
          expect(a.end_ms).to.equal(e.end.valueOf());

          expect(a.x).to.equal(e.x);
          expect(a.y).to.equal(e.y);
          expect(a.zoom).to.equal(e.zoom);

          expect(a.alpha).to.equal(e.alpha);
          expect(a.beta).to.equal(e.beta);
          expect(a.gamma).to.equal(e.gamma);
        });

        done();
      });

  }

  it('should add spatial data points to a session on /spatial/<id> POST', done => {
    chai.request(app)
      .post(`/spatial`)
      .send(sampleData())
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal("" + sampleData().data.length);

        verify_good_data(sampleData(), done);
      });
  });

  it('should fail to add data points to a non-existant session on /spatial/<id> POST', done => {
    // uuid that doesn't exist
    const bad_uuid = require('uuid').v1();
    const bad_data = sampleData();
    bad_data.uuid = bad_uuid;

    chai.request(app)
      .post('/spatial')
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);
        res.text.should.equal(`Session ID (${bad_uuid}) does not exist.`);

        done();
      });
  });

  it('should fail to add non-unique data points to a session on /spatial/<id> POST', done => {
    // make bad data with a duplicate value
    let bad_data = sampleData();
    bad_data.data.push(bad_data.data[0]);

    chai.request(app)
      .post(`/spatial`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT:/);

        done();
      });
  });


  it('should fail to add data points to an ended session on /spatial/<id> POST', done => {

    // Close the session via /session/end/:uuid
    chai.request(app)
      .post(`/session/end`)
      .send({
        uuid,
        end: START_TIME.clone().add(10, 's')
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        // now try to add mouse data
        chai.request(app)
          .post(`/spatial`)
          .send(sampleData())
          .end((err, res) => {
            res.should.have.status(403);

            res.text.should.equal(`Tried to insert data that is older than session (ID: ${uuid}).`);

            done();
          });
      });
  });

  it('should add data points to an ended session on /spatial/<id> POST if they are before end', done => {

    // Close the session via /session/end
    chai.request(app)
      .post(`/session/end`)
      .send({
        uuid,
        end: START_TIME.clone().add(1, 'h')
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        // now try to add mouse data
        chai.request(app)
          .post(`/spatial`)
          .send(sampleData())
          .end((err, res) => {
            res.should.have.status(200);

            res.text.should.equal(`${sampleData().data.length}`);

            done();
          });
      });
  });

  it('should fail to add malformed data to a session on /spatial/<id> POST', done => {

    let bad_data = sampleData();
    delete bad_data.data[0]['start'];

    chai.request(app)
      .post(`/spatial`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/"start" is required/);

        done();
      });

  });

  it('After an error, correct requests should pass /spatial/<id> POST', done => {

    let bad_data = sampleData();
    bad_data.data[0]['start'] = 'asdf';

    chai.request(app)
      .post(`/spatial`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/"start" must be a valid ISO 8601 date/);

        chai.request(app)
          .post(`/spatial`)
          .send(sampleData())
          .end((err, res) => {
            res.should.have.status(200);
            res.text.should.equal("" + sampleData().data.length);

            verify_good_data(sampleData(), done);
          });
      });

  });

  it('will not add overlapping time interval data', done => {

    // Force a time overlap
    let bad_data = sampleData();
    bad_data.data[2].start = bad_data.data[1].start.add(6, 's');

    chai.request(app)
      .post(`/spatial`)
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
      uuid,
      "data": [{
        "x": 0.0,
        "y": 0.0,
        "zoom": 350.0,
        "alpha": 0.0,
        "beta": 0.0,
        "gamma": 0.0,
        "start": "2017-05-23T13:37:53.5580000-04:00",
        "end": "2017-05-23T13:37:53.5580000-04:00",
        "objectId": "3d_brain"
      }, {
        "x": 0.0,
        "y": 0.0,
        "zoom": 350.0,
        "alpha": 0.0,
        "beta": 354.915283203125,
        "gamma": 0.0,
        "start": "2017-05-23T13:37:55.7070000-04:00",
        "end": "2017-05-23T13:37:55.8680000-04:00",
        "objectId": "3d_brain"
      }]
    };

    let otherUUID;

    let next = () => {
      chai.request(app)
        .post(`/spatial`)
        .send(data)
        .end((err, res) => {
          res.should.have.status(200);
          res.text.should.equal("" + data.data.length);

          const newData = _.cloneDeep(data);
          newData.uuid = otherUUID;

          chai.request(app)
            .post(`/spatial`)
            .send(newData)
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
