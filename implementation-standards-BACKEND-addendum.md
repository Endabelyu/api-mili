# Backend — Implementation Standards Addendum
**Missing Pieces | MAANG-Grade Completeness | 2025**

> Supplements: `implementation-standards-BACKEND.md`
> Sources: Google SRE Book, AWS Well-Architected Framework, Martin Fowler (Saga, Outbox, Event Sourcing), NIST SP 800-53, PCI DSS v4.0, Stripe Engineering Blog (Webhook Delivery), AWS Architecture Blog, DORA Metrics

---

## How to Use This Document

Each item is labeled:
- 🔴 **Must** — non-negotiable, blocks production
- 🟡 **Should** — strongly recommended, skipping creates known risk
- 🟢 **Can** — good practice, implement when applicable

---

# 13. MICROSERVICES COMMUNICATION PATTERNS

## 13.1 Choosing the Right Protocol

| Use Case | Protocol | Reason |
|---|---|---|
| CRUD APIs, external-facing, browser clients | REST/HTTP | Ubiquitous, human-readable, cacheable |
| High-throughput internal service-to-service | gRPC | Binary protocol, 5–10× smaller payload, streaming support, generated clients |
| Async work, decoupled producers/consumers | Message queue (Kafka, SQS, RabbitMQ) | Decoupling, buffering, replay |
| Long-running workflows, fan-out | Event bus | Pub/sub model, multiple consumers |
| GraphQL | BFF layer only | Never inter-service; surface to clients |

- 🔴 Communication protocol chosen per integration, not per team preference — document the choice and rationale in an ADR.
- 🔴 Synchronous REST/gRPC used for: requests requiring an immediate response, simple query/command semantics, and latency-sensitive operations.
- 🔴 Async messaging used for: operations where the caller does not need an immediate result, cross-service data propagation, and anything that can be retried independently.

## 13.2 gRPC Standards

- 🔴 `.proto` files versioned and stored in a shared repository or schema registry — the contract between services.
- 🔴 Breaking changes to proto files prohibited without a versioning increment — adding fields is non-breaking, removing is breaking.
- 🔴 Deadlines set on every gRPC call — `ctx.WithTimeout(parent, 5*time.Second)`. No deadline = indefinite hang.
- 🟡 gRPC-Gateway deployed for services that need to expose both gRPC and HTTP/JSON from the same service definition.
- 🟡 `grpc-health-probe` used for Kubernetes liveness/readiness probes on gRPC services.

## 13.3 Message Queue Standards

- 🔴 Messages are idempotent — consumers must handle duplicate delivery without side effects. All queue systems deliver at-least-once.
- 🔴 Consumer groups / queue names prefixed with service name — `payments-service.user.created` not `user.created`.
- 🔴 Dead Letter Queue (DLQ) configured on every consumer — messages that fail after max retries go to DLQ, never silently dropped.
- 🔴 Message schema defined in a schema registry (Confluent Schema Registry, AWS Glue) — prevents schema drift between producer and consumer.
- 🟡 Message ordering guaranteed only when required — do not over-constrain; ordering limits parallelism.
- 🟡 Consumer lag monitored as a metric — alert when lag exceeds threshold (indicates consumer is falling behind).

---

# 14. EVENT-DRIVEN ARCHITECTURE

## 14.1 Outbox Pattern (Reliable Event Publishing)

The core problem: publishing an event to a message queue and updating a database must be atomic. Doing them separately creates a window where one succeeds and the other fails.

- 🔴 Transactional Outbox pattern used for all event publishing from services that own a database:
  1. Write the domain event to an `outbox` table **in the same database transaction** as the state change.
  2. A separate relay process reads from `outbox` and publishes to the message broker.
  3. Mark outbox records as published after confirmation.

```sql
-- ✅ Required pattern — atomic state + event
BEGIN TRANSACTION;
  UPDATE orders SET status = 'CONFIRMED' WHERE id = $1;
  INSERT INTO outbox (id, aggregate_type, event_type, payload, created_at, published)
  VALUES (gen_random_uuid(), 'Order', 'OrderConfirmed', $2::jsonb, NOW(), false);
COMMIT;
-- Separate relay process picks up unpublished outbox records and publishes to Kafka/SQS
```

- 🔴 Outbox relay is idempotent — if it publishes and crashes before marking `published=true`, it will re-publish on recovery. Consumers must be idempotent.
- 🟡 Debezium (CDC) used as the outbox relay for high-throughput systems — reads directly from the Postgres WAL.

