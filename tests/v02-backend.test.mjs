import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { openStore } from '../server/store.mjs';
import { evidenceFreshness, buildBriefing, evidenceSuggestions } from '../server/briefing.mjs';
import { guidedPlan } from '../server/planner.mjs';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const DAY = 86400000;
const PASSWORD = 'Synthetic backend test password 2026';
const planQuestion = async () => ({ engine: 'guided', note: 'Synthetic plan', requests: [
  {title: 'Batch readiness', role: 'Production', prompt: 'What is confirmed about batch B17?'}
] });

async function setup(t, options = {}) {
  let clock = NOW;
  const app = createApp({databasePath: ':memory:', production: false, now: () => clock,
    authRateLimit: 1000, identityRateLimit: 1000, companyWriteLimit: 1000, planQuestion, ...options});
  const address = await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
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
        const result = await this.call('/signup', {companyName: `Synthetic ${tag}`, name: `Owner ${tag}`,
          email: `owner-${tag}@example.test`, password: PASSWORD});
        assert.equal(result.status, 201);
        return result.data.user;
      }
    };
  }
  return {app, client, setTime(value) { clock = value; }};
}

async function member(owner, client, name = 'Operator') {
  const invite = await owner.call('/invites', {email: `${name.toLowerCase()}@example.test`});
  assert.equal(invite.status, 201);
  const joined = await client.call('/join', {token: invite.data.invite.token, name, password: PASSWORD});
  assert.equal(joined.status, 201);
  return joined.data.user;
}

async function launch(owner, assigneeId, extra = {}) {
  let result = await owner.call('/questions', {text: 'Can batch B17 ship?', context: 'October 1 shipping scope', ...extra});
  assert.equal(result.status, 201);
  let {question, requests} = result.data;
  result = await owner.call(`/questions/${question.id}`, {expectedVersion: question.version,
    context: question.context, dueDate: question.dueDate,
    requests: requests.map(({id, title, role, prompt}) => ({id, title, role, prompt, assigneeId}))}, 'PATCH');
  assert.equal(result.status, 200);
  ({question, requests} = result.data);
  result = await owner.call(`/questions/${question.id}/launch`, {expectedVersion: question.version});
  assert.equal(result.status, 200);
  return {question: result.data.question, request: requests[0]};
}

function answer(request, extra = {}) {
  return {expectedVersion: request.version, expectedResponseId: null, text: 'B17 awaits an authorized QA release.',
    status: 'blocked', source: 'QA register B17', observedAt: '2026-09-20T10:00:00Z',
    nextStep: 'Wait for QA release', decisionNeeded: 'Please name the release owner.', ...extra};
}

test('freshness uses observations or explicit confirmations, never submission time', () => {
  assert.deepEqual(evidenceFreshness(null, 7, NOW), {freshness: 'missing', ageDays: null, referenceTime: null});
  assert.equal(evidenceFreshness({createdAt: new Date(NOW).toISOString()}, 7, NOW).freshness, 'undated');
  assert.equal(evidenceFreshness({observedAt: new Date(NOW - 7 * DAY).toISOString()}, 7, NOW).freshness, 'recent');
  assert.equal(evidenceFreshness({observedAt: new Date(NOW - 7 * DAY - 1).toISOString()}, 7, NOW).freshness, 'aging');
  assert.equal(evidenceFreshness({observedAt: new Date(NOW + 300001).toISOString()}, 7, NOW).freshness, 'future');
  assert.equal(evidenceFreshness({observedAt: '2020-01-01T00:00:00Z', confirmedAt: new Date(NOW).toISOString()}, 7, NOW).freshness, 'recent');
});

test('briefing preserves old concerns and separates coverage, unknowns, source age and decision references', () => {
  const question = {id: 'q', status: 'live'};
  const requests = [{id: 'r1', questionId: 'q', version: 2}, {id: 'r2', questionId: 'q', version: 1}];
  const responses = [
    {id: 'a1', requestId: 'r1', requestVersion: 1, status: 'blocked', text: 'Earlier concern', decisionNeeded: 'Approve a choice', observedAt: '2026-09-01T00:00:00Z'},
    {id: 'a2', requestId: 'r2', requestVersion: 1, status: 'unknown', text: 'No confirmation', createdAt: new Date(NOW).toISOString()}
  ];
  const b = buildBriefing(question, requests, responses, [{questionId: 'other', responseIds: ['a1']}], {now: NOW});
  assert.equal(b.answered, 1);
  assert.equal(b.unknown.length, 2);
  assert.equal(b.earlierConcerns[0].response.id, 'a1');
  assert.equal(b.needsRecheck[0].response.id, 'a2');
  assert.equal(b.decisionRequests[0].response.id, 'a1');
  assert.equal(b.rows[0].state, 'update_requested');
  assert.equal(b.rows[0].freshness, 'aging');
  assert.equal(b.rows[1].freshness, 'undated');
  const addressed = buildBriefing(question, requests, responses, [{questionId: 'q', responseIds: ['a1']}], {now: NOW});
  assert.equal(addressed.decisionRequests.length, 0);
  assert.equal(addressed.earlierConcerns.length, 1);
  assert.equal(addressed.kpi, undefined);
});

