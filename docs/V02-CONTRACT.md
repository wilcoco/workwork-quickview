# v0.2 implementation contract — decision follow-through

Owner desk / My requests / Team remains compact. v0.1 persisted records must keep working with defaults. Changes are isolated to this repo.

## API/data additions

- Questions gain `freshnessDays` integer 1–90, default 7. POST question and PATCH draft accept it. Preserve owner question and context; freshness is a review policy, not proof of factual truth.
- `POST /api/questions/:id/check-ins`: manager; `{expectedVersion,text,context,dueDate}`; non-draft parent only. New text and nonempty context specify this round's scope/period. Creates a DRAFT new question with `previousQuestionId`, `round` (old default 1 + 1), same freshnessDays, copied request prompts/roles/assignees for review; no responses copied as new evidence and no assignments launched. Copied requests have `previousRequestId` and `previousResponseId` (if any, dated context). Increment parent version atomically to reject duplicate concurrent calls. Owner reviews prompts for new period before launch.
- `POST /api/requests/:id/reconfirm`: assignee or manager; live question; `{expectedVersion,expectedResponseId}`. Requires a latest response to this SAME request matching its current version; no pending clarification. Appends a response retaining text/status/source/observedAt/nextStep/decisionNeeded and original-source provenance, with new author/time, `kind:'reconfirmation'`, `confirmedAt:stamp`, `reconfirmedResponseId`. Explicit user action means 'I rechecked; still applies'. No fabricated observation time. Unknown may be reconfirmed as still unknown.
- Normal response observedAt must not be more than 5 minutes in the future. Historical future dates surface as a warning.
- `POST /api/questions/:id/decisions` extends existing `{text}` with optional `responseIds` (up to 32 distinct same-question response UUIDs) and optional `action:{title,expectedResult,assigneeId,dueDate}`. Save exact referenced response IDs; decision references do not resolve business risks. Only an exact response-ID reference addresses that response's decision request. Store decision and action atomically. Legacy text-only decisions remain valid. Action requires title, expectedResult, company assignee; dueDate optional. Manager-authorized assignment only.
- Add top-level `actions` to state. Records: id,questionId,decisionId,title,expectedResult,assigneeId,dueDate,status='open',version=1,authorId/Name,createdAt,updates=[].
- `PATCH /api/actions/:id` accepts `{expectedVersion,status,note,source}`. Assignee or manager can set open/in_progress/blocked/reported_done. note required (max3000), source optional max1000. Only manager can set accepted, only from reported_done. Accepted actions may only be reopened to open by a manager. Action completion is reported, acceptance is the manager's judgment, neither proves business KPI achievement. All transitions append immutable `{id,createdAt,authorId,authorName,status,note,source}` to updates. Under closed questions updates still allowed for existing actions (no unresolved obligation disappears because a question closes). Cross-tenant IDs 404 and unassigned members 403.

## Derived state

`buildBriefing(question,requests,responses,decisions=[],options={now,actions})` is backward compatible. now is epoch ms; actions defaults [].
- Existing rows/current/answered unchanged. Add per-row `freshness` ('recent','aging','undated','future','missing'), `ageDays` number/null and `referenceTime` timestamp/null, based on explicit confirmedAt else observedAt; never recordedAt alone. Add `previousResponse` where history has an earlier entry; `changeKind` ('first','reconfirmed','updated','unchanged','awaiting') comparing source fields, not generated causal claims.
- Add `needsRecheck` array of current rows aging/undated/future.
- Add `decisionRequests`: latest rows with decisionNeeded (including earlier response while follow-up pending), excluding exact response IDs linked by a saved decision. Label earlier/current in UI.
- Add `actions` for question, `openActions` (not accepted), `overdueActions` (nonaccepted due date passed in UTC, no employee performance implication).
- Earlier blocked/at-risk response remains surfaced as earlier concern while follow-up awaits; don't silently make it green or lose traceability.
- `evidenceSuggestions` excludes responses invalidated by request version. Preserve lexical matches as candidates only; never transfer evidence automatically between periods/cases.
- `state.review` optional aggregate owner desk may be derived client side from briefings. Do not add employee rankings or claimed time-saved metrics.

## Frontend scope

- Owner desk leads with unanswered decision requests, evidence needing recheck, and unresolved/overdue assigned actions; manufacture-specific question starter chips.
- Question briefing emphasizes exceptions, response changes and follow-through while keeping original quotes inspectable.
- Visible freshness policy; observation/reconfirmation timestamp and source age labels distinguish responses received vs evidence recent.
- 'Decide & assign' on a specific decision request opens manager form linked to that source. Optional assigned action with expected result and deadline. Plain decision notes still possible.
- 'My requests' includes assigned actions; update/result forms, manager acceptance controls, source history.
- 'Start next check-in' from live/closed questions makes reviewed draft using endpoint above.
- Explicit 'I checked: no change' button where allowed; keep complete history.
- Copy briefing locally as reusable plain text (no external send) useful for current reporting practice.
- Do not build billing/integrations/automatic reminders or claim deployed live LLM. AI mode remains truthful. Korean question starters support initial pilot; full UI localization is a next gate unless safely achievable separately.

## Draft identity preservation

PATCH draft request rows may include an optional existing `id`. It must be unique and belong to that same draft/question/company. Preserve its server-owned previousRequestId/previousResponseId lineage; clients cannot set lineage directly. New rows omit id. Legacy id-less payloads remain valid.

## Member access and assignment continuity

- Schema v3 adds `users.active` with legacy users active by default. Migration is repeatable and never lowers schema versions.
- Manager-only `PATCH /api/members/:id` accepts `{active,expectedActive}`. Foreign IDs return 404; stale active state returns 409. Self-deactivation and removal of the last active manager are denied. Deactivation revokes all sessions; inactive sign-in fails with a generic credential error. Reactivation requires fresh sign-in.
- Immutable tenant-scoped `membershipEvents` retain actor, target and timestamp. Historical responses and names are preserved.
- New assignment and launch require active company members. Next-round drafts clear inactive assignees for review.
- `state.assignmentGaps` contains live unanswered request IDs and nonaccepted action IDs assigned to inactive members. Nothing is reassigned or completed automatically.
- Manager action updates may include `assigneeId`; optimistic version, required update note and append-only history remain enforced. Assignment history preserves prior/new responsible person.
- Revoked sessions are rechecked after asynchronous drafting before any delayed write.
