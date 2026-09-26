# Verification · 2026-09-26

## v0.2 local acceptance

- 54 isolated tests pass, including prior behavior, freshness, exact-source decisions, action result/acceptance, tenant boundaries, repeated check-ins, lineage preservation, optimistic conflicts, offboarding, session revocation, additive legacy schema migration and snapshot recovery.
- JavaScript syntax and whitespace checks pass.
- Independent final review found and fixed two issues: overlapping recheck/missing counters and a recovered draft retaining request IDs deleted by another tab. Three regression tests execute the actual browser script for these cases.
- Actual desktop browser: owner records a source-linked decision and action; member reports a result; owner accepts it; the original blocked response remains unchanged until explicitly rechecked; original observation date survives reconfirmation; request deep link survives reload; next check-in is a draft and launches with zero fresh answers.
- Browser member-deactivation submission was not executed: automatic approval review blocked the access-changing test even for a synthetic local account. Nine automated membership tests cover deactivation, reactivation, revoked sessions, assignment continuity and races. No claim of browser verification for that mutation.
- Desktop layout visually checked at 1280px. Actual mobile rendering remains unverified.
- Backup tests verify independent SQLite snapshots including committed WAL data. No offsite schedule or production disaster-recovery restore has been configured or verified.
- Public v0.2 deployment and persistence checks will be recorded below after release.

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
