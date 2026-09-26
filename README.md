# Workwork Quick View

An independent owner-question MVP: ask your company, collect focused team responses, and see the evidence, missing information and decisions in one briefing.

**Public pilot:** https://workwork-quickview-production.up.railway.app/

**Private source repository:** https://github.com/wilcoco/workwork-quickview

The original Workwork Cloud MVP remains a separate service. This project adapts its authentication, tenant-scoped storage and HTTP foundation from `wilcoco/workwork-cloud` commit `ac19178`. No original repository, database or Railway deployment is modified or shared.

## Try it

1. Open the public pilot. Choose **Explore a sample briefing** for an account-free, clearly labeled illustration.
2. Create a company. Ask a question in English or Korean.
3. Review the generated draft, edit its requests and assign responsible people. You can assign yourself to try the flow immediately.
4. Launch the requests. Each assignee can respond in **My requests**.
5. Review reported facts, information gaps, source references and decisions. Request clarification or record a decision as needed.
6. Invite colleagues under **Team** by creating and sharing an invitation link. Invitations are in-app links; the service does not send email.

Each company starts empty. Existing Workwork accounts are not shared. Questions and evidence are shared with members of the same company; draft plans are manager-only. The first signup is that company's manager. One membership per email is supported.

## Implemented

- Multi-company signup and sign-in; scrypt password hashes; persistent sessions; manager/member permissions.
- Owner questions with context and response due date.
- English/Korean guided drafts for delivery, quality, readiness, cost and general management questions.
- Optional OpenAI structured-output drafting with validated output, request timeout, per-company bounds, and an explicit guided fallback.
- Editable draft breakdowns, responsible-person assignments, and explicit manager launch.
- In-app response inbox; reported situation, narrative, source reference, observation time, next step and decision request.
- Automatically assembled source-linked briefing, response workflow and information gaps.
- Follow-up/reassignment reopens the response request; old answers remain visible as earlier evidence.
- Append-only response history and optimistic concurrency protection.
- Candidate earlier evidence, based on conservative keyword matching; optional reuse preserves provenance and asks for a fresh assessment.
- Owner decision log; close and reopen questions without deleting evidence.
- Clearly labeled, account-free sample; responsive layouts; source text is HTML escaped.

## Interpretation boundaries

Answer coverage is not business KPI completion. A person's status is reported, not independently verified. Source references are recorded text and are not fetched or verified. Missing answers do not establish poor performance. The visible flow is the workflow for answering the owner, not a mined or verified production process. Earlier facts may be stale. No causal inference, numeric KPI rollup, automated assignment or fabricated business answer is performed.

## AI configuration

The public pilot starts in **guided mode**, with no live model credentials. It works end to end using domain-specific planning and deterministic briefing assembly. It does not advertise those rules as model-generated reasoning.

To enable model-assisted question drafting, configure a new server-side `OPENAI_API_KEY`, `OPENAI_MODEL` (a model supporting structured outputs), and `QUICKVIEW_AI_MODE=openai` in this service's Railway Variables. Never commit a key or reuse credentials from legacy projects. Only the owner's question and context are sent for drafting; employee responses are assembled locally. The UI discloses external question drafting before submission. Failed or invalid model output returns an explicitly labeled guided draft.

The adapter uses the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). Provider integration is covered by mocked tests; no live model call was made during verification.

## Local development

Requires Node 22.14+; there are no runtime dependencies.

```sh
cp .env.example .env
npm start
npm run check
npm test
```

Default URL: http://127.0.0.1:3150/ . Local SQLite files are ignored by git. Tests use synthetic data and isolated databases.

## Pilot limits

No subscription billing, email delivery, password recovery, email verification, SSO, organization switching, member offboarding, attachment uploads, original Workwork synchronization, automatic operating-process mining, automatic KPI arithmetic, or background reminder delivery. Guided templates cover a bounded set of questions; the owner edits the plan before launch. A production operations review and tested backup/restore procedure are needed before broad paid rollout.

See [deployment](docs/DEPLOYMENT.md), [product contract](docs/PRODUCT.md) and [verification](docs/VERIFICATION.md).
