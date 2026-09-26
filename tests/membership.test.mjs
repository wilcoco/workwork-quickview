import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { createApp } from '../server/app.mjs';
import { openStore } from '../server/store.mjs';
import { hashPassword } from '../server/auth.mjs';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const PASSWORD = 'Synthetic membership password 2026!';
const PLAN = {engine: 'guided', note: 'Synthetic plan', requests: [{title: 'Ready?', role: 'Operations', prompt: 'What is ready?'}]};

async function setup(t, options = {}) {
  const app = createApp({databasePath: ':memory:', production: false, now: () => NOW,
    authRateLimit: 1000, identityRateLimit: 1000, companyWriteLimit: 1000, planQuestion: async () => PLAN, ...options});
  const address = await app.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  let sequence = 0;
  function client() {
    let cookie = '', csrf = '';
    return {
      async call(path, body, method = body === undefined ? 'GET' : 'POST') {
        const response = await fetch(origin + '/api' + path, {method,
          headers: {'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf},
          ...(body === undefined ? {} : {body: JSON.stringify(body)})});
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const data = await response.json();
        if (data.csrfToken) csrf = data.csrfToken;
        return {status: response.status, data};
      },
      async signup() {
        const tag = ++sequence;
        const response = await this.call('/signup', {companyName: `Synthetic ${tag}`, name: `Owner ${tag}`,
          email: `owner-${tag}@example.test`, password: PASSWORD});
        assert.equal(response.status, 201);
        return response.data.user;
      }
    };
  }
  return {app, client};
}

async function join(owner, client, name = 'Operator') {
  const invite = await owner.call('/invites', {email: `${name.toLowerCase()}@example.test`});
  assert.equal(invite.status, 201);
  const result = await client.call('/join', {token: invite.data.invite.token, name, password: PASSWORD});
  assert.equal(result.status, 201);
  return result.data.user;
}

async function draft(owner, assigneeId) {
  const created = await owner.call('/questions', {text: 'Can the batch ship?', context: 'Batch B17'});
  assert.equal(created.status, 201);
  const {question, requests} = created.data;
  const saved = await owner.call(`/questions/${question.id}`, {expectedVersion: question.version, context: question.context,
    requests: requests.map(({id, title, role, prompt}) => ({id, title, role, prompt, assigneeId}))}, 'PATCH');
  assert.equal(saved.status, 200);
  return {question: saved.data.question, request: saved.data.requests[0]};
}

async function launch(owner, assigneeId) {
  const result = await draft(owner, assigneeId);
  const launched = await owner.call(`/questions/${result.question.id}/launch`, {expectedVersion: result.question.version});
  assert.equal(launched.status, 200);
  return {...result, question: launched.data.question};
}

const setActive = (client, user, active, expectedActive = !active) => client.call(`/members/${user.id}`, {active, expectedActive}, 'PATCH');
const responseBody = request => ({expectedVersion: request.version, expectedResponseId: null,
  text: 'Waiting for QA', status: 'blocked', source: 'Synthetic QA register', observedAt: '2026-10-01T10:00:00Z'});

test('legacy SQLite users migrate active without losing accounts or evidence', async t => {
  const dir = await mkdtemp(joinPath(tmpdir(), 'quickview-membership-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const path = joinPath(dir, 'legacy.sqlite'), companyId = randomUUID(), userId = randomUUID();
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE users(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
    PRAGMA user_version = 2;`);
  db.prepare('INSERT INTO companies VALUES(?,?,?)').run(companyId, 'Legacy company', '2025-01-01T00:00:00Z');
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(userId, companyId, 'Legacy owner', 'legacy@example.test', await hashPassword(PASSWORD), 'manager', '2025-01-01T00:00:00Z');
  db.close();
  const {app, client} = await setup(t, {databasePath: path});
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(app.store.user(userId).active, true);
  const owner = client();
  assert.equal((await owner.call('/login', {email: 'legacy@example.test', password: PASSWORD})).status, 200);
  assert.equal((await owner.call('/state')).data.members[0].active, true);
  app.store.insert(companyId, 'responses', {id: randomUUID(), createdAt: '2025-01-01T00:00:00Z', text: 'Historic source'});
  assert.equal(app.store.all(companyId, 'responses')[0].text, 'Historic source');
});

test('deactivation revokes every session, denies login generically and reactivation requires fresh sign-in', async t => {
  const {app, client} = await setup(t);
  const owner = client(), worker = client(), secondSession = client();
  const manager = await owner.signup(), operator = await join(owner, worker);
  assert.equal((await secondSession.call('/login', {email: operator.email, password: PASSWORD})).status, 200);
  assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(operator.id).n, 2);
  const deactivated = await setActive(owner, operator, false);
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.data.member.active, false);
  assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(operator.id).n, 0);
  assert.equal((await worker.call('/state')).status, 401);
  assert.equal((await secondSession.call('/state')).status, 401);
  const inactiveLogin = await worker.call('/login', {email: operator.email, password: PASSWORD});
  const badLogin = await secondSession.call('/login', {email: 'missing@example.test', password: PASSWORD});
  assert.equal(inactiveLogin.status, 401);
  assert.equal(inactiveLogin.data.error, badLogin.data.error);
  assert.equal((await owner.call('/state')).status, 200);
  const restored = await setActive(owner, operator, true);
  assert.equal(restored.status, 200);
  assert.equal((await worker.call('/state')).status, 401);
  assert.equal((await worker.call('/login', {email: operator.email, password: PASSWORD})).status, 200);
  const state = (await owner.call('/state')).data;
  assert.equal(state.membershipEvents.length, 2);
  assert.ok(state.membershipEvents.every(event => event.authorId === manager.id && event.memberId === operator.id));
  assert.deepEqual(state.membershipEvents.map(event => event.active), [false, true]);
  assert.deepEqual((await worker.call('/state')).data.membershipEvents, []);
});

test('membership changes enforce company, manager, self and optimistic-active boundaries', async t => {
  const {app, client} = await setup(t);
  const owner = client(), worker = client(), stranger = client();
  const manager = await owner.signup(), operator = await join(owner, worker), foreign = await stranger.signup();
  assert.equal((await setActive(worker, manager, false)).status, 403);
  assert.equal((await setActive(owner, foreign, false)).status, 404);
  assert.equal((await setActive(owner, manager, false)).status, 409);
  assert.equal((await owner.call(`/members/${operator.id}`, {active: 'false', expectedActive: true}, 'PATCH')).status, 400);
  assert.equal((await setActive(owner, operator, false)).status, 200);
  assert.equal((await setActive(owner, operator, false)).status, 409);
  assert.equal((await setActive(owner, operator, false, false)).status, 200);
  assert.equal((await owner.call('/state')).data.membershipEvents.length, 1);
  // The existing owner remains the last active manager and cannot remove itself.
  assert.equal(app.store.members(app.store.user(manager.id).companyId).filter(m => m.role === 'manager' && m.active).length, 1);
  assert.equal((await setActive(owner, manager, false)).status, 409);
});

test('a second manager can be offboarded without changing source authors or removing the last manager', async t => {
  const {app, client} = await setup(t);
  const owner = client(), colleague = client();
  const manager = await owner.signup(), colleagueUser = await join(owner, colleague, 'Supervisor');
  // Synthetic fixture setup: promotion has no public API in this release.
  app.store.db.prepare('UPDATE users SET role=? WHERE id=?').run('manager', colleagueUser.id);
  const {question, request} = await launch(owner, colleagueUser.id);
  const answer = await colleague.call(`/requests/${request.id}/responses`, responseBody(request));
  assert.equal(answer.status, 201);
  assert.equal((await setActive(owner, colleagueUser, false)).status, 200);
  const state = (await owner.call('/state')).data;
  assert.equal(state.responses[0].authorId, colleagueUser.id);
  assert.equal(state.questions.find(q => q.id === question.id).status, 'live');
  assert.equal(state.members.filter(m => m.active && m.role === 'manager').length, 1);
  assert.equal(state.members.find(m => m.id === manager.id).active, true);
  assert.equal((await colleague.call('/state')).status, 401);
});

test('inactive people cannot receive new work, launch drafts or carry automatic next-round assignments', async t => {
  const {client} = await setup(t);
  const owner = client(), worker = client();
  const manager = await owner.signup(), operator = await join(owner, worker);
  const saved = await draft(owner, operator.id), live = await launch(owner, operator.id);
  assert.equal((await setActive(owner, operator, false)).status, 200);
  assert.equal((await owner.call(`/questions/${saved.question.id}/launch`, {expectedVersion: saved.question.version})).status, 400);
  assert.equal((await owner.call(`/questions/${saved.question.id}`, {expectedVersion: saved.question.version, context: 'Same scope', requests: [
    {id: saved.request.id, title: 'New title', role: 'Operations', prompt: 'New prompt', assigneeId: operator.id}
  ]}, 'PATCH')).status, 404);
  assert.equal((await owner.call(`/requests/${live.request.id}`, {expectedVersion: 1, assigneeId: operator.id, followup: 'Update'}, 'PATCH')).status, 404);
  const decision = {text: 'Resolve the issue', action: {title: 'Resolve', expectedResult: 'Confirmed source', assigneeId: operator.id}};
  assert.equal((await owner.call(`/questions/${live.question.id}/decisions`, decision)).status, 404);
  assert.equal((await owner.call('/state')).data.decisions.length, 0);
  const checkin = await owner.call(`/questions/${live.question.id}/check-ins`, {expectedVersion: live.question.version, text: 'Next round', context: 'Next period'});
  assert.equal(checkin.status, 201);
  assert.equal(checkin.data.requests[0].assigneeId, null);
  assert.equal(checkin.data.requests[0].previousRequestId, live.request.id);
  assert.equal((await owner.call(`/questions/${checkin.data.question.id}/launch`, {expectedVersion: 1})).status, 400);
  assert.equal((await owner.call(`/requests/${live.request.id}`, {expectedVersion: 1, assigneeId: manager.id, followup: 'Owner will review'}, 'PATCH')).status, 200);
});

test('assignment gaps preserve current responses and accepted results while exposing unresolved obligations', async t => {
  const {client} = await setup(t);
  const owner = client(), worker = client();
  await owner.signup();
  const operator = await join(owner, worker);
  const unanswered = await launch(owner, operator.id), answered = await launch(owner, operator.id), closed = await launch(owner, operator.id);
  const response = await worker.call(`/requests/${answered.request.id}/responses`, responseBody(answered.request));
  assert.equal(response.status, 201);
  const createAction = async title => {
    const result = await owner.call(`/questions/${closed.question.id}/decisions`, {text: title, action: {title, expectedResult: 'Source confirmed', assigneeId: operator.id}});
    assert.equal(result.status, 201);
    return result.data.action;
  };
  const unresolved = await createAction('Still open'), accepted = await createAction('Accepted result');
  assert.equal((await worker.call(`/actions/${accepted.id}`, {expectedVersion: 1, status: 'reported_done', note: 'Evidence provided'}, 'PATCH')).status, 200);
  assert.equal((await owner.call(`/actions/${accepted.id}`, {expectedVersion: 2, status: 'accepted', note: 'Reviewed'}, 'PATCH')).status, 200);
  assert.equal((await owner.call(`/questions/${closed.question.id}/close`, {expectedVersion: closed.question.version})).status, 200);
  assert.equal((await setActive(owner, operator, false)).status, 200);
  const state = (await owner.call('/state')).data;
  assert.deepEqual(state.assignmentGaps.requests, [unanswered.request.id]);
  assert.deepEqual(state.assignmentGaps.actions, [unresolved.id]);
  assert.equal(state.responses[0].id, response.data.response.id);
  assert.equal(state.members.find(m => m.id === operator.id).active, false);
  assert.equal(state.briefings.find(b => b.questionId === answered.question.id).answered, 1);
});

test('manager reassigns an unresolved action with versioned actor and assignee history', async t => {
  const {client} = await setup(t);
  const owner = client(), worker = client(), replacement = client();
  const manager = await owner.signup(), operator = await join(owner, worker), successor = await join(owner, replacement, 'Replacement');
  const {question} = await launch(owner, operator.id);
  const created = await owner.call(`/questions/${question.id}/decisions`, {text: 'Follow through', action: {
    title: 'Verify result', expectedResult: 'Confirmed evidence', assigneeId: operator.id}});
  const action = created.data.action;
  assert.equal((await worker.call(`/actions/${action.id}`, {expectedVersion: 1, status: 'open', note: 'Delegate', assigneeId: successor.id}, 'PATCH')).status, 403);
  assert.equal((await setActive(owner, operator, false)).status, 200);
  assert.equal((await owner.call(`/actions/${action.id}`, {expectedVersion: 1, status: 'open', note: '', assigneeId: successor.id}, 'PATCH')).status, 400);
  assert.equal((await owner.call(`/actions/${action.id}`, {expectedVersion: 1, status: 'open', note: 'Invalid assignment', assigneeId: operator.id}, 'PATCH')).status, 404);
  const updated = await owner.call(`/actions/${action.id}`, {expectedVersion: 1, status: 'open', note: 'Reassigned after member departure', assigneeId: successor.id}, 'PATCH');
  assert.equal(updated.status, 200);
  assert.equal(updated.data.action.assigneeId, successor.id);
  assert.equal(updated.data.action.status, 'open');
  const event = updated.data.action.updates[0];
  assert.equal(event.authorId, manager.id);
  assert.equal(event.assigneeId, successor.id);
  assert.equal(event.previousAssigneeId, operator.id);
  assert.equal((await owner.call(`/actions/${action.id}`, {expectedVersion: 1, status: 'open', note: 'Stale', assigneeId: manager.id}, 'PATCH')).status, 409);
  assert.deepEqual((await owner.call('/state')).data.assignmentGaps.actions, []);
  assert.equal((await replacement.call(`/actions/${action.id}`, {expectedVersion: 2, status: 'reported_done', note: 'Result reported', source: 'New source'}, 'PATCH')).status, 200);
});

test('offboarding during asynchronous planning prevents a late authorized write', async t => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const draftingStarted = new Promise(resolve => { started = resolve; });
  const {app, client} = await setup(t, {planQuestion: async () => { started(); await gate; return PLAN; }});
  const owner = client(), colleague = client();
  await owner.signup();
  const supervisor = await join(owner, colleague, 'Supervisor');
  app.store.db.prepare('UPDATE users SET role=? WHERE id=?').run('manager', supervisor.id);
  const pending = colleague.call('/questions', {text: 'Question drafted before offboarding'});
  await draftingStarted;
  assert.equal((await setActive(owner, supervisor, false)).status, 200);
  release();
  assert.equal((await pending).status, 401);
  assert.equal((await owner.call('/state')).data.questions.length, 0);
});

test('migration is repeatable and does not reactivate an offboarded account after restart', async t => {
  const dir = await mkdtemp(joinPath(tmpdir(), 'quickview-member-restart-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const path = joinPath(dir, 'fixture.sqlite');
  const store = openStore(path);
  const company = store.createCompany({name: 'Persistence fixture', createdAt: new Date(NOW).toISOString()});
  const user = store.createUser({companyId: company.id, name: 'Inactive person', email: 'inactive@example.test', passwordHash: 'synthetic', role: 'member', createdAt: new Date(NOW).toISOString()});
  store.setMemberActive(company.id, user.id, false);
  store.close();
  const reopened = openStore(path);
  try {
    assert.equal(reopened.user(user.id).active, false);
    assert.equal(reopened.members(company.id)[0].active, false);
    assert.equal(reopened.db.prepare('PRAGMA user_version').get().user_version, 3);
  } finally { reopened.close(); }
});
