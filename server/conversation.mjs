// A projection of recorded discourse, not an inferred business workflow.
// The caller supplies a single tenant's records; this module also bounds all
// nodes and links to the selected question and existing parents.
export function buildConversation(question, requests = [], responses = [], entries = [], reactions = [], decisions = [], actions = []) {
  const nodes = [], links = [], byId = new Map(), linkIds = new Set();
  const addNode = node => {
    if (!node?.id || byId.has(node.id)) return;
    byId.set(node.id, node); nodes.push(node);
  };
  const addLink = (sourceId, targetId, type) => {
    if (!byId.has(sourceId) || !byId.has(targetId) || sourceId === targetId) return;
    const id = `${type}:${sourceId}:${targetId}`;
    if (!linkIds.has(id)) { links.push({id, sourceId, targetId, type}); linkIds.add(id); }
  };
  const node = (record, kind, recordType, extra = {}) => ({
    id: record.id, kind, text: record.text || '', recordType,
    authorId: record.authorId || null, authorName: record.authorName || '',
    createdAt: record.createdAt || null, source: record.source || '',
    requestId: record.requestId || null, parentId: record.parentId || null,
    assigneeId: record.assigneeId || null, ...extra,
  });
  addNode(node(question, 'question', 'questions'));
  const scopedRequests = requests.filter(r => r.questionId === question.id);
  const requestIds = new Set(scopedRequests.map(r => r.id));
  const scopedResponses = responses.filter(a => a.questionId === question.id && requestIds.has(a.requestId));
  const responseIds = new Set(scopedResponses.map(a => a.id));

  for (const request of scopedRequests) {
    addNode(node(request, 'question', 'requests', {text: request.prompt || request.title || '', requestId: request.id}));
    addLink(request.id, question.id, 'part_of');
    for (const clarification of request.followups || []) {
      addNode(node(clarification, 'question', 'clarifications', {requestId: request.id}));
    }
  }
  for (const answer of scopedResponses) {
    addNode(node(answer, 'answer', 'responses', {observedAt: answer.observedAt || null, confirmedAt: answer.confirmedAt || null}));
  }
  for (const request of scopedRequests) {
    const history = scopedResponses.filter(a => a.requestId === request.id);
    const followups = request.followups || [];
    followups.forEach((followup, i) => {
      const earlierAnswer = history.filter(a => a.requestVersion === i + 1).at(-1);
      addLink(followup.id, earlierAnswer?.id || request.id, 'follows_up');
    });
    for (const answer of history) {
      const exactPrompt = answer.requestVersion > 1 ? followups[answer.requestVersion - 2]?.id : null;
      addLink(answer.id, exactPrompt || request.id, 'answers');
      if (responseIds.has(answer.previousResponseId)) addLink(answer.id, answer.previousResponseId, 'updates');
    }
  }

  // Accept only parent chains rooted in an actual response. This also excludes
  // corrupt cycles, orphan entries and forged cross-question references.
  const pending = entries.filter(e => e.questionId === question.id && requestIds.has(e.requestId));
  const validEntries = [], entryIds = new Set();
  let remaining = pending;
  while (remaining.length) {
    const next = [];
    for (const entry of remaining) {
      const parent = byId.get(entry.parentId);
      if (!parent || !['responses', 'conversationEntries'].includes(parent.recordType)) { next.push(entry); continue; }
      if (parent.requestId !== entry.requestId || !['question','answer','context','concern'].includes(entry.kind)) continue;
      if (entry.kind === 'answer' && (parent.recordType !== 'conversationEntries' || parent.kind !== 'question')) continue;
      if (entryIds.has(entry.id) || byId.has(entry.id)) continue;
      addNode(node(entry, entry.kind, 'conversationEntries'));
      validEntries.push(entry); entryIds.add(entry.id);
      addLink(entry.id, entry.parentId, {question:'follows_up', answer:'answers', context:'adds_context', concern:'raises_concern'}[entry.kind]);
    }
    if (next.length === remaining.length) break;
    remaining = next;
  }
  const answered = new Set(validEntries.filter(e => e.kind === 'answer').map(e => e.parentId));
  const openQuestions = validEntries.filter(e => e.kind === 'question' && !answered.has(e.id));
  const concerns = validEntries.filter(e => e.kind === 'concern');

  const latestReactions = new Map();
  for (const reaction of reactions) {
    if (reaction.questionId !== question.id || reaction.kind !== 'helpful' || !reaction.authorId
      || !(responseIds.has(reaction.targetId) || entryIds.has(reaction.targetId))) continue;
    latestReactions.set(`${reaction.targetId}:${reaction.authorId}`, reaction);
    addNode(node(reaction, 'feedback', 'reactionEvents', {text: reaction.active ? 'Marked helpful' : 'Removed helpful feedback', active: reaction.active, parentId: reaction.targetId}));
    addLink(reaction.id, reaction.targetId, 'feedback_on');
  }
  const helpfulByTarget = {};
  for (const reaction of latestReactions.values()) {
    if (!reaction.active) continue;
    // IDs are server-generated UUIDs; a null-prototype bucket also makes this
    // projection safe for synthetic or imported identifiers.
    if (!Object.hasOwn(helpfulByTarget, reaction.targetId)) Object.defineProperty(helpfulByTarget, reaction.targetId, {value:{count:0,userIds:[]}, enumerable:true});
    const tally = helpfulByTarget[reaction.targetId];
    tally.count++; tally.userIds.push(reaction.authorId);
  }
  const scopedDecisions = decisions.filter(d => d.questionId === question.id);
  for (const decision of scopedDecisions) {
    addNode(node(decision, 'decision', 'decisions'));
    addLink(decision.id, question.id, 'part_of');
    for (const sourceId of decision.responseIds || []) if (responseIds.has(sourceId)) addLink(decision.id, sourceId, 'based_on');
  }
  const decisionIds = new Set(scopedDecisions.map(d => d.id));
  for (const action of actions.filter(a => a.questionId === question.id && decisionIds.has(a.decisionId))) {
    addNode(node(action, 'action', 'actions', {text: action.title || '', expectedResult: action.expectedResult || ''}));
    addLink(action.decisionId, action.id, 'assigns');
  }
  return {questionId:question.id, nodes, links, openQuestions, concerns, helpfulByTarget};
}