test('change comparison is source-based; overdue date is UTC and reported completion is still open', () => {
  const q = {id: 'q', status: 'closed'}, r = {id: 'r', questionId: 'q', version: 1};
  const a = {id: 'a', requestId: 'r', requestVersion: 1, text: 'Unknown result', status: 'unknown'};
  const actions = [
    {id: 'open', questionId: 'q', status: 'reported_done', dueDate: '2026-09-30'},
    {id: 'today', questionId: 'q', status: 'open', dueDate: '2026-10-01'},
    {id: 'accepted', questionId: 'q', status: 'accepted', dueDate: '2026-09-20'},
    {id: 'foreign', questionId: 'other', status: 'open', dueDate: '2026-09-20'}
  ];
  const unchanged = buildBriefing(q, [r], [a, {...a, id: 'a2', authorName: 'Different person', createdAt: 'later'}], [], {now: NOW, actions});
  assert.equal(unchanged.rows[0].changeKind, 'unchanged');
  assert.equal(unchanged.rows[0].previousResponse.id, 'a');
  assert.equal(unchanged.openActions.length, 2);
  assert.deepEqual(unchanged.overdueActions.map(x => x.id), ['open']);
  const changed = buildBriefing(q, [r], [a, {...a, id: 'a3', source: 'New source'}], [], {now: NOW});
  assert.equal(changed.rows[0].changeKind, 'updated');
});

test('evidence candidates exclude invalidated versions and use latest append ordering', () => {
  const r = {id: 'target', title: 'Bearing delivery', prompt: 'Check bearing delivery'};
  const requests = [{id: 'old', version: 2}, {id: 'valid', version: 1}, {id: 'replaced', version: 1}];
  const responses = [
    {id: 'invalidated', requestId: 'old', requestVersion: 1, text: 'Bearing delivery confirmed'},
    {id: 'match', requestId: 'valid', requestVersion: 1, text: 'Bearing delivery delayed'},
    {id: 'previous', requestId: 'replaced', requestVersion: 1, text: 'Bearing delivery confirmed'},
    {id: 'new', requestId: 'replaced', requestVersion: 1, text: 'Unknown'}
  ];
  assert.deepEqual(evidenceSuggestions(r, responses, requests).map(x => x.responseId), ['match']);
});

test('guided plans use context and English word boundaries', () => {
  assert.equal(guidedPlan('What needs attention?', 'Quality defects affect batch B17').requests[0].title, 'Quality measurements');
  assert.equal(guidedPlan('What is the deadline for the annual review?').requests[0].title, 'Expected result and scope');
  assert.equal(guidedPlan('What is ready?', 'New production line readiness').requests[0].title, 'Readiness criteria and dates');
  assert.match(guidedPlan('무엇을 확인해야 하나요?', '이번 주 불량 증가').requests[0].title, /품질/);
});

test('freshness policy validation and future observation tolerance preserve legacy defaults', async t => {
  const {client} = await setup(t);
  const owner = client(), user = await owner.signup();
  for (const freshnessDays of [0, 91, 1.5, '7', null]) {
    assert.equal((await owner.call('/questions', {text: 'Test', freshnessDays})).status, 400);
  }
  const {question, request} = await launch(owner, user.id);
  assert.equal(question.freshnessDays, 7);
  const bad = await owner.call(`/requests/${request.id}/responses`, answer(request, {observedAt: new Date(NOW + 300001).toISOString()}));
  assert.equal(bad.status, 400);
  assert.equal((await owner.call('/state')).data.responses.length, 0);
  const accepted = await owner.call(`/requests/${request.id}/responses`, answer(request, {observedAt: new Date(NOW + 300000).toISOString()}));
  assert.equal(accepted.status, 201);
});

