# Workwork Quick View

An independent management-question MVP for manufacturing SMEs: ask your company, collect dated team evidence, record a decision, and follow its assigned next step through a reported result.

The first workflow to validate is **“Which deliveries need my intervention this week, and what happened to my previous decisions?”** This is a focused pilot hypothesis. Customer demand, time savings, willingness to pay, and repeatable commercial success have not been established.

**Public pilot:** https://workwork-quickview-production.up.railway.app/

**Private source repository:** https://github.com/wilcoco/workwork-quickview

The original Workwork Cloud remains a separate service and the longer-term work-evidence foundation. Quick View adapts its authentication, tenant-scoped storage and HTTP foundation from `wilcoco/workwork-cloud` commit `ac19178`. No original repository, database, account or Railway deployment is modified or shared.

## Try the management loop

1. Choose **Explore a sample briefing** for a clearly labeled, account-free illustration, or create a company for an empty workspace.
2. Ask a scoped delivery, quality or readiness question in English or Korean. Manufacturing starters help specify the first question.
3. Review the guided response plan, edit its prompts, choose a deadline and evidence review window, and assign responsible people. You can assign yourself to try the workflow.
4. Launch the requests. Share authenticated question/request links through your existing communication channel. Quick View does not send messages or email.
5. Staff respond in **My requests**, providing the situation, uncertainty, source references, observation time and any requested decision. **Observed now** is an explicit user action. **I rechecked: no change** records an explicit recheck without rewriting the earlier answer or changing its original observation date.
6. Review decisions needed, missing or aging evidence, reported risks and outstanding follow-through. **Decide & assign** links the decision to the exact supporting response and optionally assigns a next step with an expected result and deadline.
7. The assignee records progress or a reported result. A manager may accept a reported result or request further work. Closing the question leaves existing actions tracked.
8. **Start next check-in** creates a new draft from the previous plan. Specify the new scope or period and review the assignments before launch. Earlier responses stay dated context; they do not automatically answer the new round.

Invite people under **Team** using a private invitation link. A manager can deactivate or reactivate another member; deactivation revokes access and preserves history. Outstanding assignments to inactive members remain visible for reassignment.

Company members share live/closed questions and evidence; draft plans are manager-only. This permission model is intended for shared operations questions, not confidential executive topics. The first signup is the company's manager. One company membership per email is supported; existing Workwork accounts are separate.

## Implemented in v0.2

- Multi-company authentication, scrypt password hashes, persistent sessions, manager/member permissions, invitation links, member deactivation/reactivation and session revocation.
- English/Korean guided drafts for delivery, quality, readiness, cost and general management questions, with owner-reviewed breakdowns and explicit launch.
- Optional model-assisted drafting adapter with structured-output validation, timeouts, usage bounds and a labeled guided fallback. The public pilot remains in guided mode.
- Append-only responses with authorship, recorded/observed time, source references, follow-ups, explicit reconfirmation and optimistic concurrency protection.
- Evidence review policies from 1–90 days; recent, aging, undated and future-dated evidence labels based on observation or explicit recheck time, not submission time alone.
- An exception-focused owner desk and briefing: unanswered decision requests, missing information, evidence to recheck, earlier concerns awaiting updates and unresolved assigned actions.
- Decisions referencing exact response IDs; optional authorized actions with assignee, expected result, deadline, immutable update history, reported completion and separate manager acceptance.
- Manually started linked check-in rounds that reuse the reviewed plan and assignees while keeping prior answers separate.
- Candidate prior evidence from conservative keyword matching; reuse requires a human scope/time assessment and preserves source provenance.
- Authenticated question/request links, a local clipboard briefing export, an illustrative sample and responsive layouts.
- Consistent SQLite snapshot tooling with integrity checks. This does not configure an offsite backup service.

## Interpretation boundaries

Response coverage is not business KPI completion. Reported status, action completion and manager acceptance do not independently verify a business outcome. A decision linked to a response addresses that decision request; it does not automatically resolve the risk. Source references are recorded text and are not fetched or verified.

Missing responses do not establish nonperformance. Passing a deadline is a scheduling flag, not an employee assessment. A recent submission can describe an old observation. Earlier concerns remain visible when clarification is pending, and old answers never silently become current evidence for a new scope.

The displayed relationships describe questions, reported evidence, decisions and authorized actions. Quick View does not infer causation, calculate KPI rollups, automatically assign work, or claim to have mined the company's operating process.

## AI configuration

The public pilot uses **guided mode**, with no live model credentials. Domain-specific templates draft response plans and deterministic code assembles the briefing. These rules are not presented as live model reasoning.

To enable model-assisted question drafting, configure a new server-side `OPENAI_API_KEY`, `OPENAI_MODEL` supporting structured outputs, and `QUICKVIEW_AI_MODE=openai` in this service's Railway Variables. Never commit a key or reuse credentials from legacy projects. Only the owner's question and context are sent for drafting; employee responses are assembled locally. The interface discloses external drafting before submission. Failed or invalid model output returns a labeled guided draft.

The adapter follows the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). Provider behavior is tested with mocks; no live model call has been verified. Evaluate draft quality and editing effort against guided mode before promising an improvement.

## Local development and snapshots

Requires Node 22.14+; there are no runtime dependencies.

```sh
cp .env.example .env
npm start
npm run check
npm test
```

Default URL: http://127.0.0.1:3150/ . Local databases are ignored by git. Tests use synthetic data and isolated databases. See [verification](docs/VERIFICATION.md) for the checks actually completed.

Create a consistent snapshot with a new destination filename:

```sh
npm run backup -- --source /path/to/quickview.sqlite --destination /secure/backup/quickview-UNIQUE-TIMESTAMP.sqlite
```

The tool refuses overwrite, includes committed WAL content and checks integrity. A snapshot on the same volume is not disaster recovery. **Offsite storage, automatic backup scheduling and a production restore procedure are not configured.** Snapshots contain confidential company records, password hashes and sessions; never commit or publish them. See the [deployment and snapshot instructions](docs/DEPLOYMENT.md).

## Remaining pilot limits

No billing or paid subscription entitlements, email/notification delivery, password recovery, email verification, SSO, organization switching, restricted-question access, attachment uploads, original Workwork synchronization, automatic reminder scheduling, verified source ingestion, KPI arithmetic or operating-process mining. The interface is English with Korean question support and starters; full Korean localization remains a pilot gate.

Commercial rollout needs observed repeat use and buyer commitment, plus operational readiness for account recovery, appropriate access boundaries, offsite backups, restoration and support. Extra reporting effort must be measured across employees and managers; app activity alone cannot demonstrate time saved.

## Planning and contracts

- [Concept and viability review](docs/CONCEPT-AND-VIABILITY-REVIEW.md): market overlap, evidence limits and product hypotheses.
- [Pilot and commercial plan](docs/PILOT-AND-COMMERCIAL-PLAN.md): the initial workflow, proposed validation gates and packaging hypotheses.
- [Product contract](docs/PRODUCT.md): implemented behavior and interpretation boundaries.
- [v0.2 implementation contract](docs/V02-CONTRACT.md): API and data agreement.
- [Deployment](docs/DEPLOYMENT.md) and [verification](docs/VERIFICATION.md): environment and completed checks.
