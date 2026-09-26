const DAY = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE = 5 * 60 * 1000;
const SOURCE_FIELDS = ['text', 'status', 'source', 'observedAt', 'nextStep', 'decisionNeeded'];

export function evidenceFreshness(response, freshnessDays = 7, now = Date.now()) {
  if (!response) return { freshness: 'missing', ageDays: null, referenceTime: null };
  // Submission time says when someone typed, not when they checked the facts.
  const referenceTime = response.confirmedAt || response.observedAt || null;
  const timestamp = referenceTime ? Date.parse(referenceTime) : NaN;
  if (!Number.isFinite(timestamp)) return { freshness: 'undated', ageDays: null, referenceTime: null };
  const ageDays = Math.max(0, (now - timestamp) / DAY);
  const freshness = timestamp > now + FUTURE_TOLERANCE ? 'future' : ageDays > freshnessDays ? 'aging' : 'recent';
  return { freshness, ageDays, referenceTime };
}

export function buildBriefing(question, requests, responses, decisions = [], options = {}) {
  const now = options.now ?? Date.now();
  const freshnessDays = Number.isInteger(question.freshnessDays) && question.freshnessDays >= 1 && question.freshnessDays <= 90 ? question.freshnessDays : 7;
  const rows = requests.filter(r => r.questionId === question.id).map(r => {
    const history = responses.filter(a => a.requestId === r.id);
    const response = history.at(-1) || null;
    const previousResponse = history.at(-2) || null;
    const current = Boolean(response && response.requestVersion === r.version);
    const changeKind = !current ? 'awaiting' : response.kind === 'reconfirmation' ? 'reconfirmed' : !previousResponse ? 'first'
      : SOURCE_FIELDS.every(field => (response[field] || '') === (previousResponse[field] || '')) ? 'unchanged' : 'updated';
    return { requestId: r.id, title: r.title, assigneeId: r.assigneeId, current, response, historyCount: history.length,
      previousResponse, changeKind, ...evidenceFreshness(response, freshnessDays, now),
      state: !current ? (response ? 'update_requested' : 'awaiting') : response.status };
  });
  const answered = rows.filter(r => r.current).length;
  const attention = rows.filter(r => r.current && (['blocked', 'at_risk'].includes(r.state) || r.response.decisionNeeded));
  const earlierConcerns = rows.filter(r => !r.current && r.response && ['blocked', 'at_risk'].includes(r.response.status));
  const unknown = rows.filter(r => !r.current || r.state === 'unknown');
  const questionDecisions = decisions.filter(d => d.questionId === question.id);
  const addressedResponseIds = new Set(questionDecisions.flatMap(d => Array.isArray(d.responseIds) ? d.responseIds : []));
  const decisionRequests = rows.filter(r => r.response?.decisionNeeded && !addressedResponseIds.has(r.response.id));
  const needsRecheck = rows.filter(r => r.current && ['aging', 'undated', 'future'].includes(r.freshness));
  const actions = (options.actions || []).filter(a => a.questionId === question.id);
  const openActions = actions.filter(a => a.status !== 'accepted');
  const today = new Date(now).toISOString().slice(0, 10);
  const overdueActions = openActions.filter(a => a.dueDate && a.dueDate < today);
  return { questionId: question.id, freshnessDays, total: rows.length, answered, rows, attention, earlierConcerns, unknown,
    needsRecheck, decisionRequests, actions, openActions, overdueActions,
    headline: question.status === 'draft' ? 'Review the plan before asking your team.' : answered === 0 ? 'Waiting for the first team response.' : answered < rows.length ? 'A partial answer is available. Information is still missing.' : unknown.length ? 'All requested updates received. Some facts are still unknown.' : 'All requested updates received. Review the evidence and decisions.',
    decisions: questionDecisions,
    note: 'Response coverage measures answers received, not objective achievement. Statements are reported by team members; source references are not independently verified.' };
}
const terms = s => new Set((s.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t => !['the','and','what','with','this','that','your','have','from','which','need','current','status','please','provide','report'].includes(t)));
export function evidenceSuggestions(request, responses, requests) {
  const wanted = terms(`${request.title} ${request.prompt}`);
  const latest = new Map();
  for (const response of responses) latest.set(response.requestId, response);
  return [...latest.values()].filter(r => r.requestId !== request.id && requests.some(q => q.id === r.requestId && (r.requestVersion ?? 1) === (q.version ?? 1)))
    .map(r => ({ responseId: r.id, score: [...terms(r.text)].filter(t => wanted.has(t)).length }))
    .filter(r => r.score >= 2).sort((a,b) => b.score-a.score).slice(0,3);
}