## 14.2 Event Sourcing (When Applicable)

Apply when: full audit history is a business requirement, temporal queries ("what was the state at T?") are needed, or complex event-driven workflows require replay.

- 🔴 Events are immutable and append-only — never update or delete events from the event store.
- 🔴 Event schema versioned — `OrderCreated.v1`, `OrderCreated.v2`. Upcasters handle reading old versions.
- 🔴 Aggregate IDs used as stream identifiers — all events for `Order:123` form a stream.
- 🟡 Snapshots taken every N events for aggregates with long histories — avoids replaying thousands of events on every load.
- 🟢 EventStoreDB or Marten (Postgres-based) as the event store — not a relational DB with an `events` table (works but has limits).

---

# 15. SAGA PATTERN (DISTRIBUTED TRANSACTIONS)

Never use distributed two-phase commit (2PC) in microservices — it is fragile and creates tight coupling. Use Sagas instead.

## 15.1 Choreography Saga

Each service publishes events and reacts to events from other services. No central coordinator.

- 🟡 Use for: simple workflows (≤ 3–4 services), where coupling between services is already low.
- 🟡 Each service handles its own compensating transaction when it receives a failure event.

## 15.2 Orchestration Saga (Required for Complex Flows)

- 🔴 Use for: complex workflows (5+ services), where visibility and control are critical (e.g. order fulfillment, payment processing).
- 🔴 A dedicated Saga Orchestrator service (or a workflow engine like Temporal.io) manages the workflow state and issues commands to participant services.
- 🔴 Every saga step has a defined compensating transaction — the action to undo if a later step fails.

```
// ✅ Order fulfillment saga — each step has a compensating action
Step 1: Reserve inventory     → Compensate: Release inventory reservation
Step 2: Charge payment        → Compensate: Issue refund
Step 3: Create shipment       → Compensate: Cancel shipment
Step 4: Send confirmation     → (no compensation needed — notification)
```

- 🔴 Saga state persisted durably — not in-memory. If the orchestrator crashes, the saga must resume correctly.
- 🔴 Idempotency keys on all saga commands — re-sending a command cannot duplicate side effects.
- 🟡 Temporal.io used for complex, long-running sagas — handles retries, timeouts, and state persistence automatically.

---

# 16. MULTI-TENANCY PATTERNS

## 16.1 Choosing an Isolation Model

| Model | Isolation | Cost | Use When |
|---|---|---|---|
| **DB per tenant** | Highest | Highest | Enterprise/regulated, strict data residency requirements |
| **Schema per tenant** | High | Medium | Mid-market SaaS, Postgres schemas, moderate tenant count (<1000) |
| **Row-level security (RLS)** | Medium | Lowest | High tenant count, shared infra, performance-critical |

- 🔴 Multi-tenancy model decided before any data model is built — retrofitting is extremely costly.
- 🔴 `tenant_id` present on every table in RLS or shared-schema models — there are no exceptions.

## 16.2 Row-Level Security (Postgres RLS)

- 🔴 RLS policies defined at the database level — not only enforced in application code. Defense in depth: if the app layer has a bug, the database does not leak cross-tenant data.

```sql
-- ✅ Required pattern for RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY; -- Applies to table owner too

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Application sets this before each query:
-- SET LOCAL app.current_tenant_id = '<tenant-uuid>';
```

- 🔴 `current_setting` used to pass tenant context to the DB within a transaction — not a column in the query WHERE clause (policy enforces it at the DB level).
- 🔴 RLS tested explicitly — a test that verifies Tenant A cannot read Tenant B's data through the application layer.

## 16.3 Cross-Cutting Tenant Standards

- 🔴 Tenant context propagated through the entire request lifecycle — set on entry (auth middleware), available in service layer, set as DB session variable.
- 🔴 Background jobs and async workers carry tenant context — a job triggered by Tenant A must not execute in a context where it can access Tenant B's data.
- 🟡 Per-tenant rate limiting — one tenant cannot exhaust resources for others.
- 🟡 Per-tenant feature flags — gradual rollout to specific tenants before general availability.

---

# 17. WEBHOOK DELIVERY GUARANTEES

- 🔴 Webhook delivery is at-least-once — the system retries until the destination acknowledges with a 2xx response.
- 🔴 Exponential backoff with jitter on retries — immediate, 30s, 2m, 10m, 1h, 6h, 24h.
- 🔴 Maximum retry duration configured — typically 72 hours. After expiry, event moved to DLQ and operator alerted.
- 🔴 Each webhook delivery has a unique `delivery_id` — consumers use this for idempotency.
- 🔴 Webhook signature verification implemented:

