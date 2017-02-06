'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');

const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();

const should = chai.should();
const expect = chai.expect;

chai.use(chaiHttp);

const UUID_REG = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

let app = null;

let dbHandle;

const test_server = require(__dirname + '/../../src/api/app');

function new_server(next) {
  dbHandle = new sqlite3.Database(':memory:');

  return test_server({
    database: dbHandle
  }, next);
}

describe('session', function() {
  beforeEach(done => {
    new_server(newApp => {
      app = newApp;
      done();
    });
  });

  afterEach(done => {
    app.get('db').close(err => {
      if (err) throw err;

      done();
    });
  });

  it('should create a new session on /session/new POST', done => {

    let data = {
      "start": moment("2016-04-05T12:02:32.022"),
      "userId": "demo",
      "modelId": "demo_model"
    };

    chai.request(app)
      .post('/session/new')
      .send(data).end((err, res) => {

        res.should.have.status(200);
        res.text.should.match(UUID_REG);

        let uuid = res.text;

        dbHandle.get("SELECT uuid, start_ms, user_id, model_id FROM session_data WHERE uuid=?", uuid, (err, row) => {
          if (err) throw err;

          expect(row.uuid).to.equal(uuid);
          expect(row.start_ms).to.equal(data.start.valueOf());
          expect(row.user_id).to.equal(data.userId);
          expect(row.model_id).to.equal(data.modelId);

          done();
        });
      });
  });

  it('should error creating a new, identical session on /session/new POST', done => {
    let data = {
      "start": moment("2016-04-05T12:02:34.022"),
      "userId": "demo",
      "modelId": "demo_model"
    };

    chai.request(app)
      .post('/session/new')
      .send(data)
      .end((err, res) => {

        res.should.have.status(200);
        res.text.should.match(UUID_REG);

        chai.request(app)
          .post('/session/new')
          .send(data)
          .end((err, res) => {
            res.should.have.status(403);

            done();
          });
      });
  });

  it('should end a session on /session/end/<id> POST', done => {

    let end_time = moment("2016-04-06T12:02:32.022");
    chai.request(app)
      .post('/session/new')
      .send({
        "start": moment("2016-04-05T12:02:32.022"),
        "userId": "demo",
        "modelId": "demo_model"
      }).end((err, res) => {

        res.should.have.status(200);
        res.text.should.match(UUID_REG);

        let uuid = res.text;

        chai.request(app)
          .post('/session/end/' + uuid)
          .send({
            end: end_time
          })
          .end((err, res) => {
            res.should.have.status(200);

            res.text.should.equal(uuid);

            dbHandle.get("SELECT uuid, end_ms FROM session_data WHERE uuid=?", uuid, (err, row) => {
              if (err) throw err;

              expect(row.uuid).to.equal(uuid);
              expect(row.end_ms).to.equal(end_time.valueOf());

              done();
            });
          });
      });
  });
});