test('reconfirmation preserves fact provenance and authored history; normal answer resets confirmation', async t => {
  const {client, setTime} = await setup(t);
  const owner = client(), worker = client();
  const manager = await owner.signup(), operator = await member(owner, worker);
  const {request} = await launch(owner, operator.id);
  const first = await worker.call(`/requests/${request.id}/responses`, answer(request, {observedAt: null, status: 'unknown'}));
  assert.equal(first.status, 201);
  const a = first.data.response;
  const confirm = {expectedVersion: request.version, expectedResponseId: a.id};
  const result = await owner.call(`/requests/${request.id}/reconfirm`, confirm);
  assert.equal(result.status, 201);
  const b = result.data.response;
  assert.equal(b.authorId, manager.id);
  assert.equal(b.originalSource.authorId, operator.id);
  assert.equal(b.observedAt, null);
  assert.equal(b.status, 'unknown');
  assert.equal(b.originalResponseId, a.id);
  assert.equal(b.reconfirmedResponseId, a.id);
  assert.equal((await owner.call(`/requests/${request.id}/reconfirm`, confirm)).status, 409);
  let state = (await owner.call('/state')).data;
  assert.equal(state.responses[0].authorId, operator.id);
  assert.equal(state.briefings[0].rows[0].freshness, 'recent');
  assert.equal(state.briefings[0].unknown.length, 1);
  assert.equal(state.briefings[0].rows[0].changeKind, 'reconfirmed');
  setTime(NOW + DAY);
  const updated = await worker.call(`/requests/${request.id}/responses`, answer(request, {expectedResponseId: b.id, observedAt: null, status: 'unknown'}));
  assert.equal(updated.status, 201);
  assert.equal(updated.data.response.confirmedAt, undefined);
  state = (await owner.call('/state')).data;
  assert.equal(state.briefings[0].rows[0].freshness, 'undated');
});

test('reconfirmation cannot bypass assignments, pending clarification or a closed question', async t => {
  const {client} = await setup(t);
  const owner = client(), worker = client();
  const manager = await owner.signup();
  await member(owner, worker);
  const {question, request} = await launch(owner, manager.id);
  assert.equal((await owner.call(`/requests/${request.id}/reconfirm`, {expectedVersion: 1, expectedResponseId: null})).status, 409);
  const response = (await owner.call(`/requests/${request.id}/responses`, answer(request))).data.response;
  assert.equal((await worker.call(`/requests/${request.id}/reconfirm`, {expectedVersion: 1, expectedResponseId: response.id})).status, 403);
  await owner.call(`/requests/${request.id}`, {expectedVersion: 1, assigneeId: manager.id, followup: 'Please check the approval source'}, 'PATCH');
  assert.equal((await owner.call(`/requests/${request.id}/reconfirm`, {expectedVersion: 2, expectedResponseId: response.id})).status, 409);
  let state = (await owner.call('/state')).data;
  assert.equal(state.responses.length, 1);
  assert.equal(state.briefings[0].earlierConcerns.length, 1);
  assert.equal(state.briefings[0].decisionRequests.length, 1);
  await owner.call(`/questions/${question.id}/close`, {expectedVersion: question.version});
  assert.equal((await owner.call(`/requests/${request.id}/reconfirm`, {expectedVersion: 2, expectedResponseId: response.id})).status, 409);
});

test('check-in reviewed drafts preserve source lineage and reject spoofed or duplicated request IDs', async t => {
  const {client} = await setup(t);
  const owner = client(), user = await owner.signup();
  const original = await launch(owner, user.id, {freshnessDays: 3});
  const response = (await owner.call(`/requests/${original.request.id}/responses`, answer(original.request))).data.response;
  const body = {expectedVersion: original.question.version, text: 'Can B17 ship this week?', context: 'October 5–9: new period', dueDate: '2026-10-09'};
  assert.equal((await owner.call(`/questions/${original.question.id}/check-ins`, {...body, context: ''})).status, 400);
  const created = await owner.call(`/questions/${original.question.id}/check-ins`, body);
  assert.equal(created.status, 201);
  const {question, requests} = created.data;
  assert.equal(question.status, 'draft');
  assert.equal(question.round, 2);
  assert.equal(question.freshnessDays, 3);
  assert.equal(requests[0].previousResponseId, response.id);
  assert.equal((await owner.call(`/questions/${original.question.id}/check-ins`, body)).status, 409);
  const draftRow = {id: requests[0].id, title: 'Updated scope', role: 'Production', prompt: 'New period only', assigneeId: user.id};
  const patch = {expectedVersion: question.version, context: question.context, dueDate: question.dueDate, requests: [draftRow]};
  assert.equal((await owner.call(`/questions/${question.id}`, {...patch, requests: [draftRow, draftRow]}, 'PATCH')).status, 400);
  assert.equal((await owner.call(`/questions/${question.id}`, {...patch, requests: [{...draftRow, id: original.request.id}]}, 'PATCH')).status, 404);
  assert.equal((await owner.call(`/questions/${question.id}`, {...patch, requests: [{...draftRow, previousResponseId: response.id}]}, 'PATCH')).status, 400);
  const saved = await owner.call(`/questions/${question.id}`, patch, 'PATCH');
  assert.equal(saved.status, 200);
  assert.equal(saved.data.requests[0].id, requests[0].id);
  assert.equal(saved.data.requests[0].previousRequestId, original.request.id);
  assert.equal(saved.data.requests[0].previousResponseId, response.id);
  const state = (await owner.call('/state')).data;
  assert.equal(state.responses.length, 1);
  assert.equal(state.briefings.find(b => b.questionId === question.id).answered, 0);
});