```typescript
// ✅ Required — HMAC-SHA256 signature for all webhook payloads
import { createHmac, timingSafeEqual } from 'crypto';

function signWebhookPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = signWebhookPayload(payload, secret);
  // timingSafeEqual prevents timing attacks
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
// Send as header: X-Webhook-Signature: sha256=<hex>
```

- 🔴 Signature verification documented for consumers — include example code in multiple languages.
- 🟡 Webhook delivery status visible in a dashboard — operators can see failed deliveries and manually retry.
- 🟡 Webhook secret rotation supported — consumers can rotate secrets with a brief overlap window.
- 🟢 Svix or similar managed webhook infrastructure for teams without bandwidth to build the above from scratch.

---

# 18. BACKUP & DISASTER RECOVERY

## 18.1 Definitions (Required — Not Optional)

- 🔴 **RTO (Recovery Time Objective)** defined per service: the maximum acceptable downtime. Example: "Payment service RTO = 1 hour."
- 🔴 **RPO (Recovery Point Objective)** defined per service: the maximum acceptable data loss. Example: "Orders DB RPO = 5 minutes."
- 🔴 RTO and RPO drive backup frequency and replication strategy — they are not documentation artifacts, they are engineering requirements.

## 18.2 Backup Standards

- 🔴 Automated database backups: daily full, hourly incremental (or continuous WAL archiving for Postgres).
- 🔴 Backups stored in a **separate AWS account or cloud region** — not the same account as production. A compromised production account must not be able to delete backups.
- 🔴 Backup encryption: AES-256 at rest, separate encryption key from production data key.
- 🔴 Backup retention: 7 daily, 4 weekly, 12 monthly — minimum. Adjust for compliance requirements.

## 18.3 Recovery Testing (The Part Teams Skip)

- 🔴 Restore tested on a schedule — quarterly minimum. A backup that has never been restored is not a backup.
- 🔴 Restore test documents: time taken, data integrity verification steps, and who performed it.
- 🔴 Automated restore test in a staging environment — script the restore and verify row counts and checksums.
- 🟡 Chaos engineering: scheduled automated failure injection to verify recovery procedures (Netflix Chaos Monkey model).

---

# 19. API DEPRECATION STRATEGY

- 🔴 API versioning from day one (`/api/v1/`) — covered in base doc. Deprecation requires it.
- 🔴 Deprecation lifecycle defined and documented: Announce → Sunset period → Removal. Minimum sunset period: 6 months for external consumers, 2 months for internal.
- 🔴 `Sunset` header on deprecated endpoints (RFC 8594):

```http
HTTP/1.1 200 OK
Sunset: Sat, 01 Jan 2026 00:00:00 GMT
Deprecation: Mon, 01 Jul 2025 00:00:00 GMT
Link: <https://api.example.com/v2/users>; rel="successor-version"
```

- 🔴 Deprecation logged — when a consumer calls a deprecated endpoint, log the consumer's `client_id` and the deprecated path. This tells you who has NOT migrated.
- 🟡 Email notification sent to API key owners when an endpoint they use enters the sunset window.
- 🟡 Version usage metrics tracked — `api_version` dimension on all API metrics.

---

# 20. COST OPTIMIZATION

## 20.1 Database Cost

- 🔴 Slow query log enabled — queries > 100ms logged and reviewed weekly.
- 🔴 `EXPLAIN ANALYZE` run on all queries that touch tables with > 100k rows before merging.
- 🔴 Unused indexes identified and dropped — write amplification from unused indexes costs money and performance.
- 🟡 Connection pooling (PgBouncer for Postgres) — prevents connection count from scaling with pod count.
- 🟡 Read replicas for reporting/analytics queries — don't run heavy reads against the primary.

## 20.2 Infrastructure Cost

- 🔴 Cloud cost dashboard reviewed weekly — not just at billing cycle. Unexpected spikes caught within days.
- 🔴 Resource requests and limits set on all Kubernetes pods — prevents one runaway pod from consuming the node.
- 🟡 Spot/Preemptible instances for stateless workloads (workers, batch jobs) — 60–80% cost reduction.
- 🟡 Autoscaling configured with scale-to-zero for non-critical environments (staging, dev).
- 🟡 Reserved instances / Savings Plans for baseline production load — on-demand pricing only for burst capacity.
- 🟢 FinOps tooling (AWS Cost Explorer, Infracost in CI) — cost impact visible before deployment.

