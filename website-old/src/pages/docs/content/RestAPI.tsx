import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocOnPageNav from './DocOnPageNav'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './LearnArticle.module.css'
import { LearnNodeCard } from './LearnShared'

type NavItem = {
  id: string
  label: string
}

type FamilyRow = {
  family: string
  basePath: string
  auth: string
  purpose: string
}

type EventRow = {
  event: string
  payload: string
  meaning: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'surfaces', label: 'API Surfaces' },
  { id: 'auth', label: 'Auth Model' },
  { id: 'streaming', label: 'Streaming & SSE' },
  { id: 'catalog', label: 'Endpoint Catalog' },
  { id: 'compat', label: 'Anthropic Compatibility' },
  { id: 'ops', label: 'Operational Notes' },
]

const FAMILY_ROWS: FamilyRow[] = [
  {
    family: 'Health & metrics',
    basePath: '/health, /metrics, /api/v1/metrics',
    auth: 'Public for /health and top-level /metrics',
    purpose: 'Basic liveness plus Prometheus or JSON metrics snapshots.',
  },
  {
    family: 'Native query runtime',
    basePath: '/api/v1/query, /api/v1/query/stream',
    auth: 'Bearer JWT or sk-* API key',
    purpose: 'Run the full Seshat agent loop through the backend with sessions, permissions, agent profiles, RAG, files, and runtime events.',
  },
  {
    family: 'Session management',
    basePath: '/api/v1/sessions, /api/v1/sessions/{id}',
    auth: 'Bearer JWT or sk-* API key',
    purpose: 'Create, list, update, delete, search, interrupt, and inspect persisted agent sessions.',
  },
  {
    family: 'Auth & identity',
    basePath: '/api/v1/auth/*, /api/v1/users/*, /api/v1/groups/*, /api/v1/organizations/*, /api/v1/workspaces/*',
    auth: 'Mixed: login/register public, most others authenticated',
    purpose: 'Users, roles, memberships, organizations, workspaces, API keys, and user preferences.',
  },
  {
    family: 'Provider settings',
    basePath: '/api/v1/settings/providers/*, /api/v1/settings/embedder, /api/v1/settings/storage',
    auth: 'Bearer JWT or sk-* API key',
    purpose: 'Manage provider credentials, OAuth flows, default models, custom model catalogs, embedder config, and storage config.',
  },
  {
    family: 'Knowledge & files',
    basePath: '/api/v1/files/*, /api/v1/corpora/*, /api/v1/memories/*',
    auth: 'Bearer JWT or sk-* API key',
    purpose: 'Upload files, build corpora, run ingestion jobs, search corpora, and manage extracted long-term memory.',
  },
  {
    family: 'Planning & automation',
    basePath: '/api/v1/plans/*, /api/v1/scheduler/jobs/*',
    auth: 'Bearer JWT or sk-* API key',
    purpose: 'Read plan-mode artifacts and create cron-like scheduled agent runs.',
  },
  {
    family: 'Extensions & admin',
    basePath: '/api/v1/skills/*, /api/v1/mcp/*, /api/v1/web/search/*, /api/v1/audit/logs, /api/v1/quotas',
    auth: 'Mixed, with some admin-only routes',
    purpose: 'Skills, MCP configuration, web-search settings, audit access, and quota visibility.',
  },
  {
    family: 'Anthropic-compatible layer',
    basePath: '/v1/messages',
    auth: 'x-api-key or Authorization: Bearer',
    purpose: 'Expose the backend as a Claude-compatible Messages API while still executing the full Seshat runtime server-side.',
  },
]

const SSE_ROWS: EventRow[] = [
  {
    event: 'default data event',
    payload: 'sdk.ResponseChunk JSON',
    meaning: 'Incremental response chunks from the underlying runtime stream.',
  },
  {
    event: 'runtime',
    payload: 'sdk.RuntimeEvent JSON',
    meaning: 'Structured engine events such as tool progress, permission requests, prompt requests, and other runtime-side state changes.',
  },
  {
    event: 'done',
    payload: 'queryResponse JSON',
    meaning: 'Final summarized response envelope with content, usage, stop reason, tool uses, tool results, and any RAG results.',
  },
  {
    event: 'error',
    payload: '{"error":"..."}',
    meaning: 'Terminal stream error after the SSE connection has already been established.',
  },
]

const LOGIN_EXAMPLE = `curl -X POST http://localhost:8090/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@example.com",
    "password": "secret"
  }'`

const QUERY_STREAM_EXAMPLE = `curl -N -X POST http://localhost:8090/api/v1/query/stream \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Inspect the attached corpus and summarize the key risks.",
    "session_id": "sess_123",
    "corpus_id": "corp_456",
    "agent_slug": "risk-analyst"
  }'`

const ANTHROPIC_EXAMPLE = `curl -N -X POST http://localhost:8090/v1/messages \
  -H 'x-api-key: <seshat-api-key>' \
  -H 'x-seshat-session-id: sess_123' \
  -H 'x-seshat-provider-setting-id: pset_456' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "anthropic:claude-sonnet-4-20250514",
    "max_tokens": 2048,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Review the project status and propose next actions."}
    ]
  }'`

