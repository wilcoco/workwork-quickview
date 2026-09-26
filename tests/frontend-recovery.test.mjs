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
    restoreForm, questionPage,
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
    kind: 'plan', id: 'this-question', data: { context: 'My unsaved scope edit' },
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
