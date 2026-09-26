# Workwork Quick View: commercial assessment and pilot decision

Research date: 2026-09-26. Scope: current README and product contract, official competitor documentation, and primary SME research. No customer interviews, usage data, live competitor trials, or willingness-to-pay evidence were available. This is a decision memo, not a forecast of market success.

## Release context

This assessment examined the v0.1 baseline. The resulting v0.2 implementation now includes the owner exception desk, exact-source decisions, assigned actions with manager acceptance, freshness/reconfirmation, recurring check-in drafts, authenticated links and member offboarding. Snapshot tooling is tested locally; offsite backups and production recovery are not configured. References below to proposed capabilities reflect the assessment stage; the [current product contract](PRODUCT.md) and [verification record](VERIFICATION.md) describe shipped and tested behavior. Commercial conclusions remain unvalidated until real pilots.

## Recommendation

Continue with a narrow manufacturing pilot. The owner-question approach is a better starting point than waiting for months of work logs: a real question gives people a reason to supply relevant facts now. However, “ask employees, summarize their answers with AI” is an established category. A broad AI management platform is currently too weak a market position for this MVP.

The strongest initial promise is: **“Know which customer deliveries need your decision this week, from named, current team evidence, without chasing separate reports.”** Treat this as a hypothesis to test. Start with one owner, one operations coordinator, and a small group spanning production, quality and dispatch. Select a company that already experiences this coordination problem and has order references that people can use consistently. Do not require an ERP rollout, a daily log history, or a complete company process model first.

The business is plausible if it saves the combined reporting and chasing effort and leads to useful decisions. Its defensibility will have to come from repeatable manufacturing workflows, low employee effort, reliable evidence handling and distribution into actual SMEs. Neither AI summaries nor diagrams alone provide a durable advantage. There is no basis yet for a numerical success probability.

## What competitors already do

These are documented vendor capabilities or marketing claims, not independently measured outcomes. Sources were accessed on 2026-09-26; dates below are publication/update dates when visible.

