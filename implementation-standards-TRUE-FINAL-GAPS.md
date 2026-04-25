# Engineering Standards — True Final Gaps
**Threat Modeling · Chaos Engineering · RFC / Design Doc Process · SOC 2 / ISO 27001 Audit Readiness**
**Completing 100% MAANG-Grade Coverage | 2025**

> This is the last gap document. After a full systematic audit of all 7 prior standards documents, these 4 areas had zero or near-zero substantive coverage. Every other area is covered in the prior documents.
>
> Sources: Microsoft STRIDE Threat Model, OWASP Threat Modeling Cheat Sheet, Netflix Chaos Engineering Principles (principlesofchaos.org), Google DiRT (Disaster Recovery Testing), Google Design Doc Template, RFC Process (IETF model adapted for engineering teams), AICPA SOC 2 Trust Service Criteria, ISO/IEC 27001:2022, AWS Audit Manager, Vanta/Drata Implementation Guides

---

## How to Use This Document

Each item is labeled:
- 🔴 **Must** — non-negotiable, blocks production
- 🟡 **Should** — strongly recommended, skipping creates known risk
- 🟢 **Can** — good practice, implement when applicable

Each section opens with a **"Consider when"** note.

---

# 1. THREAT MODELING

> **Consider when:** Always — for any feature that handles user data, money, authentication, or authorization. Threat modeling is the practice of identifying what can go wrong *before* you build it, rather than discovering it in a pentest after shipping. Google, Microsoft, and Amazon all require threat models for new systems handling sensitive data. It takes 2–4 hours and consistently prevents the most serious security bugs.

## 1.1 When to Do a Threat Model

- 🔴 **New service or system** — before the first line of production code is written.
- 🔴 **New authentication or authorization flow** — login, OAuth, API keys, role changes.
- 🔴 **Any feature touching payments, PII, or health data** — the data sensitivity warrants it.
- 🔴 **Significant architecture change** — adding a new external integration, changing data storage, introducing a queue.
- 🟡 **Annually on existing critical systems** — threat landscape changes even if the system does not.

## 1.2 The STRIDE Method

STRIDE is the industry-standard threat categorization framework, developed at Microsoft and used across MAANG. For each component in your system, ask whether each STRIDE threat applies.

| Threat | What It Means | Example |
|---|---|---|
| **S**poofing | Attacker pretends to be someone they are not | Forging a JWT, impersonating another user |
| **T**ampering | Attacker modifies data in transit or at rest | MITM modifying an API request, altering a DB record |
| **R**epudiation | User denies performing an action, no proof exists | No audit log of a financial transaction |
| **I**nformation Disclosure | Data exposed to unauthorized parties | Error message leaking stack trace, S3 bucket public |
| **D**enial of Service | System made unavailable | Unbounded query exhausting DB, no rate limiting |
| **E**levation of Privilege | User gains more access than intended | IDOR, BOLA, JWT with manipulable claims |

## 1.3 Process — How to Run a Threat Model

**Step 1: Draw the Data Flow Diagram (DFD)**
Map every component involved in the feature: clients, services, databases, queues, external APIs. Draw arrows showing data flow. Mark trust boundaries — the line between "we control this" and "we do not control this."

```
[Browser] ──HTTPS──▶ [API Gateway] ──▶ [Auth Service] ──▶ [User DB]
                           │
                           ▼
                    [Orders Service] ──▶ [Orders DB]
                           │
                           ▼
                    [Payment Provider] (external — trust boundary)
```

**Step 2: Apply STRIDE to each component and data flow**
For each arrow and box in the diagram, ask: which STRIDE threats apply here? Be systematic — do not skip components because they seem safe.

**Step 3: Rate each threat**
Use DREAD or a simple High/Medium/Low rating. Prioritize by: likelihood × impact.

**Step 4: Define mitigations**
For each threat, define the control that mitigates it. The mitigation becomes a requirement — not optional.

**Step 5: Document and track**
- 🔴 Threat model stored alongside the system it covers — in the repo `docs/threat-model.md` or an ADR.
- 🔴 Unmitigated threats become security backlog tickets — not forgotten.
- 🔴 Threat model reviewed by a second engineer — the person who designed the system has blind spots.

## 1.4 Threat Model Template

