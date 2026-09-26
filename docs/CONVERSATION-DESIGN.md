# Conversations without an ontology interface

The user should think about the business question, not how to classify knowledge. A response has four ordinary actions: **Helpful**, **Add detail**, **Flag a concern**, **Ask a follow-up**. The last action is manager-authorized and asks for a responsible person. The recipient uses **Reply** in My requests. A collapsed conversation and optional relationship trail provide context only when requested.

## Meaning captured by the action

| User action | Internal meaning | What it does not establish |
|---|---|---|
| Respond / Reply | This answer addresses this exact question. | Verified truth, resolved concern or achieved KPI. |
| Ask a follow-up | This question arose from this specific contribution. | Causal dependency between factory operations. |
| Add detail | This contribution adds context to the referenced contribution. | A supporting fact unless its content and evidence justify that reading. |
| Flag a concern | This person raised a concern about this contribution. | That the earlier claim is false. |
| Helpful | This person found this particular contribution useful. | Manager approval, factual verification or employee quality. |
| Existing decision/action | A decision references a recorded response; an action follows explicit manager authorization. | That the reported problem is solved. |

All relationships are attached to immutable IDs, not reconstructed solely from message order. A newer answer does not take ownership of an old answer's concerns or endorsements. Original v0.2 clarification prompts are projected from their recorded request versions. Reply order describes a discussion; it is not a process-mining event log.

## Academic influences

- **Issue-based argumentation:** Kunz and Rittel's [Issues as Elements of Information Systems (1970)](https://escholarship.org/uc/item/5cj786v8) motivates keeping questions, proposed answers and discussion distinguishable. Quick View uses that separation while reducing the visible controls to familiar actions. It does not claim to implement the full IBIS notation.
- **Provenance:** [W3C PROV-O](https://www.w3.org/TR/prov-o/) provides a vocabulary for relationships among information, activities and agents. The practical influence here is preserving the original source record, author and time. The MVP's internal JSON graph is not a PROV-O serialization or conformity claim.
- **Knowledge organization:** [W3C SKOS](https://www.w3.org/TR/skos-reference/) separates concept relationships such as broader/narrower/related. These are a reference for a future reviewed knowledge layer, not labels users must enter now. No automatic concept hierarchy is asserted by this release.
- **Earlier implementation:** [Dapsol relationship system](https://github.com/wilcoco/dapsol/blob/f4234c26fec622b401224e232f1570e73981506b/doc/relationship-system.md) separates messages, knowledge units, topic clusters and cluster relations. Quick View adapts its discourse foundation. Investment economics and popularity-driven rankings are omitted from the company workflow.

## Example

An owner asks whether Friday's orders can ship. Production reports that B17 awaits bearings. Quality flags a concern that inspection is also incomplete. The owner asks the quality lead which inspection evidence is missing. The lead replies with the inspection record reference. The initial production answer, concern, follow-up and reply remain separately attributable and linked. The owner still records a decision explicitly; helpful feedback and the presence of a reply do not certify shipment readiness.

## Scope of v0.3

Implemented foundation: typed interaction graph, exact-parent contributions, active per-person helpful counts with retained event history, assigned follow-up visibility, and links to existing decisions/actions. Conversation creation uses the current company's existing sharing and access rules. No automatic messaging, fabricated employee responses, inferred ontology facts, confidence scores, or cause-and-effect extraction is introduced.

Future work requires separate evaluation: reviewed claim extraction, company-specific business entities and vocabulary, evidence verification, and process discovery from actual work events. This layer should preserve disagreements and dates rather than promote the most popular answer into truth.