test('decision source references are exact and malformed actions cannot partially save a decision', async t => {
  const {client} = await setup(t);
  const owner = client(), user = await owner.signup();
  const first = await launch(owner, user.id), other = await launch(owner, user.id);
  const a = (await owner.call(`/requests/${first.request.id}/responses`, answer(first.request))).data.response;
  const b = (await owner.call(`/requests/${other.request.id}/responses`, answer(other.request))).data.response;
  const endpoint = `/questions/${first.question.id}/decisions`;
  assert.equal((await owner.call(endpoint, {text: 'Invalid source', responseIds: [b.id]})).status, 404);
  assert.equal((await owner.call(endpoint, {text: 'Duplicate source', responseIds: [a.id, a.id]})).status, 400);
  assert.equal((await owner.call(endpoint, {text: 'Invalid action', responseIds: [a.id], action: {title: 'Do this', assigneeId: user.id}})).status, 400);
  assert.equal((await owner.call('/state')).data.decisions.length, 0);
  await owner.call(endpoint, {text: 'A legacy unlinked note'});
  let state = (await owner.call('/state')).data;
  assert.equal(state.briefings.find(x => x.questionId === first.question.id).decisionRequests.length, 1);
  await owner.call(endpoint, {text: 'Authorize QA owner', responseIds: [a.id]});
  state = (await owner.call('/state')).data;
  assert.equal(state.briefings.find(x => x.questionId === first.question.id).decisionRequests.length, 0);
  assert.equal(state.briefings.find(x => x.questionId === first.question.id).attention.length, 1);
  const next = await owner.call(`/requests/${first.request.id}/responses`, answer(first.request, {expectedResponseId: a.id, decisionNeeded: 'Another choice is needed'}));
  assert.equal(next.status, 201);
  state = (await owner.call('/state')).data;
  assert.equal(state.briefings.find(x => x.questionId === first.question.id).decisionRequests[0].response.id, next.data.response.id);
});

test('action result/acceptance preserves history and requires explicit manager reopening', async t => {
  const {client} = await setup(t);
  const owner = client(), worker = client(), outsider = client();
  const manager = await owner.signup(), operator = await member(owner, worker);
  await member(owner, outsider, 'Other');
  const {question} = await launch(owner, manager.id);
  const decision = await owner.call(`/questions/${question.id}/decisions`, {text: 'Verify the QA release', action: {
    title: 'Obtain QA release', expectedResult: 'An authorized approval or an explicit unresolved issue', assigneeId: operator.id, dueDate: '2026-09-30'}});
  assert.equal(decision.status, 201);
  let action = decision.data.action;
  const update = (status, note = 'Synthetic update') => ({expectedVersion: action.version, status, note, source: 'QA register B17'});
  assert.equal((await outsider.call(`/actions/${action.id}`, update('in_progress'), 'PATCH')).status, 403);
  assert.equal((await owner.call(`/actions/${action.id}`, update('accepted'), 'PATCH')).status, 409);
  assert.equal((await worker.call(`/actions/${action.id}`, update('reported_done', ''), 'PATCH')).status, 400);
  await owner.call(`/questions/${question.id}/close`, {expectedVersion: question.version});
  let result = await worker.call(`/actions/${action.id}`, update('reported_done', 'QA confirmation recorded'), 'PATCH');
  assert.equal(result.status, 200);
  const oldVersion = action.version;
  action = result.data.action;
  assert.equal((await worker.call(`/actions/${action.id}`, {...update('blocked'), expectedVersion: oldVersion}, 'PATCH')).status, 409);
  assert.equal((await worker.call(`/actions/${action.id}`, update('accepted'), 'PATCH')).status, 403);
  result = await owner.call(`/actions/${action.id}`, update('accepted', 'Reviewed source and accept the reported action result'), 'PATCH');
  assert.equal(result.status, 200);
  action = result.data.action;
  assert.equal(action.updates[0].authorId, operator.id);
  assert.equal(action.updates[1].authorId, manager.id);
  assert.equal((await worker.call(`/actions/${action.id}`, update('open'), 'PATCH')).status, 403);
  assert.equal((await owner.call(`/actions/${action.id}`, update('in_progress'), 'PATCH')).status, 409);
  let state = (await owner.call('/state')).data;
  assert.equal(state.briefings[0].openActions.length, 0);
  assert.equal(state.briefings[0].answered, 0);
  result = await owner.call(`/actions/${action.id}`, update('open', 'Need one additional verification'), 'PATCH');
  assert.equal(result.status, 200);
  assert.equal(result.data.action.updates.length, 3);
  state = (await owner.call('/state')).data;
  assert.equal(state.briefings[0].overdueActions.length, 1);
});

