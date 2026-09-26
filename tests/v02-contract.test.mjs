import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { buildBriefing, evidenceSuggestions } from '../server/briefing.mjs';

// Independent acceptance fixtures: no production data, external model, or store internals.
const INITIAL_NOW = Date.parse('2026-09-26T10:00:00.000Z');
const PASSWORD = 'Synthetic acceptance password 2026!';
const OLD_OBSERVATION = '2026-08-01T09:00:00.000Z';
const PLAN = [
  { title: 'Delivery commitment', role: 'Sales', prompt: 'Which orders are due and what is promised?' },
  { title: 'Release evidence', role: 'Quality', prompt: 'What is the release situation and supporting evidence?' },
];

async function setup(t) {
  let now = INITIAL_NOW;
  const app = createApp({
    databasePath: ':memory:', production: false,
    now: () => now, authRateLimit: 1000, identityRateLimit: 1000,
    planQuestion: async () => ({ engine: 'guided', note: 'Synthetic test plan.', requests: PLAN }),
  });
  const address = await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  function client() {
    let cookie = '', csrfToken = '';
    return {
      async call(path, body, method = body === undefined ? 'GET' : 'POST') {
        const response = await fetch(`${origin}/api${path}`, {
          method,
          headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrfToken },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const data = await response.json();
        if (data.csrfToken) csrfToken = data.csrfToken;
        return { status: response.status, data };
      },
      async signup(tag) {
        const result = await this.call('/signup', {
          companyName: `Acceptance ${tag}`, name: `Owner ${tag}`,
          email: `${tag}@example.test`, password: PASSWORD,
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        return result.data.user;
      },
      async state() {
        const result = await this.call('/state');
        assert.equal(result.status, 200, JSON.stringify(result.data));
        return result.data;
      },
    };
  }
  return { client, advance: milliseconds => { now += milliseconds; } };
}

async function join(owner, member, name) {
  const invitation = await owner.call('/invites', { email: `${name}@example.test` });
  assert.equal(invitation.status, 201, JSON.stringify(invitation.data));
  const result = await member.call('/join', { token: invitation.data.invite.token, name, password: PASSWORD });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.user;
}

async function launch(owner, assigneeId, options = {}) {
  const drafted = await owner.call('/questions', {
    text: 'Can we deliver orders D17 and D18 this Friday?',
    context: 'Review only this week’s customer commitments.',
    dueDate: '2026-10-02', freshnessDays: 7, ...options,
  });
  assert.equal(drafted.status, 201, JSON.stringify(drafted.data));
  const configured = await owner.call(`/questions/${drafted.data.question.id}`, {
    expectedVersion: drafted.data.question.version,
    context: drafted.data.question.context, dueDate: drafted.data.question.dueDate,
    freshnessDays: drafted.data.question.freshnessDays,
    requests: drafted.data.requests.map(request => ({
      title: request.title, role: request.role, prompt: request.prompt, assigneeId,
    })),
  }, 'PATCH');
  assert.equal(configured.status, 200, JSON.stringify(configured.data));
  const launched = await owner.call(`/questions/${drafted.data.question.id}/launch`, {
    expectedVersion: configured.data.question.version,
  });
  assert.equal(launched.status, 200, JSON.stringify(launched.data));
  return { question: launched.data.question, requests: configured.data.requests };
}

async function respond(client, request, overrides = {}) {
  const result = await client.call(`/requests/${request.id}/responses`, {
    expectedVersion: request.version, expectedResponseId: null,
    text: 'Order D17 is awaiting release confirmation.', status: 'blocked',
    source: 'Synthetic release record D17 / revision 1',
    observedAt: OLD_OBSERVATION,
    nextStep: 'Check the release evidence with Quality.',
    decisionNeeded: 'Please name the authorized release approver.',
    ...overrides,
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.response;
}

function briefingFor(state, questionId) {
  const briefing = state.briefings.find(item => item.questionId === questionId);
  assert.ok(briefing, `Missing briefing for ${questionId}`);
  return briefing;
}

test('v0.2 answers received stay separate from old, undated, future, and missing evidence', () => {
  const question = { id: 'q', status: 'live', freshnessDays: 7 };
  const requests = ['recent', 'aging', 'undated', 'future', 'missing'].map(id => ({
    id, questionId: question.id, version: 1,
  }));
  const observations = {
    recent: '2026-09-25T10:00:00.000Z', aging: OLD_OBSERVATION,
    undated: null, future: '2026-09-27T10:00:00.000Z',
  };
  const responses = Object.entries(observations).map(([requestId, observedAt]) => ({
    id: `${requestId}-response`, requestId, requestVersion: 1, status: 'on_track',
    text: 'A person reported this situation.', observedAt,
    createdAt: '2026-09-26T10:00:00.000Z',
  }));
  const briefing = buildBriefing(question, requests, responses, [], { now: INITIAL_NOW });
  assert.equal(briefing.answered, 4, 'Receiving old/undated evidence still counts as a response');
  assert.equal(briefing.total, 5);
  assert.deepEqual(Object.fromEntries(briefing.rows.map(row => [row.requestId, row.freshness])), {
    recent: 'recent', aging: 'aging', undated: 'undated', future: 'future', missing: 'missing',
  });
  assert.deepEqual(briefing.needsRecheck.map(row => row.requestId).sort(), ['aging', 'future', 'undated']);
  assert.equal(briefing.rows.find(row => row.requestId === 'recent').ageDays, 1);
  assert.equal(briefing.rows.find(row => row.requestId === 'aging').referenceTime, OLD_OBSERVATION);
  assert.equal(briefing.rows.find(row => row.requestId === 'undated').referenceTime, null,
    'Submission time must not fill in a missing observation time');
  assert.equal(briefing.rows.find(row => row.requestId === 'missing').current, false);
  assert.equal(briefing.kpi, undefined);
});

test('v0.2 reconfirmation preserves the old observation and original author while recording the new attestation', async t => {
  const { client, advance } = await setup(t);
  const owner = client(), member = client();
  const manager = await owner.signup('reconfirm');
  const employee = await join(owner, member, 'reconfirm-member');
  const { question, requests } = await launch(owner, employee.id);
  const original = await respond(member, requests[0]);
  const before = await owner.state();
  assert.equal(briefingFor(before, question.id).needsRecheck.length, 1);
  advance(60_000);

  const confirmed = await owner.call(`/requests/${requests[0].id}/reconfirm`, {
    expectedVersion: requests[0].version, expectedResponseId: original.id,
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  const latest = confirmed.data.response;
  assert.equal(latest.kind, 'reconfirmation');
  assert.equal(latest.reconfirmedResponseId, original.id);
  assert.equal(latest.authorId, manager.id);
  assert.notEqual(latest.id, original.id);
  for (const field of ['text', 'status', 'source', 'observedAt', 'nextStep', 'decisionNeeded']) {
    assert.equal(latest[field], original[field], `${field} must not change when reaffirming`);
  }
  assert.equal(latest.confirmedAt, '2026-09-26T10:01:00.000Z');
  const state = await owner.state();
  assert.deepEqual(state.responses.find(response => response.id === original.id), original);
  assert.equal(original.authorId, employee.id);
  const row = briefingFor(state, question.id).rows.find(item => item.requestId === requests[0].id);
  assert.equal(row.freshness, 'recent');
  assert.equal(row.referenceTime, latest.confirmedAt);
  assert.equal(row.previousResponse.id, original.id);
  assert.equal(row.changeKind, 'reconfirmed');
  assert.equal(row.historyCount, 2);

  const duplicate = await owner.call(`/requests/${requests[0].id}/reconfirm`, {
    expectedVersion: requests[0].version, expectedResponseId: original.id,
  });
  assert.equal(duplicate.status, 409, 'A retry against the superseded response must not append again');
  assert.equal((await owner.state()).responses.length, 2);
});

test('v0.2 pending clarification cannot be bypassed by reconfirming an obsolete answer', async t => {
  const { client } = await setup(t);
  const owner = client(), member = client();
  await owner.signup('clarification');
  const employee = await join(owner, member, 'clarification-member');
  const { question, requests } = await launch(owner, employee.id);
  const response = await respond(member, requests[0]);
  const followup = await owner.call(`/requests/${requests[0].id}`, {
    expectedVersion: requests[0].version, assigneeId: employee.id,
    followup: 'Who can authorize release? Supply the current evidence.',
  }, 'PATCH');
  assert.equal(followup.status, 200);
  const attempt = await member.call(`/requests/${requests[0].id}/reconfirm`, {
    expectedVersion: followup.data.request.version, expectedResponseId: response.id,
  });
  assert.equal(attempt.status, 409);
  const state = await owner.state();
  const briefing = briefingFor(state, question.id);
  assert.equal(briefing.answered, 0);
  assert.equal(state.responses.length, 1);
  assert.ok(briefing.decisionRequests.some(row => row.response.id === response.id),
    'An earlier decision need must remain visible while its clarification is unanswered');
  assert.equal(briefing.rows[0].state, 'update_requested');
  assert.equal(briefing.rows[0].changeKind, 'awaiting');
});

test('v0.2 rejects future observations outside the clock-skew allowance without creating evidence', async t => {
  const { client } = await setup(t);
  const owner = client();
  const manager = await owner.signup('future-observation');
  const { requests } = await launch(owner, manager.id);
  const bad = await owner.call(`/requests/${requests[0].id}/responses`, {
    expectedVersion: requests[0].version, expectedResponseId: null,
    text: 'This observation has not happened yet.', status: 'on_track',
    observedAt: '2026-09-26T10:06:00.000Z',
  });
  assert.equal(bad.status, 400);
  assert.equal((await owner.state()).responses.length, 0);
  await respond(owner, requests[0], { observedAt: '2026-09-26T10:04:00.000Z' });
  assert.equal((await owner.state()).responses.length, 1);
});

test('v0.2 decisions address only linked response IDs and cannot hide a newer request for a decision', async t => {
  const { client, advance } = await setup(t);
  const owner = client();
  const manager = await owner.signup('exact-decisions');
  const { question, requests } = await launch(owner, manager.id);
  const first = await respond(owner, requests[0]);
  const other = await respond(owner, requests[1], { decisionNeeded: 'Choose the dispatch alternative.' });
  const note = await owner.call(`/questions/${question.id}/decisions`, { text: 'Discussed delivery priorities.' });
  assert.equal(note.status, 201);
  assert.equal(briefingFor(await owner.state(), question.id).decisionRequests.length, 2,
    'A general decision note is not proof that every decision request was addressed');
  const linked = await owner.call(`/questions/${question.id}/decisions`, {
    text: 'Quality must identify its authorized approver.', responseIds: [first.id],
  });
  assert.equal(linked.status, 201, JSON.stringify(linked.data));
  let state = await owner.state();
  assert.deepEqual(briefingFor(state, question.id).decisionRequests.map(row => row.response.id), [other.id]);
  assert.ok(state.decisions.some(decision => decision.responseIds?.includes(first.id)));
  assert.equal(briefingFor(state, question.id).rows[0].response.status, 'blocked',
    'Addressing a decision request must not silently resolve its business risk');
  advance(60_000);
  const newer = await respond(owner, requests[0], {
    expectedResponseId: first.id, text: 'The designated approver is unavailable; release remains blocked.',
    decisionNeeded: first.decisionNeeded,
  });
  state = await owner.state();
  assert.deepEqual(briefingFor(state, question.id).decisionRequests.map(row => row.response.id).sort(),
    [newer.id, other.id].sort(), 'Repeated wording with a new source ID is a new decision request');
});

test('v0.2 next check-in stays private and empty of fresh evidence until separately launched', async t => {
  const { client } = await setup(t);
  const owner = client(), member = client();
  await owner.signup('next-check-in');
  const employee = await join(owner, member, 'round-member');
  const { question, requests } = await launch(owner, employee.id, { freshnessDays: 3 });
  const original = await respond(member, requests[0]);
  const input = {
    expectedVersion: question.version,
    text: 'Can we deliver orders D19 and D20 next Friday?',
    context: 'Next week only: D19 and D20, excluding the prior round.', dueDate: '2026-10-09',
  };
  const round = await owner.call(`/questions/${question.id}/check-ins`, input);
  assert.equal(round.status, 201, JSON.stringify(round.data));
  const child = round.data.question;
  assert.equal(child.status, 'draft');
  assert.equal(child.previousQuestionId, question.id);
  assert.equal(child.round, 2);
  assert.equal(child.freshnessDays, 3);
  assert.equal(child.text, input.text);
  assert.equal(child.context, input.context);
  const state = await owner.state();
  const copied = state.requests.filter(request => request.questionId === child.id);
  assert.equal(copied.length, requests.length);
  const copiedWithEvidence = copied.find(request => request.previousRequestId === requests[0].id);
  assert.ok(copiedWithEvidence);
  assert.equal(copiedWithEvidence.previousResponseId, original.id);
  assert.equal(copiedWithEvidence.assigneeId, employee.id, 'Copied assignment is a draft suggestion');
  assert.equal(state.responses.length, 1, 'Prior evidence must not be copied into a fresh response');
  assert.equal(briefingFor(state, child.id).answered, 0);
  assert.ok(briefingFor(state, child.id).rows.every(row => !row.current && row.freshness === 'missing'));
  const employeeState = await member.state();
  assert.ok(employeeState.questions.every(item => item.id !== child.id));
  assert.ok(employeeState.requests.every(item => item.questionId !== child.id));
  assert.equal((await member.call(`/requests/${copiedWithEvidence.id}/responses`, {
    expectedVersion: copiedWithEvidence.version, expectedResponseId: null,
    text: 'A draft must not already be an assignment.', status: 'unknown',
  })).status, 404);
  assert.equal((await owner.call(`/questions/${question.id}/check-ins`, input)).status, 409,
    'A duplicate start request must not create a second round');
  const launched = await owner.call(`/questions/${child.id}/launch`, { expectedVersion: child.version });
  assert.equal(launched.status, 200);
  const liveState = await member.state();
  assert.ok(liveState.questions.some(item => item.id === child.id));
  assert.equal(briefingFor(liveState, child.id).answered, 0,
    'Launching a copied plan still supplies no fresh business facts');
});

test('v0.2 foreign action and source IDs cannot be read through writes or create partial decisions', async t => {
  const { client } = await setup(t);
  const a = client(), b = client();
  const ownerA = await a.signup('isolation-a'), ownerB = await b.signup('isolation-b');
  const qa = await launch(a, ownerA.id), qb = await launch(b, ownerB.id);
  const sourceA = await respond(a, qa.requests[0]);
  const actionDecision = await a.call(`/questions/${qa.question.id}/decisions`, {
    text: 'Collect release evidence.', responseIds: [sourceA.id],
    action: { title: 'Confirm release', expectedResult: 'A dated release decision and its source.', assigneeId: ownerA.id },
  });
  assert.equal(actionDecision.status, 201, JSON.stringify(actionDecision.data));
  const action = (await a.state()).actions[0];
  assert.ok(action);
  const denied = await b.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'in_progress', note: 'Attempt across companies.',
  }, 'PATCH');
  assert.equal(denied.status, 404);
  assert.equal((await b.call(`/questions/${qb.question.id}/decisions`, {
    text: 'Do not allow foreign evidence.', responseIds: [sourceA.id],
    action: { title: 'Test', expectedResult: 'Should not be saved.', assigneeId: ownerB.id },
  })).status, 404);
  assert.equal((await b.call(`/questions/${qb.question.id}/decisions`, {
    text: 'Do not allow a foreign action assignee.',
    action: { title: 'Test', expectedResult: 'Should not be saved.', assigneeId: ownerA.id },
  })).status, 404);
  let stateB = await b.state();
  assert.equal(stateB.decisions.length, 0, 'Invalid actions must roll back their decision');
  assert.equal(stateB.actions.length, 0);
  assert.equal(stateB.responses.length, 0);
  const secondB = await launch(b, ownerB.id);
  const otherQuestionSource = await respond(b, secondB.requests[0]);
  assert.equal((await b.call(`/questions/${qb.question.id}/decisions`, {
    text: 'Same company is not enough; source must belong to this question.', responseIds: [otherQuestionSource.id],
  })).status, 404);
  stateB = await b.state();
  assert.equal(stateB.decisions.length, 0);
  assert.equal((await a.state()).actions[0].updates.length, 0);
});

test('v0.2 a reported result still needs manager acceptance and survives question closure', async t => {
  const { client, advance } = await setup(t);
  const owner = client(), assignee = client(), other = client();
  const manager = await owner.signup('acceptance');
  const employee = await join(owner, assignee, 'action-assignee');
  await join(owner, other, 'action-unassigned');
  const { question, requests } = await launch(owner, employee.id);
  const source = await respond(assignee, requests[0]);
  const decision = await owner.call(`/questions/${question.id}/decisions`, {
    text: 'Obtain the dated release authorization.', responseIds: [source.id],
    action: {
      title: 'Confirm D17 release', expectedResult: 'Release record approved by the authorized person.',
      assigneeId: employee.id, dueDate: '2026-09-25',
    },
  });
  assert.equal(decision.status, 201, JSON.stringify(decision.data));
  let state = await owner.state(), action = state.actions[0];
  assert.equal(action.status, 'open');
  assert.equal(briefingFor(state, question.id).overdueActions.length, 1);
  assert.equal((await other.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'reported_done', note: 'Not assigned to me.',
  }, 'PATCH')).status, 403);
  assert.equal((await owner.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'accepted', note: 'Premature acceptance.',
  }, 'PATCH')).status, 409);
  const closed = await owner.call(`/questions/${question.id}/close`, { expectedVersion: question.version });
  assert.equal(closed.status, 200);
  advance(60_000);
  const reported = await assignee.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'reported_done', note: 'Approval recorded in the release register.',
    source: 'Synthetic release register D17 / revision 2',
  }, 'PATCH');
  assert.equal(reported.status, 200, 'Closing the question must not erase an outstanding obligation');
  state = await owner.state();
  action = state.actions[0];
  assert.equal(action.status, 'reported_done');
  assert.equal(action.updates.length, 1);
  assert.equal(action.updates[0].authorId, employee.id);
  assert.equal(action.updates[0].source, 'Synthetic release register D17 / revision 2');
  const initialHistory = structuredClone(action.updates);
  assert.equal(briefingFor(state, question.id).openActions.length, 1);
  assert.equal(briefingFor(state, question.id).overdueActions.length, 1);
  assert.equal((await assignee.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'accepted', note: 'Self-acceptance is not permitted.',
  }, 'PATCH')).status, 403);
  advance(60_000);
  assert.equal((await owner.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'accepted', note: 'Reviewed the reported release evidence.',
  }, 'PATCH')).status, 200);
  state = await owner.state();
  action = state.actions[0];
  assert.equal(action.status, 'accepted');
  assert.equal(action.updates.at(-1).authorId, manager.id);
  assert.deepEqual(action.updates.slice(0, 1), initialHistory);
  assert.equal(briefingFor(state, question.id).openActions.length, 0);
  assert.equal(briefingFor(state, question.id).overdueActions.length, 0);
  assert.equal((await assignee.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'open', note: 'A member cannot reopen an accepted result.',
  }, 'PATCH')).status, 403);
  assert.equal((await owner.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'blocked', note: 'Manager must explicitly reopen first.',
  }, 'PATCH')).status, 409);
  assert.equal((await owner.call(`/actions/${action.id}`, {
    expectedVersion: action.version, status: 'open', note: 'New evidence requires a fresh check.',
  }, 'PATCH')).status, 200);
  assert.equal(briefingFor(await owner.state(), question.id).openActions.length, 1);
});

test('v0.2 clarification-invalidated evidence is not offered as current reuse material', () => {
  const target = { id: 'target', version: 1, title: 'Bearing delivery production', prompt: 'Check bearing delivery' };
  const source = { id: 'source', version: 2, title: 'Bearing release' };
  const obsolete = {
    id: 'obsolete', requestId: source.id, requestVersion: 1,
    text: 'Bearing delivery is blocked.', createdAt: '2026-09-25T10:00:00.000Z',
  };
  assert.deepEqual(evidenceSuggestions(target, [obsolete], [target, source]), []);
  const current = {
    ...obsolete, id: 'current', requestVersion: 2,
    text: 'Bearing delivery is awaiting a decision.', createdAt: '2026-09-26T10:00:00.000Z',
  };
  assert.deepEqual(evidenceSuggestions(target, [obsolete, current], [target, source]).map(item => item.responseId), ['current']);
});