---

# 21. MULTI-REGION & ACTIVE-ACTIVE DEPLOYMENT

Apply when: SLA requires availability > 99.9% (allowing only 8.7 hours downtime/year), regulatory requirements mandate data residency in specific regions, or single-region latency is unacceptable for a global user base.

- 🔴 Active-active requires conflict resolution strategy for writes — design data model for eventual consistency or use a globally distributed database (CockroachDB, Spanner, DynamoDB Global Tables).
- 🔴 DNS failover configured — Route 53 health checks or Cloudflare Load Balancing routes traffic away from unhealthy regions automatically.
- 🔴 Regional isolation: a failure in one region must not cascade to others. Avoid cross-region synchronous calls in the critical path.
- 🔴 Data residency documented per region — GDPR requires EU user data to stay in the EU unless adequacy decisions apply.
- 🟡 Active-passive as a simpler starting point — primary region handles all writes, secondary is read-only with automated failover.
- 🟡 CRDTs (Conflict-free Replicated Data Types) for data that must merge without conflicts (counters, sets).
- 🟢 Global Accelerator (AWS) or Anycast routing — routes users to the nearest region at the network layer.

---

# 22. PCI DSS COMPLIANCE (If Handling Raw Card Data)

If your application never handles raw card numbers (PANs) and uses a PCI-compliant payment processor (Stripe, Braintree) via their JS libraries and server-side tokenization, you are in **SAQ A scope** — the lightest compliance tier. The items below apply if you handle raw card data directly (SAQ D scope).

- 🔴 Cardholder data environment (CDE) network segmented from all other systems — separate VPC/subnet, separate security groups.
- 🔴 All cardholder data encrypted with AES-256 at rest and TLS 1.2+ in transit.
- 🔴 PAN (card number) masked in logs, displays, and exports — show only last 4 digits.
- 🔴 Access to cardholder data restricted to only systems and individuals with a business need.
- 🔴 Quarterly vulnerability scans by an Approved Scanning Vendor (ASV).
- 🔴 Penetration test annually and after significant infrastructure changes.
- 🟡 Strong recommendation: use Stripe.js / Braintree client-side tokenization and never let raw card data touch your servers. This reduces compliance scope from SAQ D (~300 controls) to SAQ A (~20 controls).

---

# Backend Addendum Checklist

**Microservices Communication**
- [ ] Protocol choice documented in ADR per integration (REST / gRPC / queue)
- [ ] gRPC: deadlines set on every call, proto files in shared schema registry
- [ ] Message queue: DLQ configured, consumer groups named, messages idempotent

**Event-Driven**
- [ ] Transactional Outbox pattern for all event publishing
- [ ] Events have versioned schema in schema registry
- [ ] Consumers are idempotent (at-least-once delivery handled)

**Sagas**
- [ ] No distributed 2PC — Saga pattern used for distributed transactions
- [ ] Every saga step has a compensating transaction defined
- [ ] Saga state persisted durably (not in-memory)
- [ ] Idempotency keys on all saga commands

**Multi-Tenancy**
- [ ] Isolation model chosen and documented before data model built
- [ ] `tenant_id` on every table in shared models
- [ ] RLS policies at DB level (not only app level)
- [ ] Tenant context carried through async jobs

**Webhooks**
- [ ] At-least-once delivery with exponential backoff retry
- [ ] HMAC-SHA256 signature on every delivery
- [ ] Delivery ID for consumer idempotency
- [ ] Dead letter queue after max retry

**Backup & DR**
- [ ] RTO and RPO defined per service
- [ ] Backups in separate account/region from production
- [ ] Restore tested quarterly — results documented
- [ ] Automated restore test in staging

**API Deprecation**
- [ ] `Sunset` header on deprecated endpoints
- [ ] Deprecated endpoint usage logged by consumer
- [ ] Minimum sunset window: 6 months external, 2 months internal

**Cost**
- [ ] Slow query log enabled, reviewed weekly
- [ ] Cloud cost reviewed weekly
- [ ] Spot instances for stateless workloads
- [ ] Resource requests/limits on all K8s pods

---

*Sources: Google SRE Book · AWS Well-Architected Framework · Martin Fowler (Patterns of Enterprise Application Architecture) · Temporal.io Docs · PCI DSS v4.0 · RFC 8594 (Sunset Header) · Stripe Engineering Blog · Netflix Tech Blog · CockroachDB Docs · GDPR Chapter V (Data Transfers)*