```markdown
# Threat Model: [Feature / System Name]
**Date:** YYYY-MM-DD
**Author:** 
**Reviewer:**
**Scope:** What is being modeled

## System Overview
Brief description of the feature and its security sensitivity.

## Data Flow Diagram
[Diagram or link to diagram]

## Trust Boundaries
- [Boundary 1]: e.g., between browser and API
- [Boundary 2]: e.g., between internal services and external payment provider

## Assets to Protect
- [Asset]: e.g., user PII, payment tokens, session credentials

## STRIDE Analysis

| Component / Flow | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| Browser → API Gateway | ✓ | ✓ | | ✓ | ✓ | | JWT spoofing, MITM |
| API → Payment Provider | | ✓ | ✓ | ✓ | | | Webhook tampering |

## Threats and Mitigations

### THREAT-001: JWT Token Forgery
- **Category:** Spoofing
- **Severity:** High
- **Description:** Attacker crafts a JWT with elevated privileges
- **Mitigation:** Validate signature with RS256, validate `iss`, `aud`, `exp` on every request
- **Status:** Mitigated / Open / Accepted (with justification)

## Open / Accepted Risks
Threats not mitigated and why (business decision, low likelihood, compensating control).

## Review Sign-off
- [ ] Author reviewed
- [ ] Second engineer reviewed
- [ ] Security champion reviewed (for High severity threats)
```

---

# 2. CHAOS ENGINEERING

> **Consider when:** Your system handles production traffic, has multiple services with dependencies, and downtime has business impact. Netflix invented chaos engineering with Chaos Monkey. Google calls it DiRT (Disaster Recovery Testing). Amazon calls it Game Days. The principle: deliberately inject failures in a controlled way to verify your system's resilience *before* real failures do it uncontrolled.
>
> **Note:** Do not start chaos engineering until your observability is solid — you need to be able to observe the system's behavior during experiments. Chaos without observability is just breaking things.

## 2.1 Principles of Chaos Engineering

1. **Define steady state first** — what does "normal" look like? (error rate < 0.1%, p99 latency < 500ms, all health checks green). You cannot detect deviation without a baseline.
2. **Hypothesize that steady state will hold** — "we believe the system will maintain steady state even when Service X becomes unavailable."
3. **Introduce realistic failures** — not exotic ones. The most common real failures: network latency spikes, service crashes, disk full, dependency timeouts.
4. **Run in production or a production-like environment** — staging does not have the same traffic patterns, data volumes, or infrastructure topology.
5. **Minimize blast radius** — start small (1% of traffic, one pod) and expand as confidence grows.
6. **Stop immediately if steady state is violated unexpectedly** — chaos engineering is controlled; an uncontrolled incident is not an experiment.

## 2.2 Getting Started — The Maturity Ladder

- 🔴 **Level 1 — Game Days (manual, scheduled):** A scheduled exercise where the team manually kills a pod, blocks a network route, or fills a disk, then observes how the system responds. No automation required. Do this before any chaos tooling. Quarterly minimum.
- 🟡 **Level 2 — Automated failure injection (tooling):** Use Chaos Mesh, Litmus Chaos, or AWS Fault Injection Simulator to inject failures programmatically. Run against staging automatically on a schedule.
- 🟢 **Level 3 — Continuous chaos in production (Netflix model):** Small, automated experiments running continuously against production. Requires mature observability and very high team confidence in system resilience.

## 2.3 Game Day Process

- 🔴 **Game Day planned with a defined hypothesis** — "If the Redis cache becomes unavailable, the API will degrade gracefully to database reads within 2 seconds, with p99 latency increasing to no more than 800ms."
- 🔴 **Rollback plan defined before starting** — how do you stop the experiment and restore normal state? Have this ready before injecting anything.
- 🔴 **All responders notified** — on-call team, SRE, engineering lead. A game day looks like an incident from the outside; people need to know it is intentional.
- 🔴 **Results documented** — what happened vs what was hypothesized. If the hypothesis was wrong, that is a finding that needs a follow-up action.

**Standard failure scenarios to test (prioritized):**

| Failure | Tests | Mitigations Verified |
|---|---|---|
| Kill a single pod | Health checks, K8s restart | Liveness probe, restart policy |
| Kill all pods of a service | Circuit breaker, fallback | Circuit breaker trips, degraded mode |
| Introduce 500ms network latency | Timeout handling | Timeouts fire, not infinite hangs |
| Drop 10% of network packets | Retry logic | Retries with backoff, idempotency |
| Fill disk to 95% | Alert fires, app handles it | Disk alert, graceful logging failure |
| Kill primary DB, promote replica | Failover time, connection handling | DB failover < RTO, app reconnects |
| Exhaust connection pool | Connection pool behavior | Pool exhaustion handled, not cascading |
| External API returns 503 | Circuit breaker, fallback | Circuit breaker, fallback response |

