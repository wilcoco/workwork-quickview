export function buildBriefing(question, requests, responses, decisions = []) {
  const rows = requests.filter(r => r.questionId === question.id).map(r => {
    const history = responses.filter(a => a.requestId === r.id);
    const response = history.at(-1) || null;
    const current = Boolean(response && response.requestVersion === r.version);
    return { requestId: r.id, title: r.title, assigneeId: r.assigneeId, current, response, historyCount: history.length,
      state: !current ? (response ? 'update_requested' : 'awaiting') : response.status };
  });
  const answered = rows.filter(r => r.current).length;
  const attention = rows.filter(r => r.current && (['blocked', 'at_risk'].includes(r.state) || r.response.decisionNeeded));
  const unknown = rows.filter(r => !r.current || r.state === 'unknown');
  return { questionId: question.id, total: rows.length, answered, rows, attention, unknown,
    headline: question.status === 'draft' ? 'Review the plan before asking your team.' : answered === 0 ? 'Waiting for the first team response.' : answered < rows.length ? 'A partial answer is available. Information is still missing.' : unknown.length ? 'All requested updates received. Some facts are still unknown.' : 'All requested updates received. Review the evidence and decisions.',
    decisions: decisions.filter(d => d.questionId === question.id),
    note: 'Response coverage measures answers received, not objective achievement. Statements are reported by team members; source references are not independently verified.' };
}
const terms = s => new Set((s.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t => !['the','and','what','with','this','that','your','have','from','which','need','current','status','please','provide','report'].includes(t)));
export function evidenceSuggestions(request, responses, requests) {
  const wanted = terms(`${request.title} ${request.prompt}`);
  const latest = new Map();
  for (const response of responses) latest.set(response.requestId, response);
  return [...latest.values()].filter(r => r.requestId !== request.id && requests.some(q => q.id === r.requestId))
    .map(r => ({ responseId: r.id, score: [...terms(r.text)].filter(t => wanted.has(t)).length }))
    .filter(r => r.score >= 2).sort((a,b) => b.score-a.score).slice(0,3);
}
