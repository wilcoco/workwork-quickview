import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const PASSWORD = 'Synthetic conversation password 2026!';
const PLAN = {engine: 'guided', note: 'Synthetic plan', requests: [{title: 'QA release', role: 'Quality', prompt: 'What is the release status?'}]};

async function setup(t, options = {}) {
  const app = createApp({databasePath: ':memory:', production: false, now: () => NOW,
    authRateLimit: 1000, identityRateLimit: 1000, companyWriteLimit: 1000,
    planQuestion: async () => PLAN, ...options});
  const address = await app.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  let sequence = 0;
  function client() {
    let cookie = '', csrf = '';
    return {
      async call(path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) {
        const response = await fetch(origin + '/api' + path, {method,
          headers: {'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, ...headers},
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
  return {app, client};
}

async function member(owner, client, name = 'Operator') {
  const invite = await owner.call('/invites', {email: `${name.toLowerCase()}@example.test`});
  assert.equal(invite.status, 201);
  const result = await client.call('/join', {token: invite.data.invite.token, name, password: PASSWORD});
  assert.equal(result.status, 201);
  return result.data.user;
}

async function liveQuestion(owner, assigneeId) {
  const created = await owner.call('/questions', {text: 'Can B17 ship?', context: 'Synthetic batch B17'});
  assert.equal(created.status, 201);
  let {question, requests} = created.data;
  const plan = await owner.call(`/questions/${question.id}`, {expectedVersion: question.version, context: question.context,
    requests: requests.map(({id, title, role, prompt}) => ({id, title, role, prompt, assigneeId}))}, 'PATCH');
  assert.equal(plan.status, 200);
  ({question, requests} = plan.data);
  const launched = await owner.call(`/questions/${question.id}/launch`, {expectedVersion: question.version});
  assert.equal(launched.status, 200);
  return {question: launched.data.question, request: requests[0]};
}

async function respond(c, request) {
  const result = await c.call(`/requests/${request.id}/responses`, {expectedVersion: request.version,
    expectedResponseId: null, text: 'B17 awaits QA approval.', status: 'blocked',
    source: 'Synthetic register B17', observedAt: '2026-09-26T08:00:00Z'});
  assert.equal(result.status, 201);
  return result.data.response;
}

const conversation = (c, question, parent, kind, extra = {}) => c.call(`/questions/${question.id}/conversation`,
  {parentId: parent.id, kind, text: 'Synthetic contribution', ...extra});
const reaction = (c, question, target, active, extra = {}) => c.call(`/questions/${question.id}/reactions`,
  {targetId: target.id, active, ...extra});
const state = async c => {const result = await c.call('/state'); assert.equal(result.status, 200); return result.data;};

test('context and concerns create exact immutable parents without changing recorded response or briefing coverage', async t => {
  const {client} = await setup(t);
  const owner = client(), colleague = client(), user = await owner.signup();
  await member(owner, colleague);
  const {question, request} = await liveQuestion(owner, user.id), response = await respond(owner, request);
  const before = await state(owner);
  const context = await conversation(colleague, question, response, 'context', {text: 'Additional supplier detail', source: 'Supplier reference'});
  assert.equal(context.status, 201);
  assert.equal(context.data.entry.parentId, response.id);
  assert.equal(context.data.entry.requestId, request.id);
  assert.equal(context.data.entry.assigneeId, null);
  const concern = await conversation(colleague, question, context.data.entry, 'concern', {text: 'The supplier date is still provisional.'});
  assert.equal(concern.status, 201);
  assert.equal(concern.data.entry.parentId, context.data.entry.id);
  const after = await state(owner);
  assert.deepEqual(after.responses, before.responses);
  assert.deepEqual(after.briefings, before.briefings);
  assert.equal(after.conversationEntries.length, 2);
  assert.equal(after.conversations[question.id].concerns[0].id, concern.data.entry.id);
  assert.equal(after.conversations[question.id].openQuestions.length, 0);
  assert.ok(after.conversations[question.id].links.some(link => link.sourceId === concern.data.entry.id && link.targetId === context.data.entry.id && link.type === 'raises_concern'));
  assert.equal((await colleague.call(`/conversation/${context.data.entry.id}`, {text: 'Overwrite'}, 'PATCH')).status, 404);
});

test('only manager can authorize assigned follow-up and only assignee or manager can answer it', async t => {
  const {client} = await setup(t);
  const owner = client(), operator = client(), other = client(), manager = await owner.signup();
  const worker = await member(owner, operator), otherUser = await member(owner, other, 'Other');
  const {question, request} = await liveQuestion(owner, manager.id), response = await respond(owner, request);
  assert.equal((await conversation(operator, question, response, 'question', {assigneeId: worker.id})).status, 403);
  assert.equal((await conversation(owner, question, response, 'question')).status, 400);
  const followup = await conversation(owner, question, response, 'question', {assigneeId: worker.id, text: 'Who can provide the release record?'});
  assert.equal(followup.status, 201);
  assert.equal(followup.data.entry.authorId, manager.id);
  assert.equal(followup.data.entry.assigneeId, worker.id);
  assert.equal((await conversation(other, question, followup.data.entry, 'answer')).status, 403);
  const context = await conversation(other, question, followup.data.entry, 'context', {text: 'I may have a supporting contact.'});
  assert.equal(context.status, 201);
  assert.equal(context.data.entry.authorId, otherUser.id);
  assert.equal((await state(owner)).conversations[question.id].openQuestions.length, 1);
  const answer = await conversation(operator, question, followup.data.entry, 'answer', {text: 'The responsible QA engineer has the release record.'});
  assert.equal(answer.status, 201);
  const revised = await conversation(owner, question, followup.data.entry, 'answer', {text: 'Owner confirms the responsible contact.'});
  assert.equal(revised.status, 201);
  const after = await state(owner);
  assert.equal(after.conversations[question.id].openQuestions.length, 0);
  assert.deepEqual(after.conversationEntries.filter(e => e.kind === 'answer').map(e => e.authorId), [worker.id, manager.id]);
  assert.equal(after.briefings[0].answered, 1);
  assert.equal(after.briefings[0].rows[0].response.status, 'blocked');
});

test('closed owner questions retain assigned replies, context, concerns and Helpful but block new assignments', async t => {
  const {client} = await setup(t);
  const owner = client(), operator = client(), manager = await owner.signup(), worker = await member(owner, operator);
  const {question, request} = await liveQuestion(owner, manager.id), response = await respond(owner, request);
  const followup = await conversation(owner, question, response, 'question', {assigneeId: worker.id});
  assert.equal(followup.status, 201);
  assert.equal((await owner.call(`/questions/${question.id}/close`, {expectedVersion: question.version})).status, 200);
  assert.equal((await conversation(operator, question, followup.data.entry, 'answer')).status, 201);
  assert.equal((await conversation(operator, question, response, 'context')).status, 201);
  assert.equal((await conversation(operator, question, response, 'concern')).status, 201);
  assert.equal((await reaction(operator, question, response, true)).status, 200);
  assert.equal((await conversation(owner, question, response, 'question', {assigneeId: worker.id})).status, 409);
  assert.equal((await state(owner)).questions[0].status, 'closed');
});

test('reply validation requires a conversation question and refuses forged authors, requests, relation labels or cycles', async t => {
  const {client} = await setup(t);
  const owner = client(), user = await owner.signup();
  const {question, request} = await liveQuestion(owner, user.id), response = await respond(owner, request);
  assert.equal((await conversation(owner, question, response, 'answer')).status, 400);
  assert.equal((await conversation(owner, question, response, 'vote')).status, 400);
  assert.equal((await conversation(owner, question, response, 'context', {assigneeId: user.id})).status, 400);
  for (const extra of [{authorId: user.id}, {requestId: request.id}, {id: randomUUID()}, {createdAt: '2020-01-01'}, {relation: 'approved'}]) {
    assert.equal((await conversation(owner, question, response, 'context', extra)).status, 400);
  }
  assert.equal((await conversation(owner, question, {id: randomUUID()}, 'context')).status, 404);
  assert.equal((await conversation(owner, question, response, 'context', {text: ' '.repeat(5)})).status, 400);
  assert.equal((await conversation(owner, question, response, 'context', {text: 'x'.repeat(3001)})).status, 400);
  assert.equal((await conversation(owner, question, response, 'context', {source: 'x'.repeat(1001)})).status, 400);
  assert.deepEqual((await state(owner)).conversationEntries, []);
});

test('parent and target must be in the exact company and owner question, including inherited request chain', async t => {
  const {app, client} = await setup(t);
  const owner = client(), foreign = client(), user = await owner.signup(), foreignUser = await foreign.signup();
  const first = await liveQuestion(owner, user.id), second = await liveQuestion(owner, user.id), elsewhere = await liveQuestion(foreign, foreignUser.id);
  const response = await respond(owner, first.request), secondResponse = await respond(owner, second.request);
  const entry = (await conversation(owner, first.question, response, 'context')).data.entry;
  for (const parent of [response, entry]) {
    assert.equal((await conversation(owner, second.question, parent, 'concern')).status, 404);
    assert.equal((await reaction(owner, second.question, parent, true)).status, 404);
    assert.equal((await conversation(foreign, elsewhere.question, parent, 'context')).status, 404);
    assert.equal((await reaction(foreign, elsewhere.question, parent, true)).status, 404);
  }
  assert.equal((await conversation(owner, first.question, response, 'question', {assigneeId: foreignUser.id})).status, 404);
  assert.equal((await conversation(owner, first.question, first.request, 'context')).status, 404);
  assert.equal((await reaction(owner, first.question, first.question, true)).status, 404);
  // Corrupt synthetic fixture: metadata's questionId must not override its actual request chain.
  const malformed = {...secondResponse, id: randomUUID(), questionId: first.question.id};
  app.store.insert(app.store.user(user.id).companyId, 'responses', malformed);
  assert.equal((await conversation(owner, first.question, malformed, 'context')).status, 404);
  assert.equal((await reaction(owner, first.question, malformed, true)).status, 404);
  const otherState = await state(foreign);
  assert.deepEqual(otherState.conversationEntries, []);
  assert.deepEqual(otherState.reactionEvents, []);
});

test('Helpful is actor-specific, append-only and idempotent, and does not resolve written concerns', async t => {
  const {client} = await setup(t);
  const owner = client(), operator = client(), manager = await owner.signup(), worker = await member(owner, operator);
  const {question, request} = await liveQuestion(owner, manager.id), response = await respond(owner, request);
  const concern = (await conversation(operator, question, response, 'concern')).data.entry;
  const noOp = await reaction(owner, question, concern, false);
  assert.equal(noOp.status, 200);
  assert.equal(noOp.data.reaction, null);
  assert.equal((await state(owner)).reactionEvents.length, 0);
  const first = await reaction(owner, question, concern, true);
  assert.equal(first.status, 200);
  const duplicates = await Promise.all([reaction(owner, question, concern, true), reaction(owner, question, concern, true)]);
  assert.ok(duplicates.every(result => result.status === 200 && result.data.reaction.id === first.data.reaction.id));
  assert.equal((await reaction(operator, question, concern, true)).status, 200);
  let current = await state(owner);
  assert.equal(current.reactionEvents.length, 2);
  assert.equal(current.conversations[question.id].helpfulByTarget[concern.id].count, 2);
  assert.deepEqual(new Set(current.conversations[question.id].helpfulByTarget[concern.id].userIds), new Set([manager.id, worker.id]));
  assert.equal((await reaction(owner, question, concern, false)).status, 200);
  assert.equal((await reaction(owner, question, concern, false)).status, 200);
  assert.equal((await reaction(owner, question, concern, true, {authorId: worker.id})).status, 400);
  assert.equal((await reaction(owner, question, concern, 'true')).status, 400);
  current = await state(owner);
  assert.equal(current.reactionEvents.length, 3);
  assert.equal(current.conversations[question.id].helpfulByTarget[concern.id].count, 1);
  assert.deepEqual(current.conversations[question.id].helpfulByTarget[concern.id].userIds, [worker.id]);
  assert.equal(current.conversations[question.id].concerns.length, 1);
  assert.equal(current.briefings[0].rows[0].response.status, 'blocked');
});

test('draft roots reject writes and never expose stored draft conversation data to members', async t => {
  const {app, client} = await setup(t);
  const owner = client(), operator = client(), user = await owner.signup();
  await member(owner, operator);
  const drafted = await owner.call('/questions', {text: 'Private draft'});
  const question = drafted.data.question, request = drafted.data.requests[0];
  const companyId = app.store.user(user.id).companyId;
  const response = {id: randomUUID(), questionId: question.id, requestId: request.id, requestVersion: 1,
    text: 'Synthetic stored record', status: 'unknown', createdAt: new Date(NOW).toISOString(), authorId: user.id};
  const hidden = {id: randomUUID(), questionId: question.id, requestId: request.id, parentId: response.id,
    kind: 'context', text: 'Synthetic hidden draft context', createdAt: new Date(NOW).toISOString(), authorId: user.id};
  app.store.insert(companyId, 'responses', response);
  app.store.insert(companyId, 'conversationEntries', hidden);
  app.store.insert(companyId, 'reactionEvents', {id: randomUUID(), questionId: question.id, targetId: hidden.id,
    kind: 'helpful', active: true, authorId: user.id, createdAt: new Date(NOW).toISOString()});
  assert.equal((await conversation(owner, question, response, 'context')).status, 409);
  assert.equal((await reaction(owner, question, response, true)).status, 409);
  assert.equal((await conversation(operator, question, response, 'context')).status, 404);
  assert.equal((await reaction(operator, question, response, true)).status, 404);
  const memberState = await state(operator);
  assert.deepEqual(memberState.conversationEntries, []);
  assert.deepEqual(memberState.reactionEvents, []);
  assert.deepEqual(memberState.conversations, {});
});

test('inactive assigned follow-ups remain visible and manager can answer without rewriting or reassigning history', async t => {
  const {client} = await setup(t);
  const owner = client(), operator = client(), manager = await owner.signup(), worker = await member(owner, operator);
  const {question, request} = await liveQuestion(owner, manager.id), response = await respond(owner, request);
  const followup = (await conversation(owner, question, response, 'question', {assigneeId: worker.id})).data.entry;
  assert.equal((await owner.call(`/members/${worker.id}`, {active: false, expectedActive: true}, 'PATCH')).status, 200);
  assert.equal((await conversation(owner, question, response, 'question', {assigneeId: worker.id})).status, 404);
  const pending = await state(owner);
  assert.equal(pending.conversations[question.id].openQuestions[0].id, followup.id);
  assert.equal(pending.members.find(m => m.id === worker.id).active, false);
  assert.equal((await conversation(operator, question, followup, 'answer')).status, 401);
  assert.equal((await conversation(owner, question, followup, 'answer')).status, 201);
  const after = await state(owner);
  assert.equal(after.conversationEntries.find(e => e.id === followup.id).assigneeId, worker.id);
  assert.equal(after.conversations[question.id].openQuestions.length, 0);
});

test('conversation and reactions retain CSRF protection and company write limits', async t => {
  const {client} = await setup(t, {companyWriteLimit: 3});
  const owner = client(), user = await owner.signup();
  const {question, request} = await liveQuestion(owner, user.id), response = await respond(owner, request);
  const route = `/questions/${question.id}/conversation`;
  const body = {parentId: response.id, kind: 'context', text: 'Synthetic extra detail'};
  assert.equal((await owner.call(route, body, 'POST', {'X-CSRF-Token': ''})).status, 403);
  assert.equal((await owner.call(`/questions/${question.id}/reactions`, {targetId: response.id, active: true}, 'POST', {'X-CSRF-Token': ''})).status, 403);
  assert.equal((await owner.call(route, body)).status, 201);
  assert.equal((await reaction(owner, question, response, true)).status, 429);
});

test('v0.2 records remain unchanged and source relations stay attached to the selected historical response', async t => {
  const {app, client} = await setup(t);
  const owner = client(), user = await owner.signup();
  const {question, request} = await liveQuestion(owner, user.id), original = await respond(owner, request);
  const before = await state(owner);
  assert.deepEqual(before.conversationEntries, []);
  assert.deepEqual(before.reactionEvents, []);
  assert.ok(before.conversations[question.id].nodes.some(node => node.id === original.id));
  const confirmed = await owner.call(`/requests/${request.id}/reconfirm`, {expectedVersion: request.version, expectedResponseId: original.id});
  assert.equal(confirmed.status, 201);
  const context = await conversation(owner, question, original, 'context', {text: 'This clarification refers to the earlier source.'});
  assert.equal(context.status, 201);
  assert.equal(context.data.entry.parentId, original.id);
  const after = await state(owner);
  assert.deepEqual(after.responses.find(r => r.id === original.id), original);
  assert.equal(after.briefings[0].rows[0].response.id, confirmed.data.response.id);
  assert.ok(after.conversations[question.id].links.some(link => link.sourceId === context.data.entry.id && link.targetId === original.id));
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version, 3);
});
