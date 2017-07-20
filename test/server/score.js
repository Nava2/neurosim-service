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


describe('score', () => {
  let app = null;
  let uuid = null;

  const START_TIME = moment("2016-04-05T12:02:32.022");
  beforeEach(done => {
    let data = {
      "start": START_TIME,
      "userId": "demo",
      "modelId": "demo_model"
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

  const GOOD_DATA = {
    "data": [
      {
        "objectId": "p1",

        "actual": {
          "x": 20.0,
          "y": 23.4,
          "zoom": -1.0,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0,
        },

        "expected": {
          "x": 20.0,
          "y": 23.4,
          "zoom": -1.0,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0
        }
      },

      {
        "objectId": "p2",

        "actual": {
          "x": 20.0,
          "y": 23.4,
          "zoom": -1.0,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0,
        },

        "expected": {
          "x": 20.0,
          "y": 23.4,
          "zoom": -1.0,
          "alpha": 234.0,
          "beta": 234.0,
          "gamma": 234.0
        }
      }
    ]
  };

  function verify_good_data(done) {
    dbHandle.all('SELECT * FROM score_data WHERE session_id=? ORDER BY object_id', uuid,
      (err, rows) => {
        if (err) throw err;

        _.zip(rows, GOOD_DATA.data).forEach(arr => {
          let a = arr[0];
          let e = arr[1];

          expect(a.session_id).to.equal(uuid);
          expect(a.object_id).to.equal(e.objectId);

          expect(a.e_x).to.equal(e.expected.x);
          expect(a.e_y).to.equal(e.expected.y);
          expect(a.e_zoom).to.equal(e.expected.zoom);

          expect(a.e_alpha).to.equal(e.expected.alpha);
          expect(a.e_beta).to.equal(e.expected.beta);
          expect(a.e_gamma).to.equal(e.expected.gamma);

          expect(a.a_x).to.equal(e.actual.x);
          expect(a.a_y).to.equal(e.actual.y);
          expect(a.a_zoom).to.equal(e.actual.zoom);

          expect(a.a_alpha).to.equal(e.actual.alpha);
          expect(a.a_beta).to.equal(e.actual.beta);
          expect(a.a_gamma).to.equal(e.actual.gamma);
        });

        done();
      });

  }

  it('should add score data points to a session on /score/<id> POST', done => {
    chai.request(app)
      .post(`/score/${uuid}`)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(200);
        res.text.should.equal(`${GOOD_DATA.data.length}`);

        verify_good_data(done);
      });
  });

  it('should fail to add data points to a non-existant session on /score/<id> POST', done => {
    // uuid that doesn't exist
    const bad_uuid = require('uuid').v1();

    chai.request(app)
      .post('/score/' + bad_uuid)
      .send(GOOD_DATA)
      .end((err, res) => {
        res.should.have.status(403);
        res.text.should.equal(`Session ID (${bad_uuid}) does not exist.`);

        done();
      });
  });

  it('should fail to add non-unique data points to a session on /score/<id> POST', done => {
    // make bad data with a duplicate value
    let bad_data = _.cloneDeep(GOOD_DATA);
    bad_data.data.push(bad_data.data[0]);

    chai.request(app)
      .post(`/score/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: UNIQUE constraint failed:/);

        done();
      });
  });

  it('should add data points to an ended session on /score/<id> POST if they are before end', done => {

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
          .post(`/score/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(200);

            res.text.should.equal(`${GOOD_DATA.data.length}`);

            done();
          });
      });
  });

  it('should fail to add malformed data to a session on /score/<id> POST', done => {

    let bad_data = _.cloneDeep(GOOD_DATA);
    delete bad_data.data[0]['expected']['alpha'];

    chai.request(app)
      .post(`/score/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: NOT NULL constraint failed:/);

        done();
      });

  });

  it('should fail to add malformed json to a session on /score/<id> POST', done => {
    const bad_data = `{
      "data": [{
        "objectId": "Corpus Callosum(Clone)",
        "actual": {
          "x": -5.558823108673096,
          "y": 0.9352943897247315,
          "zoom": -2.799999952316284,
          "alpha": 85.93802642822266,
          "beta": 236.56591796875,
          "gamma": 327.074951171875
        },
        "expected": {
          "x": -5.670246601104736,
          "y": 0.5864675045013428,
          "zoom": -2.9583325386047365,
          "alpha": 85.91706848144531,
          "beta": 236.5658721923828,
          "gamma": 326.9389343261719
        },
        "objectId": "CaudateNuc(Clone)",
        "actual": {
          "x": -6.194118022918701,
          "y": -0.9705884456634522,
          "zoom": -2.799999952316284,
          "alpha": 85.9170150756836,
          "beta": 236.56597900390626,
          "gamma": 326.93902587890627
        },
        "expected": {
          "x": -5.989668846130371,
          "y": -1.3292661905288697,
          "zoom": -3.0233073234558107,
          "alpha": 85.9170150756836,
          "beta": 236.56597900390626,
          "gamma": 326.93902587890627
        }
      }]
    }`;

    chai.request(app)
        .post(`/score/${uuid}`)
        .type('json') // manual spec required
        .send(bad_data)
        .end((err, res) => {
          res.should.have.status(403);

          res.text.should.match(/Duplicate key &#39;objectId&#39; on line 20:/);

          done();
        });

  });

  it('After an error, correct requests should pass /score/<id> POST', done => {

    let bad_data = _.cloneDeep(GOOD_DATA);
    delete bad_data.data[0]['expected']['x'];

    chai.request(app)
      .post(`/score/${uuid}`)
      .send(bad_data)
      .end((err, res) => {
        res.should.have.status(403);

        res.text.should.match(/^SQLITE_CONSTRAINT: NOT NULL constraint failed:/);

        chai.request(app)
          .post(`/score/${uuid}`)
          .send(GOOD_DATA)
          .end((err, res) => {
            res.should.have.status(200);
            res.text.should.equal(`${GOOD_DATA.data.length}`);

            verify_good_data(done);
          });
      });

  });
});