function FamilyTable({ rows }: { rows: FamilyRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Family</th>
          <th>Base Path</th>
          <th>Auth</th>
          <th>Purpose</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.family}>
            <td className={styles.codeCell}>{row.family}</td>
            <td className={styles.codeCell}>{row.basePath}</td>
            <td>{row.auth}</td>
            <td className={styles.noteCell}>{row.purpose}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function EventTable({ rows }: { rows: EventRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>SSE Event</th>
          <th>Payload</th>
          <th>Meaning</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.event}>
            <td className={styles.codeCell}>{row.event}</td>
            <td className={styles.codeCell}>{row.payload}</td>
            <td className={styles.noteCell}>{row.meaning}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function RestArchitectureDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.topGrid}>
        <LearnNodeCard eyebrow="Transport" icon="server" tone="host" title="cmd/api + internal/api" body="HTTP router, middleware, auth, SSE framing, request size limits, panic recovery, and route registration." />
        <LearnNodeCard eyebrow="Execution" icon="cpu" tone="runtime" title="seshat-ai backend services" body="Auth, query, settings, knowledge, scheduler, resources, and the runtime adapter that calls the public Go SDK from seshat." />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>Two Public Faces</span>
        </div>
        <strong className={styles.nodeTitle}>The REST server exposes both a native Seshat API and an Anthropic-compatible compatibility layer</strong>
        <p className={styles.nodeBody}>
          Use <span className={articleStyles.inlineCode}>/api/v1/*</span> when you want the full backend semantics. Use <span className={articleStyles.inlineCode}>/v1/messages</span> when you want Claude-compatible clients to talk to Seshat while the server still executes tools, permissions, memory, and sessions on your behalf.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchGrid}>
        <LearnNodeCard eyebrow="Native surface" icon="network" tone="runtime" title="/api/v1/query and /api/v1/query/stream" body="Rich request body, native session lifecycle, prompt and permission brokers, runtime events, and backend-specific resources like corpora or scheduled jobs." />
        <LearnNodeCard eyebrow="Compat surface" icon="route" tone="host" title="/v1/messages" body="Anthropic request and streaming shapes, x-api-key auth, and optional Seshat extension headers for session continuity and provider-setting override." />
        <LearnNodeCard eyebrow="Operational surface" icon="shield" tone="risk" title="/health, /metrics, middleware" body="Request IDs, recover middleware, 4 MB body limits, optional CORS, rate limiting, and long-lived SSE-safe timeouts." />
      </div>
    </div>
  )
}

export default function RestAPI() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk">SDK and API</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>REST API</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>REST API</h1>
        <p className={articleStyles.sub}>
          Yes, the REST API belongs to <span className={articleStyles.inlineCode}>seshat-ai</span>, not to the open-source runtime repository alone. It is the HTTP product and integration layer on top of the Seshat Go runtime: users, workspaces, sessions, provider settings, files, corpora, memories, scheduler jobs, audit-aware auth, and two query surfaces, one native and one Anthropic-compatible.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                The REST server is implemented in <span className={articleStyles.inlineCode}>seshat-ai/cmd/api</span> and <span className={articleStyles.inlineCode}>seshat-ai/internal/api</span>. The API layer stays thin on purpose: middleware, auth, route registration, JSON bodies, SSE framing, and error mapping live there, while the real business and runtime logic lives in backend domain services and the Seshat SDK adapter.
              </p>
              <RestArchitectureDiagram />
            </div>
          </section>

          <section className={styles.anchorSection} id="surfaces">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>The Two REST Surfaces</h2>
              <div className={styles.dualGrid}>
                <LearnNodeCard eyebrow="Full backend API" icon="cpu" tone="runtime" title="/api/v1/*" body="The native HTTP surface for Seshat-aware clients. It exposes sessions, query runtime, files, corpora, provider settings, auth, scheduler jobs, plans, memories, and admin-ish surfaces like MCP or skills management." />
                <LearnNodeCard eyebrow="Compatibility layer" icon="route" tone="host" title="/v1/messages" body="An Anthropic Messages API compatible facade. Claude-style clients can talk to Seshat through this path while the server still owns tools, memory, permissions, sessions, and provider routing." />
              </div>
              <div className={articleStyles.callout}>
                <div className={articleStyles.calloutTitle}>When To Use Which</div>
                <p className={articleStyles.calloutText}>
                  Choose <span className={articleStyles.inlineCode}>/api/v1/*</span> for product integration, workspace features, or anything Seshat-specific. Choose <span className={articleStyles.inlineCode}>/v1/messages</span> when you want drop-in Claude-compatible client behavior and do not need the whole native backend contract.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="auth">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Authentication Model</h2>
              <p className={styles.sectionLead}>
                The native API uses bearer auth for most protected routes, and the backend accepts both JWTs and Seshat API keys with the <span className={articleStyles.inlineCode}>sk-</span> prefix. The Anthropic-compatible path additionally accepts the native <span className={articleStyles.inlineCode}>x-api-key</span> header because that is what Claude SDK clients expect.
              </p>
              <ul className={articleStyles.list}>
                <li><span className={articleStyles.inlineCode}>POST /api/v1/auth/login</span> and <span className={articleStyles.inlineCode}>POST /api/v1/auth/register</span> are public entry points.</li>
                <li>Most <span className={articleStyles.inlineCode}>/api/v1/*</span> routes require <span className={articleStyles.inlineCode}>Authorization: Bearer ...</span>.</li>
                <li>The auth middleware resolves either a JWT principal or an API-key principal depending on the token format.</li>
                <li>Some routes are admin-only through role checks, notably parts of MCP and skill repository management.</li>
              </ul>
              <DocCodeBlock code={LOGIN_EXAMPLE} label="Login" language="bash" />
            </div>
          </section>

          <section className={styles.anchorSection} id="streaming">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Streaming, Permissions, And SSE</h2>
              <p className={styles.sectionLead}>
                The native stream endpoint is <span className={articleStyles.inlineCode}>POST /api/v1/query/stream</span>. It returns Server-Sent Events and stays open across long-running agent turns. The API sets <span className={articleStyles.inlineCode}>X-SSE-Version: 1</span>, sends keepalive comments, and emits structured runtime events alongside text chunks.
              </p>
              <EventTable rows={SSE_ROWS} />
              <DocCodeBlock code={QUERY_STREAM_EXAMPLE} label="Native query stream" language="bash" />
              <p className={articleStyles.p}>
                One important backend-specific feature is that permission requests and non-confirm prompts are bridged through SSE. That means web or desktop clients can stay connected to one stream and still react to runtime permission gates without reimplementing the loop themselves.
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="catalog">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Endpoint Catalog</h2>
              <p className={styles.sectionLead}>
                The router in <span className={articleStyles.inlineCode}>internal/api/routes.go</span> currently groups the backend into the following main families.
              </p>
              <FamilyTable rows={FAMILY_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="compat">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Anthropic-Compatible Messages API</h2>
              <p className={styles.sectionLead}>
                The compatibility layer exists so existing Claude-oriented clients can point their base URL at Seshat and still use the backend as the execution engine. The request format is Anthropic-style, but the actual tool use, permissions, memory, and provider routing remain server-side in Seshat.
              </p>
              <ul className={articleStyles.list}>
                <li>The compatible path is <span className={articleStyles.inlineCode}>POST /v1/messages</span>.</li>
                <li>It accepts either <span className={articleStyles.inlineCode}>x-api-key</span> or <span className={articleStyles.inlineCode}>Authorization: Bearer</span>.</li>
                <li><span className={articleStyles.inlineCode}>x-seshat-session-id</span> binds the request to an existing backend session for multi-turn continuity.</li>
                <li><span className={articleStyles.inlineCode}>x-seshat-provider-setting-id</span> lets the client override which provider setting the backend should use.</li>
                <li>Runtime events are intentionally not forwarded in Anthropic mode because the protocol has no equivalent for Seshat-specific tool progress or permission events.</li>
              </ul>
              <DocCodeBlock code={ANTHROPIC_EXAMPLE} label="Anthropic-compatible request" language="bash" />
              <p className={articleStyles.p}>
                If you want the protobuf-first alternative instead of HTTP compatibility, continue with{' '}
                <Link className={articleStyles.link} to="/docs/sdk/grpc-api" state={{ from: location.pathname }}>
                  gRPC API
                </Link>
                .
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="ops">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Operational Notes</h2>
              <p className={styles.sectionLead}>
                The HTTP server configuration is intentionally SSE-friendly. The backend disables global write timeout for the API server, enables optional localhost-oriented CORS in debug mode, assigns request IDs, caps most JSON bodies to 4 MB, and treats panic recovery as transport middleware rather than app logic.
              </p>
              <div className={styles.metricGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Default port</div>
                  <div className={styles.metricValue}>8090</div>
                  <p className={styles.metricText}>Set in the API config assembled by <span className={articleStyles.inlineCode}>cmd/api/config.go</span>.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Write timeout</div>
                  <div className={styles.metricValue}>0</div>
                  <p className={styles.metricText}>Disabled globally because SSE responses may stay open for minutes.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Body limit</div>
                  <div className={styles.metricValue}>4 MB</div>
                  <p className={styles.metricText}>Applied through middleware for most routes, excluding stream-like or file-oriented paths.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>CORS</div>
                  <div className={styles.metricValue}>Debug-only by default</div>
                  <p className={styles.metricText}>Without an allowlist, it defaults to localhost origins rather than broad production exposure.</p>
                </div>
              </div>
              <p className={articleStyles.p}>
                For the backend package map behind this API, see [architecture.md](/home/amiche/Projects/AI/ai/seshat-ai/docs/architecture.md:1). For the runtime side it calls into, see{' '}
                <Link className={articleStyles.link} to="/docs/concepts/mono-run" state={{ from: location.pathname }}>
                  Mono-Run Architecture
                </Link>
                .
              </p>
            </div>
          </section>
        </div>

        <aside className={styles.aside}>
          <DocOnPageNav items={ON_PAGE} />
        </aside>
      </div>
    </article>
  )
}
