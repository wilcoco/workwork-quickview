# Verification · 2026-09-26

Local checks:

- JavaScript syntax check across all server modules and browser code.
- Seventeen isolated tests covering signup/session lifecycle, invitation replacement and one-use acceptance, draft visibility, manager-authorized launch, assignee enforcement, tenant boundaries, answer/follow-up history, unknown states, decisions, close/reopen, stale write conflicts, reusable provenance, CSRF/origin validation, bounded drafting, persistence after reopening SQLite, English/Korean templates, provider fallback and structured-output validation, HTTPS-origin requirement and secure cookies.
- Browser acceptance at the actual 1280px viewport: sample briefing, synthetic owner sign-in, Korean question draft, assignee selection, launch, response submission, briefing update and evidence/decision display.
- Responsive CSS is included. The browser's requested mobile override did not change its actual 1280px viewport, so mobile rendering is not claimed as verified.

All test data is synthetic. No existing Workwork database or account was used. Provider calls are mocked; no live model key is configured.

Public smoke and restart checks are recorded after deployment below.