test('tenant boundaries cover actions, check-ins, reconfirmation and decision sources', async t => {
  const {client} = await setup(t);
  const a = client(), b = client(), ua = await a.signup(), ub = await b.signup();
  const qa = await launch(a, ua.id), qb = await launch(b, ub.id);
  const response = (await a.call(`/requests/${qa.request.id}/responses`, answer(qa.request))).data.response;
  const saved = await a.call(`/questions/${qa.question.id}/decisions`, {text: 'Confirm', responseIds: [response.id], action: {title: 'Confirm', expectedResult: 'Evidence', assigneeId: ua.id}});
  assert.equal(saved.status, 201);
  assert.equal((await b.call(`/actions/${saved.data.action.id}`, {expectedVersion: 1, status: 'reported_done', note: 'No'}, 'PATCH')).status, 404);
  assert.equal((await b.call(`/questions/${qa.question.id}/check-ins`, {expectedVersion: qa.question.version, text: 'Next', context: 'New period'})).status, 404);
  assert.equal((await b.call(`/requests/${qa.request.id}/reconfirm`, {expectedVersion: 1, expectedResponseId: response.id})).status, 404);
  assert.equal((await b.call(`/questions/${qb.question.id}/decisions`, {text: 'No', responseIds: [response.id]})).status, 404);
  assert.equal((await b.call(`/questions/${qb.question.id}/decisions`, {text: 'No', action: {title: 'No', expectedResult: 'No', assigneeId: ua.id}})).status, 404);
  const state = (await b.call('/state')).data;
  assert.equal(state.actions.length, 0);
  assert.equal(state.decisions.length, 0);
});

test('reused sources preserve observation and original attribution without changing historical response', async t => {
  const {client} = await setup(t);
  const owner = client(), user = await owner.signup();
  const first = await launch(owner, user.id), second = await launch(owner, user.id);
  const source = (await owner.call(`/requests/${first.request.id}/responses`, answer(first.request))).data.response;
  const reused = await owner.call(`/requests/${second.request.id}/responses`, answer(second.request, {reuseResponseId: source.id, text: 'Scope checked independently', status: 'unknown'}));
  assert.equal(reused.status, 201);
  assert.equal(reused.data.response.reused.observedAt, source.observedAt);
  assert.equal(reused.data.response.reused.authorId, source.authorId);
  assert.equal(reused.data.response.reused.source, source.source);
  assert.equal(reused.data.response.reused.requestVersion, source.requestVersion);
  const state = (await owner.call('/state')).data;
  assert.deepEqual(state.responses.find(a => a.id === source.id), source);
});

test('legacy records gain view defaults without overwrites and schema version never moves backward', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quickview-v02-schema-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const path = join(dir, 'fixture.sqlite');
  const fixture = openStore(path);
  const company = fixture.createCompany({name: 'Legacy', createdAt: '2025-01-01T00:00:00Z'});
  const legacy = {id: 'legacy-q', text: 'Legacy question', status: 'live', version: 1, createdAt: '2025-01-01T00:00:00Z'};
  fixture.insert(company.id, 'questions', legacy);
  fixture.db.exec('PRAGMA user_version = 3');
  fixture.close();
  const reopened = openStore(path);
  try {
    assert.equal(reopened.db.prepare('PRAGMA user_version').get().user_version, 3);
    assert.deepEqual(reopened.get(company.id, 'questions', legacy.id), legacy);
    const briefing = buildBriefing(legacy, [], [], [], {now: NOW});
    assert.equal(briefing.freshnessDays, 7);
    assert.deepEqual(briefing.actions, []);
  } finally { reopened.close(); }
});
