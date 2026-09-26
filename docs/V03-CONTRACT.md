# v0.3 — Simple conversations, explicit relationships

Implement only in workwork-quickview. Preserve v0.2 records and behavior. Public vocabulary: Helpful, Add detail, Flag a concern, Ask a follow-up, Reply, Conversation. No ontology controls, graph editor, point economy, or mandatory tags.

## Records and writes

Two additive record types: `conversationEntries`, `reactionEvents`. No existing records are rewritten to migrate.

`POST /api/questions/:id/conversation` takes `{parentId,kind,text,source?,assigneeId?}`. Parent must be an existing response or conversation entry in this exact company and question; no client-owned edges, authors, timestamps or relation labels. Kind is `question`, `answer`, `context`, or `concern`. Text required <=3000; source optional <=1000. Save immutable entry `{id,questionId,requestId,parentId,kind,text,source,assigneeId,createdAt,authorId,authorName}`. requestId is inherited from parent. Parent must exist before child, preventing cycles. Return 201 `{entry}`.

- Question: manager only, live root question, active assigned company member required. Can follow any response or entry. Does not replace or invalidate the original response. Outstanding follow-ups stay visible separately from original response coverage.
- Answer: parent must be a conversation question; only assigned person or manager can answer. Allow answers while root is live or closed so existing obligations remain actionable. Multiple answers append history.
- Context / concern: any active company member, parent response or entry, root live or closed. These never count as answering an assigned question or as business status changes.
- Draft roots deny conversation/reaction writes. Foreign or mismatched parents 404. Invalid kind/fields 400. Session/CSRF/rate-limit rules continue.

`POST /api/questions/:id/reactions` takes `{targetId,active}` (boolean). Target is response or conversation entry in same company/question; no drafts. Append `{id,questionId,targetId,kind:'helpful',active,authorId,authorName,createdAt}` only when state changes, return 200 `{reaction}`. Duplicate same-state request is idempotent. Users cannot change others' reactions. No downvote economy: disagreement uses a written concern. Useful ≠ true, approved, or complete.

## Read contract

`GET /api/state` includes `conversationEntries` and `reactionEvents`, filtered to the same visible questions as existing responses. Also `conversations`, an object keyed by question ID, each produced by root-owned `buildConversation(question, requests, responses, entries, reactions, decisions = [], actions = [])` from server/conversation.mjs:

```
{questionId, nodes:[{id,kind,text,authorId?,authorName?,createdAt?,requestId?,parentId?,source?,assigneeId?,recordType}],
 links:[{id,sourceId,targetId,type}],
 openQuestions:[entry], concerns:[entry],
 helpfulByTarget:{[id]:{count,userIds:[id]}}}
```

Nodes include original owner question, request prompts, immutable responses, old clarification prompts, new entries, feedback events, decisions and actions. Most links point from dependent contribution toward its referent: `answers`, `follows_up`, `adds_context`, `raises_concern`, `part_of`, `based_on`, `updates`, `feedback_on`. The `assigns` link points from the authorizing decision to its action. They describe recorded discourse/provenance; never inferred causation or a required business process. Open questions are conversation kind=question with no direct kind=answer child. Concerns are all recorded concerns (not silently cleared by votes/answers).

Existing decisions may still reference responses only; do not invent thread-decision functionality. Keep response-to-decision linkage visible.

## UX

Show action strip and conversation count on recorded responses, with a compact expandable conversation. Flat accessible threaded cards, explicit “In reply to …”, author/date/source; avoid deep indentation. Default view remains briefing. A small expandable “How this answer developed” trail is optional; no graph canvas dependency. Every conversation entry exposes context/concern and manager follow-up, and assigned question exposes Reply. Feedback toggles Helpful with count.

Managers can choose follow-up recipient, defaulting to the original request assignee. My requests adds unanswered conversation questions assigned to the current user (managers see all); owner/question summaries show unanswered follow-up count and recorded concerns, without converting coverage into success. Closed parent questions retain Reply for existing follow-ups. Inactive assignee must surface as needing reassignment; manager may answer or start new live follow-up, no silent deletion. Sample includes a concern, follow-up and reply, and can be explored without saving. Preserve unsaved form text on errors/refresh; render user text escaped. Mobile layout and keyboard accessibility required.

## Foundations and limits

Adapted from Dapsol's message/discourse/knowledge relationship separation. Explicit questions and positions are compatible with issue-based argumentation; source and authorship reflect provenance principles. These are design influences, not claims of IBIS, PROV-O, SKOS or OWL compliance. MVP stores interaction meaning explicitly and leaves business ontology extraction for a reviewed later layer. No automatic causal claims, no numeric confidence fabrication, and no popularity-based truth.
