'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDatabase, createServer, issueInviteCode } = require('../site/server');

async function createTestServer(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'rumo-survey-test-'));
  const database = createDatabase(path.join(directory, 'test.sqlite'));
  const code = issueInviteCode(database);
  const server = createServer({ database });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    code,
    database,
    baseUrl: `http://127.0.0.1:${address.port}`,
    server
  };
}

async function postJson(baseUrl, route, body) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('an issued code permits one survey and rejects every repeat', async (t) => {
  const { baseUrl, code, database } = await createTestServer(t);
  const answers = { q1: 1, q2: 0, q3: 1, q4: 0, q5: 1 };

  const access = await postJson(baseUrl, '/api/survey/access', { code });
  assert.equal(access.status, 200);

  const invalidAnswers = await postJson(baseUrl, '/api/survey/submit', {
    code,
    answers: { q1: 1 }
  });
  assert.equal(invalidAnswers.status, 400);

  const submission = await postJson(baseUrl, '/api/survey/submit', { code, answers });
  assert.equal(submission.status, 201);
  assert.deepEqual(await submission.json(), { saved: true });

  const repeatedSubmission = await postJson(baseUrl, '/api/survey/submit', { code, answers });
  assert.equal(repeatedSubmission.status, 409);

  const repeatedAccess = await postJson(baseUrl, '/api/survey/access', { code });
  assert.equal(repeatedAccess.status, 409);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM survey_submissions').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM survey_invites WHERE code_hash = ?').get(
    require('node:crypto').createHash('sha256').update(code.replaceAll('-', '')).digest('hex')
  ).count, 1);
});

test('automatically creates only one code per browser identifier', async (t) => {
  const { baseUrl, database } = await createTestServer(t);
  const clientId = 'b74378c8-1a63-4a34-84c8-d9522b8a6f02';

  const registration = await postJson(baseUrl, '/api/survey/register', { clientId });
  assert.equal(registration.status, 201);
  const { code } = await registration.json();
  assert.match(code, /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM survey_clients').get().count, 1);
  const clientHash = require('node:crypto').createHash('sha256').update(clientId.toUpperCase()).digest('hex');
  assert.equal(database.prepare('SELECT client_hash FROM survey_clients').get().client_hash, clientHash);
  assert.equal(database.prepare('SELECT code_hash FROM survey_invites').get().code_hash.includes(code), false);

  const duplicateRegistration = await postJson(baseUrl, '/api/survey/register', { clientId });
  assert.equal(duplicateRegistration.status, 409);

  const invalidBrowser = await postJson(baseUrl, '/api/survey/register', { clientId: 'not-a-browser-id' });
  assert.equal(invalidBrowser.status, 400);

  const anotherBrowser = await postJson(baseUrl, '/api/survey/register', {
    clientId: '46f42a04-7258-4092-8b7b-3dbe93aa7168'
  });
  assert.equal(anotherBrowser.status, 201);
  assert.notEqual((await anotherBrowser.json()).code, code);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM survey_invites').get().count, 3);
});

test('serves the survey and does not expose files outside the public directory', async (t) => {
  const { baseUrl } = await createTestServer(t);
  const survey = await fetch(`${baseUrl}/pesquisa.html`);
  assert.equal(survey.status, 200);
  assert.match(await survey.text(), /criará automaticamente um código individual/);

  const traversal = await fetch(`${baseUrl}/%2e%2e%2fREADME.md`);
  assert.equal(traversal.status, 404);
});

test('rejects unknown and malformed invite codes', async (t) => {
  const { baseUrl } = await createTestServer(t);
  const malformed = await postJson(baseUrl, '/api/survey/access', { code: 'not-a-code' });
  assert.equal(malformed.status, 404);
  const noCode = await postJson(baseUrl, '/api/survey/access', {});
  assert.equal(noCode.status, 404);
});
