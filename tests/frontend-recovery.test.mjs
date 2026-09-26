import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildBriefing } from '../server/briefing.mjs';

const frontendSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function frontend({ forms = [], planContainer = { innerHTML: '' } } = {}) {
  // Execute the real browser script. Only browser I/O is stubbed; no recovery or
  // rendering implementation is copied into this test. Startup's session fetch
  // deliberately remains pending and cannot reach the network.
  const context = vm.createContext({
    URLSearchParams,
    FormData: class {
      constructor(form) { this.values = Object.entries(form.elements || {}).map(([name, element]) => [name, element.value || '']); }
      [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    },
    location: { hash: '', pathname: '/', search: '', origin: 'https://synthetic.example.test' },
    document: {
      addEventListener() {},
      querySelector(selector) {
        assert.equal(selector, '#plan-requests', `Unexpected DOM query: ${selector}`);
        return planContainer;
      },
      querySelectorAll(selector) {
        assert.equal(selector, 'form[data-form]', `Unexpected DOM query: ${selector}`);
        return forms;
      },
    },
    window: { addEventListener() {} },
    fetch: () => new Promise(() => {}),
    setInterval: () => 0,
  });
  vm.runInContext(`${frontendSource}\n;globalThis.acceptance = {
    restoreForm, snapshotForm, questionPage, requestsPage, responseConversation, threadEntries, workspaceKey, retainConversationDraft, resetConversationUI,
    draft(targetId, kind) { return conversationDrafts.get(conversationDraftKey(targetId, kind)); },
    load(nextState, questionId) { state = nextState; selected = questionId; }
  };`, context, { filename: 'public/app.js', timeout: 1000 });
  return context.acceptance;
}

test('draft recovery keeps surviving request lineage and restores deleted cards as new requests', () => {
  const form = {
    dataset: { form: 'plan', id: 'this-question', version: '7' },
    elements: { context: { tagName: 'TEXTAREA', value: 'Latest saved context' } },
  };
  const planContainer = { innerHTML: '' };
  const app = frontend({ forms: [form], planContainer });
  app.load({
    user: { id: 'manager' }, members: [{ id: 'manager', name: 'Synthetic manager', active: true }],
    requests: [
      { id: 'surviving-request', questionId: 'this-question' },
      { id: 'other-question-request', questionId: 'different-question' },
    ],
  }, 'this-question');
  const saved = {
    workspace: app.workspaceKey(), kind: 'plan', id: 'this-question', data: { context: 'My unsaved scope edit' },
    plan: [
      { id: 'surviving-request', title: 'Retained area', role: 'Quality', prompt: 'Keep the current lineage.', assigneeId: 'manager' },
      { id: 'deleted-request', title: 'My removed-card edit', role: 'Production', prompt: 'Preserve this unsaved question.', assigneeId: 'manager' },
      { id: 'other-question-request', title: 'Other scope', role: 'Operations', prompt: 'Never attach another question’s ID.', assigneeId: 'manager' },
    ],
  };
  const original = structuredClone(saved);

  assert.equal(app.restoreForm(saved), true);
  const restoredIds = [...planContainer.innerHTML.matchAll(/data-field="id" value="([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(restoredIds, ['surviving-request', '', ''],
    'Only IDs still owned by the latest draft may be resubmitted to the API');
  assert.match(planContainer.innerHTML, /My removed-card edit/);
  assert.match(planContainer.innerHTML, /Preserve this unsaved question\./);
  assert.match(planContainer.innerHTML, /Keep the current lineage\./);
  assert.equal(form.elements.context.value, 'My unsaved scope edit');
  assert.equal(form.dataset.version, '7', 'Recovery must keep the freshly loaded concurrency version');
  assert.deepEqual(saved, original, 'The captured draft itself remains available without mutation');
});

function renderedRecheckCount(situations) {
  const now = Date.parse('2026-09-26T10:00:00.000Z');
  const question = {
    id: 'question', status: 'live', text: 'Can we deliver this week?',
    authorName: 'Synthetic owner', createdAt: new Date(now).toISOString(),
    freshnessDays: 7, round: 1,
  };
  const requests = situations.map((_, index) => ({
    id: `request-${index}`, questionId: question.id, version: 1,
    title: `Area ${index + 1}`, prompt: 'Describe this area.', assigneeId: 'member',
  }));
  const responses = situations.flatMap((situation, index) => situation ? [{
    id: `response-${index}`, requestId: requests[index].id, questionId: question.id,
    requestVersion: 1, authorName: 'Synthetic member', text: 'Reported situation.',
    source: 'Synthetic evidence', createdAt: new Date(now).toISOString(), ...situation,
  }] : []);
  const briefing = buildBriefing(question, requests, responses, [], { now });
  const app = frontend();
  app.load({
    user: { id: 'member', role: 'member' }, members: [{ id: 'member', name: 'Synthetic member' }],
    questions: [question], requests, responses, briefings: [briefing], actions: [], decisions: [],
  }, question.id);
  const rendered = app.questionPage();
  const match = rendered.match(/<b>(\d+)<\/b><span>Recheck or missing<\/span>/);
  assert.ok(match, 'The actual question page renders its review-needed counter');
  return { count: Number(match[1]), briefing };
}

test('a single unknown and undated response contributes one review-needed request', () => {
  const { count, briefing } = renderedRecheckCount([{ status: 'unknown', observedAt: null }]);
  assert.equal(briefing.answered, 1);
  assert.equal(briefing.needsRecheck.length, 1);
  assert.equal(briefing.unknown.length, 1);
  assert.equal(count, 1, 'The same response appears in both categories but is one request');
});

test('review-needed counter includes distinct aging and unanswered requests without counting overlap twice', () => {
  const { count, briefing } = renderedRecheckCount([
    { status: 'unknown', observedAt: null },
    { status: 'on_track', observedAt: '2026-08-01T10:00:00.000Z' },
    null,
    { status: 'on_track', observedAt: '2026-09-25T10:00:00.000Z' },
  ]);
  assert.equal(briefing.total, 4);
  assert.equal(briefing.answered, 3);
  assert.equal(count, 3, 'Unknown/undated, aging, and unanswered each contribute once; recent evidence does not');
});


test('conversation drafts stay tied to the exact parent, contribution kind and workspace', () => {
  const app = frontend();
  const user = { id: 'member', role: 'member' };
  app.load({ company: { id: 'company-a' }, user }, null);
  const form = (target, kind, value) => ({
    dataset: { form: 'conversation', target, entryKind: kind },
    elements: { text: { value }, source: { value: 'Synthetic source reference' } },
  });
  app.retainConversationDraft(form('old-response', 'concern', 'Concern on the exact old answer'));
  app.retainConversationDraft(form('new-response', 'context', 'Detail on the new answer'));
  app.retainConversationDraft(form('old-response', 'question', 'A separate assigned follow-up'));
  assert.equal(app.draft('old-response', 'concern').text, 'Concern on the exact old answer');
  assert.equal(app.draft('old-response', 'question').text, 'A separate assigned follow-up');
  assert.equal(app.draft('new-response', 'context').text, 'Detail on the new answer');
  app.load({ company: { id: 'company-b' }, user }, null);
  assert.equal(app.draft('old-response', 'concern'), undefined, 'Another company cannot reopen these drafts');
  app.load({ company: { id: 'company-a' }, user }, null);
  app.resetConversationUI();
  assert.equal(app.draft('old-response', 'concern'), undefined, 'Session/workspace reset discards the prior draft cache');
});

test('form recovery retains conversation text but refuses another company or account', () => {
  const form = {
    dataset: { form: 'conversation', id: 'question', target: 'source-answer', entryKind: 'concern' },
    elements: { text: { tagName: 'TEXTAREA', value: 'My unsaved concern <not markup>' }, source: { tagName: 'INPUT', value: 'Source A' } },
    querySelectorAll() { return []; },
  };
  const app = frontend({ forms: [form] });
  app.load({ company: { id: 'company-a' }, user: { id: 'member-a' } }, null);
  const saved = app.snapshotForm(form);
  form.elements.text.value = '';
  assert.equal(app.restoreForm(saved), true);
  assert.equal(form.elements.text.value, 'My unsaved concern <not markup>');
  form.elements.text.value = 'Other workspace draft';
  app.load({ company: { id: 'company-b' }, user: { id: 'member-a' } }, null);
  assert.equal(app.restoreForm(saved), false);
  assert.equal(form.elements.text.value, 'Other workspace draft');
  app.load({ company: { id: 'company-a' }, user: { id: 'member-b' } }, null);
  assert.equal(app.restoreForm(saved), false, 'A different account in the same company cannot inherit the draft');
});

function conversationFixture() {
  const response = { id: 'original-answer', questionId: 'closed-question', requestId: 'original-request', text: 'Original evidence', authorId: 'member', authorName: 'Synthetic member', createdAt: '2026-09-27T08:00:00Z' };
  const followup = { id: 'followup', parentId: response.id, questionId: response.questionId, requestId: response.requestId, kind: 'question', text: 'Confirm the remaining approval', assigneeId: 'member', authorId: 'manager', authorName: 'Synthetic manager', createdAt: '2026-09-27T09:00:00Z' };
  return {
    company: { id: 'company-a' }, user: { id: 'member', role: 'member' },
    members: [{ id: 'member', name: 'Synthetic member', active: true }, { id: 'manager', name: 'Synthetic manager', active: true }],
    questions: [{ id: 'closed-question', text: 'Closed owner question', status: 'closed' }],
    requests: [{ id: 'original-request', questionId: response.questionId, assigneeId: 'member' }],
    responses: [response, { ...response, id: 'later-answer', text: 'Updated evidence' }],
    conversationEntries: [followup],
    conversations: { 'closed-question': { nodes: [], links: [], openQuestions: [followup], concerns: [], helpfulByTarget: { 'original-answer': { count: 1, userIds: ['member'] } } } },
    actions: [], briefings: [],
  };
}

test('historical response keeps its exact conversation and Helpful state after a newer answer', () => {
  const app = frontend(), fixture = conversationFixture();
  app.load(fixture, null);
  const oldThread = app.responseConversation(fixture.responses[0]);
  const newThread = app.responseConversation(fixture.responses[1]);
  assert.match(oldThread, /Conversation · 1 contribution/);
  assert.match(oldThread, /Confirm the remaining approval/);
  assert.match(oldThread, /aria-pressed="true"/);
  assert.doesNotMatch(newThread, /Confirm the remaining approval/);
  assert.doesNotMatch(newThread, /Conversation · 1 contribution/);
  assert.match(newThread, /aria-pressed="false"/);
  assert.doesNotMatch(oldThread, />Ask a follow-up<\/button>/, 'Closed owner question cannot receive a new assigned follow-up');
});

test('closed-root follow-up remains replyable in My requests and inactive assignment is visible', () => {
  const app = frontend(), fixture = conversationFixture();
  app.load(fixture, null);
  let page = app.requestsPage();
  assert.match(page, /Confirm the remaining approval/);
  assert.match(page, /Parent question closed/);
  assert.match(page, /data-target="followup" data-kind="answer">Reply/);
  fixture.members[0].active = false;
  fixture.user = { id: 'manager', role: 'manager' };
  app.load(fixture, null);
  page = app.requestsPage();
  assert.match(page, /Inactive assignee/);
  assert.match(page, /data-target="followup" data-kind="answer">Reply/);
  fixture.user = { id: 'different-member', role: 'member' };
  app.load(fixture, null);
  assert.doesNotMatch(app.requestsPage(), /Confirm the remaining approval/);
});