## 2.4 Tooling

- 🟡 **Chaos Mesh** — Kubernetes-native, supports network chaos, pod chaos, stress testing, IO chaos. Open source.
- 🟡 **AWS Fault Injection Simulator (FIS)** — native to AWS, integrates with EC2, ECS, RDS, and more. Managed, no cluster installation.
- 🟡 **Litmus Chaos** — CNCF project, extensive experiment library, good for teams already on the CNCF stack.

---

# 3. RFC / DESIGN DOC PROCESS

> **Consider when:** Your team has 5+ engineers, you are building something that will take more than 1 week to implement, or a decision will be hard to reverse (data model, API contract, architecture choice, new external dependency). The RFC process prevents the two most common and expensive engineering failures: building the wrong thing, and building the right thing in a way that causes problems 6 months later.
>
> **Note:** ADRs (Architecture Decision Records) are covered in the backend doc — they record decisions already made. The RFC process is what happens *before* that decision, while it is still open.

## 3.1 When an RFC Is Required

- 🔴 **New service or significant new subsystem** — anything that introduces a new deployable unit.
- 🔴 **Changes to public or internal API contracts** — breaking or non-breaking.
- 🔴 **New external dependency** — adding a new SaaS provider, database engine, or infrastructure component.
- 🔴 **Data model changes affecting multiple services** — schema changes with cross-service impact.
- 🔴 **Any decision the team will spend > 1 sprint implementing** — if it takes that long to build, it takes 2 hours to write a doc and get alignment first.
- 🟡 **Significant refactor or migration** — changing the ORM, migrating from REST to gRPC, splitting a monolith.

A one-person 2-day feature does not need an RFC. A team 3-week project does.

## 3.2 RFC Lifecycle

```
Draft → Review (open comment period) → Decision → Implementation → Superseded / Obsolete
```

- 🔴 **Draft written by the proposing engineer** — not by committee. One person owns the doc and is responsible for incorporating feedback.
- 🔴 **Open review period: minimum 3 business days** — reviewers have time to read, think, and comment. A 1-hour turnaround is not a review.
- 🔴 **Decision made explicitly** — "Approved", "Approved with changes", "Rejected with rationale", or "Needs more work." No decision is not acceptable — RFCs do not sit open indefinitely. Set a decision deadline.
- 🔴 **Decision and rationale recorded** — why this option was chosen over alternatives. This is the institutional knowledge that prevents relitigating the same decisions 12 months later.
- 🟡 **RFC number assigned sequentially** — `RFC-001`, `RFC-002`. Easy to reference in PRs, tickets, and ADRs.
- 🟡 **RFCs stored in version control** — `/docs/rfcs/RFC-001-auth-service-design.md`. Not in Confluence or Notion (which drift and lose history).

## 3.3 RFC Template

```markdown
# RFC-NNN: [Title]
**Status:** Draft | Under Review | Approved | Rejected | Superseded by RFC-NNN
**Author:** 
**Created:** YYYY-MM-DD
**Decision deadline:** YYYY-MM-DD
**Decider:** [Name or role — who makes the final call]

## Summary
One paragraph. What are you proposing and why?

## Motivation
What problem does this solve? What is the current pain? 
What happens if we do nothing?

## Detailed Design
The full technical proposal. Include:
- Architecture diagrams or data flow where helpful
- API contracts or schema changes
- Migration plan if replacing existing behavior
- Rollout strategy (big bang vs gradual)

## Alternatives Considered
| Option | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| Option A (proposed) | | | |
| Option B | | | |
| Option C (do nothing) | | | |

## Trade-offs and Risks
What are we accepting by choosing this approach?
What could go wrong during or after implementation?
What is the rollback plan if it fails?

## Open Questions
Questions that need answers before this RFC can be approved.
Tag the person who can answer each question.

## Decision
[Filled in when decision is made]
**Decision:** Approved / Rejected / Needs more work
**Rationale:** Why this decision was made
**Conditions:** Any conditions attached to approval

## Implementation Plan
High-level milestones and owners. Links to epics/tickets.
```

## 3.4 RFC Culture

- 🔴 **Feedback is on the proposal, not the person** — same blameless culture as post-mortems.
- 🔴 **Silence is not approval** — reviewers who do not comment by the deadline are treated as non-blocking. But they cannot object after the decision is made based on feedback they did not provide.
- 🟡 **RFC review meeting optional, not default** — most RFCs should be resolved asynchronously via written comments. A meeting is warranted only for genuinely complex or contentious proposals.
- 🟡 **Junior engineers encouraged to write RFCs** — the RFC process builds technical writing and system design skills. It is not only for senior engineers.

