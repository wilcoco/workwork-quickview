# Quick View product contract · v0.1

The buyer is the SME owner. The entry point is a real management question or direction. Value starts when the service makes clear what is known, what is missing and who is responsible for an answer.

## Operating loop

Owner question → proposed breakdown → owner reviews and assigns → team supplies facts → briefing updates → owner clarifies or decides.

This active collection loop produces useful evidence before a long history of daily logs exists. It complements the original Workwork concept without changing its product or deployment.

## Roles and authority

The signup creates a company manager. A manager can ask, edit drafts, assign requests, launch them, request clarification, record decisions, close and reopen. Members can see shared live/closed questions and answer requests assigned to them. Managers may answer any live request under their own recorded identity. Drafts are manager-only. No model output creates an assignment until the manager launches it.

## Records

- Question: owner's exact text, context, deadline, author, draft/live/closed state, version, planner provenance.
- Request: question, area, prompt, suggested function, authorized assignee, version, timestamped follow-up history.
- Response: original author, submission time, optional observation time, reported status, narrative, source reference, next step, requested decision, request version, previous-response link, optional reusable source snapshot.
- Decision: manager's text, question, author and timestamp.

Responses are append-only; old evidence is not overwritten. New follow-ups increment the request version; the earlier response stops counting as current. Stale draft versions and stale response submissions fail with a conflict. The browser keeps a conflicted answer draft while loading current evidence for review.

## Generated views

- Owner desk: questions and request coverage.
- Response plan: editable proposed decomposition before launch.
- My requests: focused assigned questions, full owner context and follow-ups.
- Briefing: current reported facts, uncertainty, current reported risks/decision needs, earlier evidence awaiting updates, and owner decisions.
- Flow: parallel response requests feed the owner briefing. No inferred operational process edges.
- Evidence suggestions: optional keyword-matched prior responses; human scope/time check required for reuse, with source provenance preserved.

## What the MVP does not claim

It cannot know unreported company facts. Completed reporting is not goal achievement. Reported green status does not establish a successful business outcome. Evidence references are not verified artifacts. Risks in an earlier answer remain in history when new information is requested, but are not silently treated as a current assessment. Requests are not forced into a numeric KPI hierarchy.

## Temporal behavior

An initial plan is available immediately. Missing facts stay unknown. The briefing updates upon save, on navigation, with Refresh, and periodically in an idle, unedited briefing view. All relevant timestamps are retained. Historic pattern discovery and operational process reconstruction are future work, requiring suitable evidence.
