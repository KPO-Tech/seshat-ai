# Seshat Cloud Control Plane — Roadmap

Scope: `seshat-server` (the cloud control plane API) and `seshat-console` (its dedicated web admin frontend — not `seshat-ui`, which is desktop-only and never talks to `seshat-server` directly). For the broader SeshatOS product vision (agent runtime, Level 2/3/4, community/skills/MCP), see `GOAL.md` — this document is the tactical backlog for the two projects above, updated as work lands.

Related docs: `docs/casdoor-frontend-mapping.md` (frontend screen-by-screen build order), `deploy/README.md` (how to run the stack), `seshat-console/README.md`.

Last updated: 2026-07-09.

---

## Done

**`seshat-server` — control plane API**
- Full IAM: organizations, users, memberships, invitations, groups (real join table, not a JSON blob), dynamic per-org custom roles, policy bindings, sessions (self-service + admin), audit trail.
- Automation: devices, scheduled jobs, runs, device-claim protocol, stale-run reaping/sync, single-instance scheduler.
- LLM provider credentials, hybrid model: an organization can bring its own key (`ProviderSetting`), or fall back to a platform-wide default (`PlatformProviderSetting`) — the shape a paying-subscription org runs on without configuring anything itself.
- Superadmin model: `User.IsAdmin` grants full access to every organization with no membership required (verified — even permissions no org role has, like `organization.delete`). `CreateOrganization` no longer auto-attaches a platform admin as a member of what they provision (fixed 2026-07-09) — provisioning an org for a customer and founding your own are now correctly different actions.
- Full 2026-07-07/08/09 security + code-quality audit closed: no known open findings (see memory / PR #34 for detail — token-hash bypass, secret-prefix leak, duplication, in-memory pagination, group data model all fixed).
- `openapi.yaml`: every route documented, 0 structural lint errors.
- Deployment: `deploy/docker-compose.yml` (Postgres + seshat-server + seshat-console), `Dockerfile`s for both, `make deploy-up`/`deploy-down`/`deploy-logs`/`deploy-ps`.

**`seshat-console` — admin frontend**
- Stack: Vite + React + TypeScript + antd, API client fully generated from `openapi.yaml`, TanStack Query, zustand.
- Design system: deliberate palette (jade accent, dark sidebar as identity), real Dashboard/overview page, reusable `PageHeader`/`StatTile` components.
- Fully built: **Organizations** (list/search/sort/pagination + CRUD), **Platform → Default Providers** (LLM only).
- Scaffolded but placeholder: Users, Memberships, Invitations, Groups, Roles, Policy Bindings, Applications, Providers, Sessions, Devices, Jobs, Runs, Provider Settings (org-level), Audit Events, Platform → Image Generation, Platform → Web Search.

---

## Next — remaining console screens

Build order and Casdoor-reuse assessment per domain already worked out in `docs/casdoor-frontend-mapping.md`. Mechanical repetition of the pattern established by `organizations.ts` + `OrganizationsPage.tsx`:

1. Applications, Providers (Tier A — closest structural fit)
2. Users, Memberships, Invitations, Groups (Tier B)
3. Roles, Policy Bindings (Tier C — native, no Casdoor template)
4. Sessions, Audit Events
5. Devices, Jobs, Runs, Provider Settings (org-level) — fully native, no Casdoor equivalent

No backend work needed for any of these — the API already fully supports all of them.

---

## Direction: seshat-server becomes the multi-tenant backbone

Decided 2026-07-09: the platform is moving toward `seshat-server` as the multi-tenant cloud backend for everything, including file upload and knowledge/RAG — not just IAM and scheduled automation as today. `seshat-backend` (the existing local backend behind the desktop app) keeps working exactly as-is for the **local, single-user** case inside the desktop app; it is not being torn out. Once the multi-tenant surface (this knowledge/RAG work, and whatever follows it) is solid, the next phase is connecting `seshat-backend`/`seshat-ui` to `seshat-server` and replacing whichever local pieces make sense to replace with the cloud equivalent — not scoped in detail yet, revisit once the knowledge domain below is done.

## Knowledge base / RAG domain — first pre-built workflow (in progress, started 2026-07-09)

Picked as the first concrete pre-built workflow (see "Pre-built agentic workflows" below — this is workflow #2, the AI knowledge team / internal Q&A demo) precisely because the hard part already exists in the runtime, not because it's the easiest wedge on paper:

- `seshat/internal/rag` already has a complete `rag.Service` (`Ingest` + hybrid vector/BM25/reranker `Search`, namespaced by `corpus_id`), and the `rag_search`/`rag_ingest` tools are **already registered in every SDK client's tool registry** (`internal/tools/builtin/builtin.go`), gated by `IsEnabled() = RAGService != nil`. Nothing to build in the runtime itself.
- `automation.RunnerConfig` already has a proven precedent for wiring a tenant-scoped tool into cloud job execution: `WebSearchKeys map[string]string`, plumbed straight through to `sdk.ClientConfig` — adding an equivalent `RAGService` field is mechanical, not a new design.
- The embedder supports a plain OpenAI-compatible HTTP API (not just local Ollama) and the vector store has a `pgvector` backend — both fit directly into infrastructure `seshat-server` already runs (its own Postgres), no new infra component required.
- The real, only substantial piece of work is a **Corpus/knowledge domain in `seshat-server` itself**, which doesn't exist there at all today. `seshat-backend/internal/knowledge` (`Corpus`, `CorpusFile`, `KnowledgeIngestionJob`, single-instance polling ingestion worker, docling for PDF/DOCX/etc., search) is the direct blueprint — being adapted here as an **organization-scoped** equivalent (seshat-backend's version is per-user, single-tenant) rather than designed from scratch.

Build order:
1. **Done (2026-07-09).** Org-scoped `Corpus`/`CorpusFile`/`KnowledgeIngestionJob` domain in `seshat-server` (new `internal/server/knowledge` package): CRUD, multipart file upload via the runtime's `storage.ArtifactStore` (local disk or S3, config-driven — `SESHAT_SERVER_STORAGE_*`/`SESHAT_SERVER_S3_*` env vars, own namespace so it doesn't collide with a co-located seshat-backend/seshat-ui's storage config), async ingestion worker mirroring `automation.Scheduler`'s single-instance polling pattern (with idle backoff, closer to `seshat-backend`'s own knowledge runner). Two new permissions (`knowledge.read`/`knowledge.manage`) added to the catalog and to the owner/admin default roles — and, spotted while touching that list, `provider_settings.read`/`.manage` were missing from owner/admin too (a pre-existing gap from the earlier session), fixed in the same pass. `Ingest`/`Search` degrade gracefully with a clear "not configured" error until step 2 lands — verified end-to-end in tests using an in-memory vector store + a deterministic fake embedder (upload → auto-enqueue → process → ingested with chunks → search finds it). Routes under `/api/v1/knowledge/corpora/...`, documented in `openapi.yaml`. Binary-format ingestion (PDF/DOCX/audio via docling, which `seshat-backend` already wires up) is **not** ported yet — only plain-text/markdown/JSON/mostly-printable content extracts today; add docling once the demo needs it.
2. **Done (2026-07-09).** Platform-wide (+ org override) embedder configuration — `EmbedderSetting`/`PlatformEmbedderSetting`, same hybrid BYOK/platform-default shape as `PlatformProviderSetting`, but a **singleton** per organization (and one platform-wide), not a list — a corpus's vectors are all produced by whichever embedder was active at ingest time, so more than one active embedder per org risks silently mixing incompatible vector dimensions in the same namespace. Required a real refactor: `knowledge.Service` no longer holds one fixed `*rag.Service` — the embedder is resolved per call (org's own, else platform default) and a `rag.Service` is built ad hoc from the shared vector store (cheap, just a struct literal). The vector store itself is now real too: HNSW backend by default (embedded, no CGO, no external service, no bridging seshat-server's GORM connection into the runtime's own low-level DB handle — that bridging is what pgvector would need, deferred; HNSW just needs a directory, config via `SESHAT_SERVER_VECTOR_BACKEND`/`SESHAT_SERVER_VECTOR_HNSW_DIR`). Verified against a real running server: bootstrapped, set the platform embedder to point at a small local Python HTTP server mimicking the OpenAI embeddings API, uploaded a file over real HTTP, watched the ingestion worker pick it up and complete, then searched and got the file back — the full pipeline works for real, not just in unit tests. New endpoints `/api/v1/embedder-settings` (org) and `/api/v1/platform/embedder-settings`, both singleton GET/PUT(upsert)/DELETE, documented in `openapi.yaml`.
3. **Done (2026-07-09).** Wired `RAGService` through to cloud job execution. Required a small change in the `seshat` runtime itself (a separate git repo, vendored as a submodule at `seshat-ai/seshat`): added a `RAGService *rag.Service` field to `automation.RunnerConfig` (`internal/automation/runner.go`), mirroring the existing `WebSearchKeys` precedent exactly, plumbed straight to `sdk.ClientConfig.RAGService`. Committed locally in the submodule (commit `c98a7b0`, not pushed to the `nexus-engine` remote — the user's call, revisit before assuming it's shared/released) and the submodule pointer bumped in this repo. On the `seshat-server` side: `automation.Service` gained a `RAGResolver` interface (satisfied by `*knowledge.Service`, injected via `SetRAGResolver` in `app.go` after both services exist) so the `automation` package doesn't import `knowledge` directly — same "compose through an interface, don't couple bounded contexts" reasoning already used for `iam`. `executeCloudRun` now resolves a per-organization `RAGService` best-effort (a job with no embedder configured just runs without `rag_search` available, same as today — not a failure). The "cloud jobs are text-only" framing from earlier in this project is now more precisely "no local-machine access" — `rag_search`/`rag_ingest` are real tools a cloud job's prompt can ask the model to use, whenever an embedder is configured for that job's organization.
4. Console: a Knowledge/corpora page (create corpus, upload files, watch ingestion status), embedder-settings page (org + platform), and a corpus picker on job creation. **Next up.**
5. The actual demo: a `ScheduledJob` whose prompt instructs the model to use `rag_search` against a specific corpus and cite sources — the "AI knowledge team" flagship workflow, end to end. All the backend pieces now exist for this; what's missing is purely the console UI to configure it without hand-rolling API calls.

## Multi-modal provider config (image, audio, web search)

Today only LLM has a config domain (`ProviderSetting` per org + `PlatformProviderSetting` platform-wide fallback), matching `GOAL.md`'s Level 4 ambition (image generation, audio, eventually 3D). Extending the same hybrid model to the other modalities means, per modality:

- A new settings domain (e.g. `ImageProviderSetting`, `AudioProviderSetting`), org-scoped + platform-wide default, same encryption-at-rest / redaction pattern already proven for LLM.
- Execution wiring: today `automation.Runner` (absorbed from `seshat/pkg/automation`) only ever calls `session.SubmitMessage` — no tool is registered, so a cloud job cannot call an image/audio/web-search backend even if credentials existed. Wiring image/audio generation into a job means either registering real tools on the executor's SDK client, or a dedicated non-job code path (e.g. a direct "generate image" API endpoint outside the job/run model entirely). **This needs a design decision before implementation** — it changes the "cloud jobs are text-only, structurally" boundary that's currently deliberate, not accidental (see automation package memory notes).
- Web search specifically also needs a decision on provider choice/config shape — `seshat-backend` already has local env-var-based web search config (Tavily/Exa/Jina/SearXNG); whether `seshat-server` gets its own independent config or something shared/proxied through `seshat-backend` is undecided.
- Console: one page per modality, org-level + platform-level, following the same drawer/table pattern as the LLM provider settings pages already built.

**Open questions to resolve before starting:** which providers to support first per modality (e.g. one image backend to prove the pattern rather than all of Stable Diffusion/FLUX/DALL-E at once); whether cloud jobs gain tool access at all or this is a separate non-job API surface; whether these are billed/metered from day one or bundled in with the still-undecided subscription system below.

---

## Subscription / billing system

Explicitly deferred multiple times so far (audit: "billing/plan tiers by member count deferred as a separate unbuilt commerce feature"; Casdoor comparison: all commerce confirmed out-of-scope). It resurfaces now because the hybrid BYOK/platform-default provider model implies a real "pay Seshat, don't bring your own key" business model — this is the connective tissue between "superadmin configures defaults" and "customers pay to use them."

This is a large, separate subsystem that deserves its own scoping pass, not a bullet point implemented incidentally. Known shape, **not yet decided in detail**:

- Plan tiers (likely per-organization, possibly by member count and/or usage volume — precedent already noted in the self-serve org creation decision).
- Usage metering: tokens/requests against the platform-default provider credentials, per organization, per period.
- Quota enforcement: what happens when an org exceeds its plan (hard block vs. degrade vs. bill overage) — nothing built here yet, not even a counter.
- Payment provider integration (Stripe is the default assumption, unconfirmed) — subscription lifecycle (trialing/active/past_due/canceled), webhooks, invoicing.
- Whether BYOK organizations (bringing their own provider key) are exempt from usage billing entirely, or still pay a seat/platform fee — directly affects how "hybrid" the hybrid model really is commercially, not just technically.

**Recommended first step when this is picked up:** a dedicated design/planning pass (not a coding session) to answer the questions above before any schema or endpoint is written — this is exactly the kind of decision that's expensive to unwind once org data and billing history exist.

---

## Pre-built agentic workflows

Raised as a want (`create organizations/members... and pre-created agentic workflows`). Cross-checked against `website/src/pages/services/` (2026-07-09) — the marketing site already commits to three concrete flagship workflows, one per service wedge, each with a scripted terminal demo in `ServicesHero.tsx`. These are the natural first candidates for a real template catalog rather than starting from a blank page:

1. **Document processing → KYC/KYB file validation.** Demo: `ServicesHero.tsx`'s "Validate KYC file #2847" — OCR + extraction, identity-document validity check, address-proof freshness check, registry-extract age threshold, drafts a follow-up email when something's borderline, human approval before finalizing. Adjacent workflows in the same wedge per `ServicesGrid.tsx`: claims processing, contract review/extraction, compliance checks, HR file processing.
2. **AI knowledge team → internal policy/procedure Q&A.** Demo: "Answer new supplier policy questions" — hybrid retrieval over internal PDFs/procedures, source-cited answers, workspace access boundaries respected. Adjacent: support-ticket assistance, onboarding assistant.
3. **Back-office/finance → cash reconciliation.** Demo: "Close Q2 cash reconciliation" — matches bank exports against ERP records via accounting rules, generates a VAT summary, flags anomalies for operator confirmation, drafts the report. Adjacent: inbox/email triage and routing, approval workflows, escalation and response prep.

**Mismatch found and resolved (direction only — not built yet):** `Process.tsx` (the site's own "Delivery model" section) describes today's actual engagement model as bespoke and consulting-led — "Scope the workflow → Design the pilot team → Implement and review → Deploy or expand" — not self-serve template-picking. So "pre-built workflows" could have meant either an internal accelerator for the delivery team, or a self-serve catalog for customers. Asked the user directly (2026-07-09); decision: **build both, from one system, not two** — explicitly not now, but this is the shape to build when it's picked up:

- **One `WorkflowTemplate` domain**, curated by the platform admin exactly like `PlatformProviderSetting` today (superadmin authors/edits templates; no separate org-authored templates for v1).
- **One catalog UI in `seshat-console`**, gated per-organization by a `required_plan`/`visibility` field on the template, not by a separate internal-only surface. The delivery team instantiates from the same catalog to scope a new client pilot quickly (logged in as platform admin, or as a temporary member of the client's org); the client keeps using the identical catalog afterward, self-serve, with only the templates their plan entitles them to shown as instantiable.
- **Rationale for one system over two:** an internal-only library and a customer-facing catalog map to the same underlying idea (a good job configuration, reusable) — maintaining them separately guarantees drift. Gating by plan is also the natural on-ramp for turning a free-tier KYC/reconciliation/Q&A demo into a paid feature, which ties directly into the still-undecided subscription system above rather than being invented separately.
- Still open when this is picked up: whether instantiating a template just pre-fills the create-job form or also tracks drift from the template it came from; whether templates get their own `seshat-server` domain from day one or start as a static catalog shipped with `seshat-console` for a simpler first cut.

---

## Smaller known follow-ups

- `seshat-console`'s production bundle is ~1.2MB (mostly antd) — fine today at 2 built pages, worth revisiting with route-based code-splitting once most of the 16 domains are real pages.
- `deploy/docker-compose.yml` has no TLS termination — fine for local testing, needs a real reverse proxy in front for anything else.
- `seshat-server`'s scheduler is single-instance only by design (no row-locking across replicas yet) — revisit if/when the control plane needs to scale past one process.
- GitHub branch protection on `main` is blocked by the repo's current plan (org-owned private repo needs GitHub Team or the repo made public) — needs an explicit decision, not a technical fix.
