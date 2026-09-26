# Quick View product contract · v0.2

The buyer is the SME owner. The entry point is a specific management question or direction. The service helps the organization answer with named, dated evidence and helps the owner keep a decision connected to its subsequent action and reported result.

The initial manufacturing workflow is delivery coordination: **which deliveries need the owner's intervention, and what happened to prior decisions?** This is the focus for validation, not proof of customer demand. Quick View remains independent of the original Workwork Cloud service, repository, accounts and data.

## Operating loop

Owner question → reviewed response plan → authorized requests → team evidence → source-linked decision → optional assigned action → reported result → manager assessment → next check-in draft.

A scoped question creates a reason to supply relevant facts immediately. The service does not require months of daily work logs to produce its first briefing. The complete answer may still require people to respond. Repeated use is intended to reduce repeated setup and reporting; actual savings must be measured during a pilot.

## Roles, access and authority

Signup creates a company manager. Managers ask questions, edit drafts, assign and launch requests, ask for clarification, record decisions, authorize actions, accept reported results, and close/reopen questions. Members see shared live/closed questions and can answer their assigned live requests and update their assigned actions. Managers may supply responses or action updates under their own recorded identity. Drafts are manager-only. Guidance or model output does not authorize assignments by itself.

A manager can deactivate/reactivate another member but cannot deactivate their own account. Deactivation revokes sessions and blocks sign-in while preserving names, evidence, decisions and history. Outstanding requests/actions assigned to inactive people appear as assignment gaps. New assignments require an active member. A copied check-in leaves an inactive assignee unassigned for manager review. Managers can reassign an action through a versioned update with a note; action history retains the prior and new assignment.

Live/closed operations questions and their evidence are shared across the company. Restricted personnel, financial or other confidential executive questions require a more selective permission model that is not implemented. One company membership per email is supported.

## Records

| Record | Meaning and important fields |
|---|---|
| Question | Owner's text and context, response deadline, evidence review window, author, draft/live/closed state, version and planner provenance. Later rounds identify the preceding question and round number. |
| Request | Question area, prompt, suggested function, authorized assignee, version and timestamped follow-ups. Copied requests retain preceding-request/response references as context. |
| Response | Named author, submission time, optional observation time, reported status, narrative, source reference, next step, requested decision, request version and previous-response/provenance links. Explicit rechecks also retain reconfirmation time and source identity. |
| Decision | Manager's text, author/time and optional exact supporting response IDs from the same question. An optional action is saved atomically with the decision. |
| Action | Decision/question link, title, expected result, responsible person, optional deadline, current reported/accepted state, version and immutable updates with author/time/note/source and reassignment context. |
| Membership event | Manager actor/time and prior/current active state for access changes. Historical authors remain identifiable. |

Responses are append-only. Follow-ups increment the request version, so the previous response stops counting as current. It stays visible as earlier context. An earlier blocked/at-risk statement remains surfaced as an earlier concern while the new answer is pending; the service does not quietly turn it into a positive assessment.

Stale draft, response, action and applicable membership writes return a conflict. The interface offers current-record recovery while retaining the user's draft. It does not silently overwrite concurrent work.

## Evidence age and explicit rechecking

Each question has a 1–90 day review window, defaulting to seven days. Evidence age uses the explicit reconfirmation time, if present, otherwise the observation time. Submission time alone is not an observation date. The briefing distinguishes recent, aging, undated, future-dated and missing evidence. These labels apply a review policy, not a truth score.

**Observed now** explicitly sets the observation input at the user's request. Normal submissions reject observation times more than five minutes in the future; older stored records with future dates are labeled for review.

**I rechecked: no change** is available to the assigned person or manager for the latest response to the same current request. It appends a reconfirmation under the acting person's identity/time while preserving the original observation date, text, status and source. A pending clarification requires a full updated response first. A reconfirmed unknown still means unknown.