---

# 4. SOC 2 / ISO 27001 AUDIT READINESS

> **Consider when:** You are selling to enterprise customers, US government agencies, or operating in regulated industries (finance, healthcare, legal). Enterprise procurement almost universally requires SOC 2 Type II now. ISO 27001 is the European and global equivalent. Both can be pursued simultaneously — roughly 80% of controls overlap.
>
> **Note:** This section covers what to implement and how to prepare. It does not replace a qualified auditor or compliance consultant — engage one before your first audit cycle. Tools like Vanta, Drata, or Secureframe automate evidence collection and reduce audit prep time significantly.

## 4.1 SOC 2 vs ISO 27001 — Choosing

| | SOC 2 Type II | ISO 27001 |
|---|---|---|
| **Origin** | US (AICPA) | International (ISO/IEC) |
| **Format** | Auditor report shared under NDA | Certification publicly listed |
| **Audience** | US enterprise customers, VC due diligence | European customers, global enterprise |
| **Scope** | 5 Trust Service Criteria (TSC) | 93 controls across 4 domains |
| **Timeline** | 6–12 months observation period + audit | 6–9 months implementation + audit |
| **Renewal** | Annual | Annual surveillance + 3-year recertification |

- 🟡 **Start with SOC 2 Type II** if your primary market is the US — it is the most commonly requested.
- 🟡 **Add ISO 27001 if expanding to Europe or enterprise global** — many EU customers will not accept SOC 2 alone.

## 4.2 SOC 2 Trust Service Criteria — What You Must Implement

SOC 2 is built on 5 Trust Service Criteria (TSC). Security (CC) is required; the others depend on your commitments to customers.

| Criteria | Required | Covers |
|---|---|---|
| **CC — Security** | Always | Access control, encryption, monitoring, incident response |
| **A — Availability** | If you have uptime SLAs | Redundancy, DR, capacity, monitoring |
| **PI — Processing Integrity** | If you process transactions | Data validation, error handling, completeness |
| **C — Confidentiality** | If you handle confidential data | Data classification, access restriction, encryption |
| **P — Privacy** | If you handle personal data | GDPR/CCPA-equivalent controls, data inventory |

## 4.3 The Controls You Must Have in Place (Security Criteria)

These are the controls auditors will look for evidence of. Most are already covered in the prior standards documents — this maps them to SOC 2 language and adds what is missing.

**Access Control (CC6)**
- 🔴 Multi-factor authentication enforced for all production system access — AWS console, GitHub, Datadog, every SaaS tool.
- 🔴 Principle of least privilege documented and enforced — IAM policies, DB user permissions.
- 🔴 Access provisioning and deprovisioning process — new hire gets access, departed employee loses access on last day. Documented and auditable.
- 🔴 Privileged access (production DB, secrets manager) requires approval and is logged.
- 🔴 Quarterly access review — who has access to what. Auditors will ask for evidence this happened.

**Encryption (CC6.7)**
- 🔴 Data encrypted at rest (AES-256) and in transit (TLS 1.2+) — covered in backend doc. Auditors want evidence (AWS KMS configuration, TLS scan results).
- 🔴 Encryption key management documented — who manages keys, how they are rotated, where they are stored.

**Monitoring and Alerting (CC7)**
- 🔴 Security event monitoring — CloudTrail (AWS) or equivalent logging all API calls to production infrastructure.
- 🔴 Alerts for anomalous access patterns — failed login attempts, unusual API call volumes, access outside business hours for privileged accounts.
- 🔴 Log retention: minimum 1 year for security logs — SOC 2 auditors review 12 months of evidence.

**Incident Response (CC7.3–CC7.5)**
- 🔴 Incident response plan documented and tested — the process in the Cross-Cutting doc satisfies this. Auditors want the document and evidence it has been followed.
- 🔴 Incidents logged with timeline, impact, root cause, and resolution — post-mortem process in Cross-Cutting doc satisfies this.
- 🔴 Customer notification process for data breaches — SLA for notifying affected customers (GDPR: 72 hours to DPA, without undue delay to users).

**Change Management (CC8)**
- 🔴 All production changes go through a defined process — PR review, CI/CD pipeline, approved deployment. Auditors want evidence (GitHub PR history, deployment logs).
- 🔴 Separation of duties for production deployments — developers cannot self-approve and self-deploy without a second set of eyes. At minimum, CI/CD enforces this.
- 🔴 Change review for infrastructure — IaC PRs reviewed before apply. Covers the IaC standards in the backend doc.

