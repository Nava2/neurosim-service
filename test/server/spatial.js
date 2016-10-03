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

describe('spatial', function() {
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
    dbHandle.close(err => {
      if (err) throw err;

      done();
    });
  });

  const GOOD_DATA = {
    "data": [
      {
        "start": moment("2016-04-05T12:02:32.022"),
        "end": moment("2016-04-05T12:02:32.023"),
        "x": 20.0,
        "y": 23.4,
        "zoom": -1.0,
        "alpha": 234.0,
        "beta": 234.0,
        "gamma": 234.0
      },

      {
        "start": moment("2016-04-05T12:02:32.023"),
        "end": moment("2016-04-05T12:02:35.022"),
        "x": 20.0,
        "y": 23.4,
        "zoom": 32.4,
        "alpha": 234.0,
        "beta": 234.0,
        "gamma": 234.0
      },
      {
        "start": moment("2016-04-05T12:02:35.022"),
        "end": moment("2016-04-05T12:04:32.022"),
        "x": 20.0,
        "y": 23.4,
        "zoom": 3.4,
        "alpha": 234.0,
        "beta": 234.0,
        "gamma": 234.0
      }
    ]
  };

  it('should add spatial data points to a session on /spatial/<id> POST', done => {
    chai.request(app)
      .post(`/spatial/${uuid}`)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal("3");

        dbHandle.all('SELECT * FROM spatial_data WHERE session_id=? ORDER BY start_ms', uuid,
          (err, rows) => {
            if (err) throw err;

            _.zip(rows, GOOD_DATA.data).forEach(arr => {
              let a = arr[0];
              let e = arr[1];

              expect(a.session_id).to.equal(uuid);
              expect(a.start_ms).to.equal(e.start.valueOf());
              expect(a.end_ms).to.equal(e.end.valueOf());

              expect(a.x).to.equal(e.x);
              expect(a.y).to.equal(e.y);
              expect(a.zoom).to.equal(e.zoom);

              expect(a.alpha).to.equal(e.alpha);
              expect(a.beta).to.equal(e.beta);
              expect(a.gamma).to.equal(e.gamma);
              expect(a.button_id).to.equal(e.button);
            });

            done();
          });
      });
  });

  it('should fail to add data points to a non-existant session on /spatial/<id> POST', done => {
    // uuid that doesn't exist
    const bad_uuid = require('uuid').v1();

    chai.request(app)
      .post('/spatial/' + bad_uuid)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(403);
        res.text.should.equal(`Session ID (${bad_uuid}) does not exist.`);

        done();
      });
  });

  it('should fail to add non-unique data points to a session on /spatial/<id> POST', done => {
    // make bad data with a duplicate value
    let bad_data = _.cloneDeep(GOOD_DATA);
    bad_data.data.push(bad_data.data[0]);

    chai.request(app)
      .post(`/spatial/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: UNIQUE constraint failed:/);

        done();
      });
  });


  it('should fail to add data points to an ended session on /spatial/<id> POST', done => {

    // Close the session via /session/end/:uuid
    chai.request(app)
      .post(`/session/end/${uuid}`)
      .send({
        end: moment()
      })
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(uuid);

        // now try to add click data
        chai.request(app)
          .post(`/spatial/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(403);

            res.text.should.equal(`Session ID (${uuid}) is closed.`);

            done();
          });
      });
  });
});