A new check-in is a different scope/period. Previous answers are shown only as dated context; the service does not copy them as new responses or automatically reconfirm them. Suggested earlier evidence is a lexical candidate requiring human scope/time review, not a verified match.

## Decisions and follow-through

**Decide & assign** links a manager's decision to an exact response. Only that exact reference addresses the response's recorded decision request; a generic decision note does not clear unrelated requests. The underlying reported risk remains a separate fact. A later response can raise a new decision request.

An optional authorized action needs a title, expected result and active assignee, with an optional due date. Assignees or managers can report assigned/open, in progress, blocked or done states with a required update note and optional source. **Reported done** is distinct from **accepted by manager**. Acceptance is allowed only after a result is reported; an accepted action must be reopened by a manager before further work. Neither state verifies business KPI achievement.

Closing a question does not remove its outstanding actions. Updates and manager assessment remain available. A passed due date is a scheduling flag, not proof of employee nonperformance.

## Repeated check-ins

From a live or closed question, a manager can create the next draft by supplying the question, a nonempty new scope/period and an optional deadline. The service copies the response plan and eligible assignees, preserves the previous-question/request links, and leaves responses in the earlier round. Nothing is launched automatically. The owner reviews dates, scope, prompts and assignments before authorizing requests.

This provides reusable setup. It does not schedule future rounds or reminders, automatically compare different periods as equivalent, or infer process patterns from the sequence of reporting.

## Views and sharing

- **Owner desk:** unanswered decision requests, evidence needing a recheck, unresolved/overdue actions, inactive-assignment gaps and the question list. Response counts remain secondary.
- **Response plan:** editable breakdown, active assignees, response deadline and evidence review window before explicit launch.
- **My requests:** unanswered assigned requests, follow-through actions and already provided responses. A saved response clears its pending-response requirement unless a later clarification reopens it.
- **Briefing:** current statements, missing/unknown facts, evidence age, response-change labels, earlier concerns, exact-source decisions and action history. Change labels compare stored source fields; they do not establish an operational or causal change.
- **Source views:** exact recorded responses with authorship, original dates, recheck time, references and full history. Decision links retain their exact historical sources when later responses arrive.
- **Share/copy controls:** authenticated question/request links and local clipboard briefing text. Copying does not send messages, grant access or make evidence public.
- **Team:** private one-use invitation links and manager access controls. No invitation email is sent.

The account-free sample is explicitly illustrative. Companies start empty. Briefings update after saves, navigation, manual refresh and periodic refresh of an idle read-only view. Open dialogs and form drafts are protected from automatic refresh.

## Guided mode, operations and limits

The public pilot uses guided planning templates and deterministic briefing assembly. An optional structured-output model adapter can draft the owner's question breakdown with validation and a labeled fallback; no live model is configured or verified in the public pilot. Employee statements are not generated as company facts.

The service does not claim goal achievement from reporting completion, independently verify source references, calculate KPI rollups, infer causation, reconstruct a verified operating process, rank employees or measure labor savings from clicks.

Consistent SQLite snapshot support uses integrity checks and a new destination file without overwriting existing backups. Synthetic reopening checks are separate from an operational disaster-recovery plan. Offsite destinations, automatic backup schedules and production recovery are not configured. Follow the [deployment instructions](DEPLOYMENT.md); snapshots contain confidential tenant and account data.

Remaining gates include password recovery, email verification, restricted-question permissions, full Korean UI, verified pilot-device usability, appropriate offsite backups/restoration and support ownership. Billing, integrations, background notifications, attachment ingestion, original Workwork synchronization and automatic process discovery remain outside this release.

See the [v0.2 API/data contract](V02-CONTRACT.md), [completed verification](VERIFICATION.md), [concept review](CONCEPT-AND-VIABILITY-REVIEW.md) and [pilot/commercial plan](PILOT-AND-COMMERCIAL-PLAN.md). Commercial hypotheses and proposed pilot thresholds are not product capability or success claims.