**Vendor Management (CC9)**
- 🔴 Vendor inventory with risk classification — covered in the Final Gaps doc (Vendor Risk section).
- 🔴 Vendor SOC 2 reports reviewed — covered in Final Gaps doc.

## 4.4 Evidence Collection — What Auditors Actually Request

The audit is not a test of your intentions — it is a test of your evidence. The auditor will ask for:

- 🔴 **Population of changes** — list of every production deployment in the audit period. Pull from CI/CD.
- 🔴 **Sample of PRs** — show that reviews happened, CI passed, and approvals were given.
- 🔴 **Access review records** — evidence that quarterly access reviews occurred (screenshots, export of review meeting notes).
- 🔴 **Onboarding/offboarding records** — evidence that access was provisioned when hired and revoked when departed.
- 🔴 **Incident log** — list of all incidents in the audit period, with post-mortems.
- 🔴 **Vulnerability scan results** — output of `npm audit`, container scans, SAST results from CI.
- 🔴 **Penetration test report** — and evidence that findings were remediated.
- 🔴 **Backup test results** — evidence that restore tests happened.
- 🔴 **Security training completion records** — evidence that engineers completed security awareness training.

## 4.5 Preparation Timeline

```
Month 1–2:   Gap assessment — what controls exist, what is missing
Month 2–4:   Implement missing controls, instrument evidence collection
Month 4–6:   Internal readiness review — simulate what auditor will ask
Month 6:     Observation period begins (SOC 2 Type II: 6–12 months of evidence)
Month 12–14: Auditor fieldwork — evidence review, interviews
Month 14–15: Report issued
```

- 🔴 **Compliance automation tooling strongly recommended** — Vanta, Drata, or Secureframe integrates with your GitHub, AWS, GCP, and SaaS tools to collect evidence automatically. Manual evidence collection for a first audit without tooling typically takes 2–3 months of engineering time. With tooling, 2–4 weeks.
- 🟡 **Engage the auditing firm early** — brief them on your architecture before fieldwork begins. Surprises during fieldwork extend the timeline and cost.

---

# True Final Gaps Checklist

**Threat Modeling**
- [ ] Threat model process defined — STRIDE method adopted
- [ ] Threat model required for: new services, auth flows, payment/PII features
- [ ] DFD drawn for all threat models, trust boundaries marked
- [ ] Threat model stored in repo alongside the system it covers
- [ ] Unmitigated threats tracked as security backlog tickets
- [ ] Threat models reviewed by a second engineer

**Chaos Engineering**
- [ ] Steady state defined per service (baseline metrics)
- [ ] Quarterly Game Days scheduled and run
- [ ] Game Day hypothesis documented before starting
- [ ] Rollback plan defined before each experiment
- [ ] Standard failure scenarios tested (pod kill, network latency, DB failover)
- [ ] Results documented with follow-up actions
- [ ] Chaos tooling adopted (Chaos Mesh / AWS FIS) when Level 2 maturity reached

**RFC / Design Doc Process**
- [ ] RFC required criteria defined and shared with team
- [ ] RFC template in version control (`/docs/rfcs/`)
- [ ] Minimum 3-day review period enforced
- [ ] Decision deadline set on every RFC
- [ ] Decision and rationale recorded on every RFC
- [ ] RFCs numbered sequentially and stored in git

**SOC 2 / ISO 27001**
- [ ] Decision made: SOC 2, ISO 27001, or both
- [ ] Gap assessment completed against chosen framework
- [ ] MFA enforced on all production system access
- [ ] Access provisioning/deprovisioning process documented
- [ ] Quarterly access reviews conducted and evidenced
- [ ] Security event monitoring (CloudTrail / equivalent) active
- [ ] Security log retention: minimum 1 year
- [ ] Customer breach notification process documented (72h for GDPR)
- [ ] Compliance automation tooling selected (Vanta/Drata/Secureframe)
- [ ] Audit preparation timeline planned

---

*Sources: Microsoft STRIDE Threat Model · OWASP Threat Modeling Cheat Sheet · Principles of Chaos Engineering (principlesofchaos.org) · Netflix Chaos Engineering Blog · Google DiRT (Disaster Recovery Testing) · AWS Fault Injection Simulator Docs · Chaos Mesh Docs · IETF RFC Process · Google Engineering Practices · AICPA SOC 2 Trust Service Criteria 2017 · ISO/IEC 27001:2022 · Vanta SOC 2 Implementation Guide · Drata Compliance Docs*