| Alternative | Relevant documented behavior | Implication for Quick View |
|---|---|---|
| Geekbot | Its January 28, 2026 help article describes natural-language answers over team reports. Its March 10, 2026 feature guide covers conversational creation of standups/polls, selected participants, reminders, historical reporting and AI question suggestions. | Direct overlap with collecting answers and querying them. A new question box plus summary is insufficient differentiation. [Ask Geekbot](https://help.geekbot.com/en/articles/13549105-ask-geekbot), [features](https://help.geekbot.com/en/articles/14007711-geekbot-features). |
| Dailybot | Selected people answer configured questions by chat DM or web. Reports can include conditional follow-ups; its product pages advertise AI summaries and blocker handling. | Established competition on collection burden and delivery in existing work channels. Our current separate login and lack of notifications are disadvantages to validate. [Check-in model](https://www.dailybot.com/help/using-dailybot/check-ins/overview/), [official introduction](https://www.dailybot.com/help/getting-started/first-steps/what-is-dailybot/). |
| Asana | Smart Status drafts status updates for projects, portfolios and goals, with human editing before posting. | Goals connected to generated management updates are already familiar. [Smart Status documentation](https://help.asana.com/s/article/smart-status). |
| monday.com | Portfolio Risk Insights scans project board data, produces potential risks and executive reports, and offers owner notification. The article is marked updated August 28, 2026 and lists the Enterprise plan. | “AI spots risks and briefs leadership” is not unique. Quick View can test whether a much smaller setup suits companies without maintained project boards. [Risk Insights documentation](https://support.monday.com/hc/en-us/articles/22551628427666-The-portfolio-Risk-Insights). |
| Microsoft Teams and Slack | Microsoft documents a Channel Agent public preview with status reporting and task capabilities. Slack documents natural-language enterprise search over connected company sources. | Competing for the same management question. Their documentation does not establish successful adoption in our target companies. Do not claim they can only search or cannot coordinate people. [Teams agent FAQ](https://support.microsoft.com/en-us/teams/platform/frequently-asked-questions-about-agents-in-microsoft-teams), [Slack enterprise search](https://slack.com/features/enterprise-search). |
| Flow, Korea | Its official pages market AI project creation, reporting from work, organized meeting decisions/actions, searchable reports and OKR. These pages are marketing evidence, not independent validation. | Korean support, organizational memory and objectives alone are not a market gap. [Product site](https://flow.flow.team/ko), [reporting page](https://flow.team/ko/wiki/report). |

The practical comparison in the pilot should also include the company's existing calls, messenger threads, spreadsheet and recurring status meeting. These may feel free and require no rollout. Measure whether Quick View replaces some of that work rather than adding another reporting destination.

## Korean SME evidence: what it does and does not support

KOSI's study of regional manufacturing SME DX/AX, based on the 2024 smart manufacturing survey, describes substantial manual data entry and limited advanced technology use. That supports testing a product that works with incomplete and manually supplied evidence. It does not prove the demand for this product, imply that all SMEs lack systems, or establish a current nationwide willingness to pay. The online summary was accessible through search; its full underlying methodology was not reviewed. [KOSI research summary](https://www.kosi.re.kr/front/functionDisplay?dataSequence=B260410K02&menuFrontNo=59996687477237983229272069890802427549&menuFrontURL=front%2FbasicResearchDetail).

OECD's December 9, 2025 discussion paper treats SME adoption as dependent on digital maturity, skills, data, connectivity and finance. Its April 2026 survey explicitly warns that its digitally engaged sample is not nationally representative. Neither publication justifies converting broad AI interest into a market-size or success estimate for Korean manufacturing SMEs. [OECD adoption paper](https://www.oecd.org/en/publications/ai-adoption-by-small-and-medium-sized-enterprises_426399c1-en.html), [2026 survey](https://www.oecd.org/content/dam/oecd/en/publications/reports/2026/04/empowering-smes-in-the-age-of-ai_7f58652c/bf5a9816-en.pdf).

NAVER WORKS' August 27, 2026 vendor report surveyed 6,036 existing users and describes AI use for summaries, drafts and planning. It confirms local product activity, not unmet demand across Korean SMEs. Existing-user and product-subgroup responses must not be treated as national adoption rates. [NAVER WORKS user report](https://naver.worksmobile.com/blog/2026-naverworks-report/).

## Initial workflow to build and test

1. **Bound the owner's question.** One delivery period and order/customer scope, when an answer is needed, and what decision it should inform. Offer a Korean and English starter, without forcing owners to learn KPI/OKR terminology.
2. **Draft the smallest useful response plan.** Aim for three to five focused requests, reviewed by the owner. Reuse an authorized plan on later cycles. A generic question that generates ten broad departmental reports defeats the purpose.
3. **Show the question's practical context to each responder.** Ask only what changed, what is blocked, what evidence supports the assessment, and what decision is needed. Permit “unknown” or “not my area”; make clarification/reassignment straightforward. Use mobile layouts and authenticated direct links to the specific request.
4. **Assemble an exception-focused briefing.** Put reported blockers, decision requests, missing facts and evidence age before coverage metrics. Name the source and observation time. Keep contradictory reports visible. “All five people answered” must never become “delivery is safe.”
5. **Close the management loop.** Record the owner's decision, a responsible person, due date and a later evidence-bearing result. A decision note alone is useful history; follow-through is what tests management value. Decisions must not silently mean that problems are solved.
6. **Repeat without repeating setup.** Start the next cycle from the prior question and response plan, but require fresh assessments. Old evidence can be offered with its scope/date clearly shown. An old green status must not auto-answer the next week.

This is a proposed direction, not a claim that all six capabilities exist. The current MVP already has reviewed draft plans, named responses, source references, append-only history, clarification and a decision log. It lacks delivery channels, verified source ingestion, automatic KPI arithmetic and actual process mining. Guided rules must remain clearly identified when no live model is configured.

## Risks that can defeat adoption

- **Reporting burden moves downhill.** An owner gets a neat page while employees write an extra report. Measure the total minutes across everyone, including gathering facts, rewriting and follow-up messages; do not measure owner time alone.
- **Owner setup remains expert work.** If the founder must repeatedly rewrite the decomposition or manually find assignees, the product becomes consulting. Measure setup and support hours per account.
- **No response channel.** An in-app inbox can be missed. First test securely scoped direct links and existing manual sharing. Add a real messaging/email integration only after observing which channel the pilot actually uses; do not claim notifications are sent today.
- **False reassurance.** Freshly submitted text can describe old observations, and narrative optimism can conflict with QA or dispatch evidence. Keep source date, scope and uncertainty separate from submission date and response completion.
- **Sensitive questions are too widely shared.** The current product shares live questions and evidence with the company. That is not suitable for every owner question about personnel, contracts or finances. Make sharing clear in the current pilot and add scoped access before promising general confidential executive use.
- **The owner stops at reading.** If findings never produce decisions or useful confirmations, the service is merely another report. Track whether owner reviews occur and what happens next, without equating activity volume with employee performance.
- **Customization overwhelms subscription revenue.** One-off manufacturing taxonomies and complex system integrations can consume the margin. Standardize one workflow first and separately track setup/support costs.

## Pilot with falsifiable gates

Suggested design: one baseline week followed by four weeks in three small manufacturing companies, using the same weekly delivery-risk question. These are proposed internal targets, not industry benchmarks or statistically validated thresholds. If only one company is available, treat it as discovery and do not generalize market fit.

| Hypothesis | Measurement and proposed gate |
|---|---|
| An owner can start without a consultant | First real question launched in under 10 minutes after the team is enrolled; at least four of five requests usable with light edits. Record edits and assisted setup time. |
| Participation is practical | At least 80% of assigned requests answered by the agreed window; median active entry time at most two minutes, with fact-gathering time measured separately. No increase in total reporting effort compared with baseline. |
| The briefing saves coordination | At least 30% reduction in combined chasing and report assembly time versus comparable baseline cycles. Capture owner, coordinator and responder time, not just self-reported owner savings. |
| The answer is useful and safe to rely on | Every material statement traceable to a response/source; zero invented conclusions; disagreements and missing facts remain visible. Owner rates whether the question can be answered, separately from whether the business outcome is good. |
| The owner uses the service repeatedly | At least three of four weekly cycles completed without the founder personally chasing the owner; record explicit decisions or useful “no intervention needed” conclusions with reasons. |
| People want to buy it | Present a fixed subscription offer before the pilot ends. At least two of three owners agree to a paid next month at that disclosed price, with actual payment when commercial readiness permits. A compliment or free continuation is not conversion. |
| It can be delivered economically | Record onboarding, ongoing support and model/hosting cost per account; set a margin target before selecting a price. If every renewal requires custom implementation, reconsider the product scope. |

Pause broad feature expansion if participation relies on founder intervention, total reporting time rises, owners stop returning, or nobody will pay the previously disclosed price. Diagnose whether the failure is workflow selection, answer quality, distribution or a weak problem before adding process-mining features.

## Priorities

**Now:** make delivery-risk question starters concrete; improve response effort and scope clarity; prioritize decision needs and missing/current evidence; capture decision follow-through; instrument the pilot. Preserve existing data and permission/concurrency safeguards.

**Next, based on observed friction:** one communication channel, recurring question cycles with freshness checks, narrowly scoped source import, and access controls for restricted questions. Add a live model only with an explicit configuration and evaluation against real de-identified pilot questions; it should improve draft usefulness, not invent organization facts.

**Later:** full objective trees, automatic operating-process discovery, cross-company benchmarks and broad ERP/MES integrations. These should follow evidence of retention and paid value. The original Workwork Cloud can remain the longer-term evidence foundation while Quick View proves the shorter management loop.
