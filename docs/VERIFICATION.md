# Verification · 2026-09-27

## v0.3 local acceptance

- All 73 tests pass: retained v0.2 behavior plus exact-parent conversations, source-bounded graph projection, manager-assigned follow-ups, authorized replies after question closure, company/draft boundaries, actor-specific Helpful idempotence, persistent concerns, inactive assignees, unchanged original response status/coverage, and conversation context in copied briefings.
- Syntax and whitespace checks pass. No destructive database migration is introduced; v0.3 adds two record types to the existing tenant-scoped record store.
- Eight tests execute the actual browser script and cover draft recovery, company/account-bound conversation drafts, historical response identity, closed-question follow-ups, and copied briefing context. Independent review reproduced and then verified the fix for a decision draft lost while navigating into a conversation: the original source-linked draft is now suspended and can be restored explicitly.
- A synthetic local company exercised the live HTTP sequence: owner question, assigned response, written concern, assigned follow-up, member reply, another pending follow-up and idempotent Helpful feedback from two people. The original blocked business status and response coverage stayed unchanged.
- Actual browser checks: synthetic owner sign-in, briefing conversation counters, original-source conversation, named concern/question/reply cards, source references, optional relationship trail, Add detail submission, manager follow-up assignment and a reply submitted through its exact question. A partially written detail survived returning to the conversation and reopening its form before submission.
- Desktop layout visually checked. At a verified 390 × 844 browser viewport, mobile contribution text and controls were inspected and enlarged; the document width was 390px and the dialog width/scroll width both 350px, with no horizontal overflow. This is a browser viewport test, not testing on physical pilot devices. The temporary viewport was reset.
- Tests and demonstration data are synthetic. No live model inference is added; explicit user actions determine the relationship types. No original Workwork service or database is changed.

## v0.3 public release

Final application commit `2af02cc` deployed successfully as `f11c2a7c-e0e4-4f67-b549-1bbfbb26cd17`. HTTPS health reports `0.3.0`; public JavaScript was compared byte-for-byte with the tested clean release export (SHA-256 `7e2e45209c7b7080a3de8783547979f23e072cc2621b56cabb535d8c30f23ba0`).

One clearly named synthetic acceptance company and member exercised public signup/invitation, assigned response, concern, follow-up, member reply, another unanswered follow-up, and Helpful feedback from two people. Duplicate Helpful submission did not double count. The original blocked status and one-of-one response coverage stayed unchanged. A fresh sign-in after the final redeployment recovered the exact response, all four conversation entries, one open follow-up, one concern and two Helpful reactions.

The final public landing page and account-free sample conversation were checked in the browser. The sample shows the original production statement, quality concern, owner follow-up, quality reply and further unanswered question. The Copy briefing button reported successful local copying; copied content is covered by the frontend test and the exact public artifact check. No messages were sent externally.

The predeployment snapshot is retained on the same private Railway volume. This release does not change the previously documented offsite recovery limits.

## v0.2 local acceptance

- 54 isolated tests pass, including prior behavior, freshness, exact-source decisions, action result/acceptance, tenant boundaries, repeated check-ins, lineage preservation, optimistic conflicts, offboarding, session revocation, additive legacy schema migration and snapshot recovery.
- JavaScript syntax and whitespace checks pass.
- Independent final review found and fixed two issues: overlapping recheck/missing counters and a recovered draft retaining request IDs deleted by another tab. Three regression tests execute the actual browser script for these cases.
- Actual desktop browser: owner records a source-linked decision and action; member reports a result; owner accepts it; the original blocked response remains unchanged until explicitly rechecked; original observation date survives reconfirmation; request deep link survives reload; next check-in is a draft and launches with zero fresh answers.
- Browser member-deactivation submission was not executed: automatic approval review blocked the access-changing test even for a synthetic local account. Nine automated membership tests cover deactivation, reactivation, revoked sessions, assignment continuity and races. No claim of browser verification for that mutation.
- Desktop layout visually checked at 1280px. Actual mobile rendering remains unverified.
- Backup tests verify independent SQLite snapshots including committed WAL data. No offsite schedule or production disaster-recovery restore has been configured or verified.
- Public v0.2 deployment and persistence checks passed; details below.

## v0.1 baseline

Local checks:

- JavaScript syntax check across all server modules and browser code.
- Seventeen isolated tests covering signup/session lifecycle, invitation replacement and one-use acceptance, draft visibility, manager-authorized launch, assignee enforcement, tenant boundaries, answer/follow-up history, unknown states, decisions, close/reopen, stale write conflicts, reusable provenance, CSRF/origin validation, bounded drafting, persistence after reopening SQLite, English/Korean templates, provider fallback and structured-output validation, HTTPS-origin requirement and secure cookies.
- Browser acceptance at the actual 1280px viewport: sample briefing, synthetic owner sign-in, Korean question draft, assignee selection, launch, response submission, briefing update and evidence/decision display.
- Responsive CSS is included. The browser's requested mobile override did not change its actual 1280px viewport, so mobile rendering is not claimed as verified.

All test data is synthetic. No existing Workwork database or account was used. Provider calls are mocked; no live model key is configured.

Public smoke and restart checks are recorded after deployment below.

## Public Railway checks

Deployment `7cafb8a8-911c-4882-b679-1fbae60bbf1f` succeeded. Public smoke tests passed for HTTPS health, empty-company signup, Secure/HttpOnly/SameSite cookies, tenant isolation, member invitation/join, draft privacy, authorized launch, member response, manager follow-up, updated unknown status, duplicate response rejection, response history and owner decision.

Redeployment `0efc295f-f52e-48a1-a8c7-c3d626396060` succeeded. A second check confirmed the same companies, member account, sessions, question plan, two answer revisions and decision survived. Login after restart also succeeded. Two clearly named synthetic verification companies remain in the new database; their randomized test credentials are not committed or shared.

The public landing page and account-free sample were checked in the browser. The original Workwork Cloud checkout remained clean at `ac19178f55351d720585a9f9f61c67b616ed849a`. No original service deployment was changed.

## v0.2 public release and restart

Application commit `9d333ff` was deployed successfully as Railway deployment `4e761851-5d28-4f3c-80ab-8ac9e451d5b1`. HTTPS health returns version `0.2.0`. Before deployment, an integrity-checked SQLite snapshot was created on the private service volume at `/data/backups/pre-v02-1790406295844.sqlite`. This remains on the same volume and is not an offsite backup.

Fresh public smoke checks created only two clearly named synthetic verification companies and a synthetic member. They passed empty-company signup, secure cookie flags, invitation/join, draft privacy, authorized launch, old-evidence warnings, explicit reconfirmation preserving the original observation and author provenance, duplicate rejection, exact-source decision/action creation, member reported result, manager-only acceptance, persistent business-risk visibility, and a reviewed next-round draft with preserved lineage but zero fresh answers. Cross-company response/action writes returned 404.

The same deployment was restarted through Railway. A separate persistence pass confirmed the synthetic accounts, existing sessions, two response revisions, exact decision source, accepted action with employee/owner history, draft lineage and company boundaries survived. Fresh sign-in also passed after restart. Public member deactivation was not performed.

The updated landing page, illustrative briefing and owner exception desk were visually checked in the public browser. A further 390×844 viewport request still rendered at 1280×720, including a newly opened test tab; the override was reset. Phone rendering is not claimed as verified.

No original Workwork repository, deployment or database was changed. Public mode remains guided, and live model calls were not made. The private test credential file is not part of the source or deployment.
