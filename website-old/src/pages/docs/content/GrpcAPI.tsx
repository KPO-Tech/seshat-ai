import { Link } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocOnPageNav from './DocOnPageNav'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './GrpcAPIDocs.module.css'

type NavItem = {
  id: string
  label: string
}

type TableRow = {
  name: string
  type?: string
  behavior?: string
  notes: string
  status?: 'live' | 'gap'
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'start-server', label: 'Start Server' },
  { id: 'server-config', label: 'Server Config' },
  { id: 'service-contract', label: 'Service Contract' },
  { id: 'query-unary', label: 'Unary Query' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'auxiliary-rpcs', label: 'Skills, MCP, Models' },
  { id: 'client-usage', label: 'Client Usage' },
  { id: 'codegen', label: 'Codegen & Regeneration' },
  { id: 'extend', label: 'How To Extend' },
  { id: 'gaps', label: 'Current Gaps' },
]

const SERVICE_ROWS: TableRow[] = [
  {
    name: 'Query',
    type: 'Unary',
    behavior: 'One request, one final response.',
    notes: 'Creates or loads a runtime session, executes one turn, then returns the final assistant text plus usage.',
    status: 'live',
  },
  {
    name: 'QueryStream',
    type: 'Server streaming',
    behavior: 'Streams chunks, runtime events, then a final response.',
    notes: 'Best surface for live UIs, logs, or other language SDKs that want incremental output.',
    status: 'live',
  },
  {
    name: 'ListSkills',
    type: 'Unary',
    behavior: 'Lists discovered skills.',
    notes: 'Supports source filtering with `all`, `bundled`, `file`, or `mcp`.',
    status: 'live',
  },
  {
    name: 'GetSkillDetails',
    type: 'Unary',
    behavior: 'Returns skill metadata for one skill.',
    notes: 'Currently returns the `Skill` metadata only; the `prompt` field in the proto is not populated yet.',
    status: 'live',
  },
  {
    name: 'ListMCP',
    type: 'Unary',
    behavior: 'Lists MCP server statuses.',
    notes: 'Returns server name, status, tool count, and last error.',
    status: 'live',
  },
  {
    name: 'ConnectMCP',
    type: 'Unary',
    behavior: 'Registers then reconnects an MCP server.',
    notes: 'Supports `stdio`, `http`, `sse`, and `ws`/`websocket`.',
    status: 'live',
  },
  {
    name: 'DisconnectMCP',
    type: 'Unary',
    behavior: 'Disconnects one MCP server.',
    notes: 'Only disconnects by name; useful for runtime-controlled extension management.',
    status: 'live',
  },
  {
    name: 'GetModels',
    type: 'Unary',
    behavior: 'Lists models from the provider registry.',
    notes: 'This is registry-driven, not only “currently configured” models.',
    status: 'live',
  },
  {
    name: 'HealthCheck',
    type: 'Unary',
    behavior: 'Returns status, version, and uptime.',
    notes: 'Current implementation is shallow: it does not re-check downstream providers or storage on every call.',
    status: 'live',
  },
  {
    name: 'FileService',
    type: 'Service declared in proto',
    behavior: 'Read/write/edit/glob/grep surface.',
    notes: 'Declared in `seshat.proto` but not implemented or registered in `cmd/grpc`.',
    status: 'gap',
  },
  {
    name: 'SystemService',
    type: 'Service declared in proto',
    behavior: 'Bash + system info surface.',
    notes: 'Declared in `seshat.proto` but not implemented or registered in `cmd/grpc`.',
    status: 'gap',
  },
]

const REQUEST_ROWS: TableRow[] = [
  {
    name: 'prompt',
    notes: 'Required. Empty prompts are rejected with `InvalidArgument`.',
  },
  {
    name: 'model',
    notes: 'Optional. Best practice is `provider:model`, for example `anthropic:claude-sonnet-4-20250514` or `codex:gpt-5.3-codex`.',
  },
  {
    name: 'tools',
    notes: 'Optional allowlist. If you pass tools, every other currently-registered tool is unregistered for that session. Unknown tool names return `InvalidArgument`.',
  },
  {
    name: 'stream',
    notes: 'Declared in the proto but currently not used by `cmd/grpc`. In practice, you choose streaming by calling `QueryStream` instead of `Query`.',
  },
  {
    name: 'context_id',
    notes: 'Optional persisted session id. If present, the server loads the existing session instead of creating a new one. The returned `conversation_id` is that session id.',
  },
  {
    name: 'temperature',
    notes: 'Declared in the proto but currently not wired into `buildSDKClientConfig`. It is a real contract gap today.',
  },
  {
    name: 'max_tokens',
    notes: 'Wired. Overrides host config max output tokens when greater than zero.',
  },
  {
    name: 'api_key',
    notes: 'Per-request credential override. Useful for direct API-key injection and especially for bearer-style Codex / OAuth handoff over gRPC.',
  },
]

const STREAM_ROWS: TableRow[] = [
  {
    name: 'chunk',
    notes: 'Carries incremental assistant text in `content` and a structured `chunk` object with `type`, `delta_type`, and `delta`.',
  },
  {
    name: 'runtime_event',
    notes: 'Carries structured engine events such as turn start, tool progress, stop reason, token usage snapshots, and tool metadata.',
  },
  {
    name: 'final',
    notes: 'Carries the final assistant text, `conversation_id`, `stopped`, and final token usage totals.',
  },
]

const GRPC_ENV_ROWS: TableRow[] = [
  {
    name: 'SESHAT_GRPC_PORT',
    notes: 'Listening port. Default: `50051`.',
  },
  {
    name: 'SESHAT_GRPC_MAX_CONCURRENT_RPCS',
    notes: 'Mapped to `grpc.MaxConcurrentStreams`. Default: `10`.',
  },
  {
    name: 'SESHAT_GRPC_KEEPALIVE_TIME',
    notes: 'Parsed as a Go duration and used for keepalive enforcement. Default: `30s`.',
  },
  {
    name: 'SESHAT_GRPC_ENABLE_REFLECTION',
    notes: 'Enables gRPC reflection for tools like `grpcurl` without passing the proto explicitly. Default: disabled.',
  },
  {
    name: 'SESHAT_VERSION',
    notes: 'Returned by `HealthCheck` as the server version string.',
  },
]

const HOST_ENV_ROWS: TableRow[] = [
  {
    name: 'SESHAT_MODEL',
    notes: 'Default model when the request does not specify one.',
  },
  {
    name: 'SESHAT_CWD',
    notes: 'Working directory inherited by the runtime sessions created behind gRPC.',
  },
  {
    name: 'SESHAT_DB_PATH',
    notes: 'Base runtime SQLite path. Also becomes the default session DB path when `SESHAT_SESSION_DB_PATH` is not set.',
  },
  {
    name: 'SESHAT_SESSION_DB_PATH',
    notes: 'Persistent session store used for `context_id` resume flows.',
  },
  {
    name: 'SESHAT_PROVIDER_BASE_URL',
    notes: 'Useful for provider-compatible gateways or custom endpoints.',
  },
  {
    name: 'SESHAT_STORAGE_PROVIDER + SESHAT_STORAGE_*',
    notes: 'Object storage backend configuration reused by the embedded runtime.',
  },
  {
    name: 'SESHAT_BROWSER_REMOTE_CONTROL_URL / SESHAT_BROWSER_EXECUTABLE_PATH',
    notes: 'Browser runtime settings reused if browser tools are available in the session surface.',
  },
  {
    name: 'Provider keys',
    notes: 'The server reuses the same provider env resolution as the CLI and Go SDK, for example `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN`, and others.',
  },
]

const LIVE_QUERY = `ANTHROPIC_API_KEY=sk-ant-... \
SESHAT_MODEL=anthropic:claude-sonnet-4-20250514 \
go run ./cmd/grpc`

const BUILT_SERVER = `make build-grpc
SESHAT_GRPC_ENABLE_REFLECTION=true ./bin/seshat-grpc`

const GRPCURL_QUERY = `grpcurl \
  -plaintext \
  -import-path pkg/grpc/proto \
  -proto seshat.proto \
  -d '{
    "prompt": "Audit this repository and summarize the biggest risks.",
    "model": "anthropic:claude-sonnet-4-20250514",
    "tools": ["read_file", "grep", "glob"],
    "max_tokens": 1800
  }' \
  localhost:50051 \
  seshat.SeshatService/Query`

const GRPCURL_RESUME = `grpcurl \
  -plaintext \
  -import-path pkg/grpc/proto \
  -proto seshat.proto \
  -d '{
    "prompt": "Continue from the previous analysis and propose a patch plan.",
    "context_id": "sess-42"
  }' \
  localhost:50051 \
  seshat.SeshatService/Query`

const GRPCURL_STREAM = `grpcurl \
  -plaintext \
  -import-path pkg/grpc/proto \
  -proto seshat.proto \
  -d '{
    "prompt": "Inspect the project and stream your findings step by step.",
    "model": "anthropic:claude-sonnet-4-20250514"
  }' \
  localhost:50051 \
  seshat.SeshatService/QueryStream`

const GRPCURL_AUX = `# reflection mode if enabled
grpcurl -plaintext localhost:50051 list

grpcurl -plaintext -import-path pkg/grpc/proto -proto seshat.proto \
  -d '{"source_filter":"all"}' localhost:50051 seshat.SeshatService/ListSkills

grpcurl -plaintext -import-path pkg/grpc/proto -proto seshat.proto \
  -d '{}' localhost:50051 seshat.SeshatService/GetModels

grpcurl -plaintext -import-path pkg/grpc/proto -proto seshat.proto \
  -d '{"name":"github","type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"]}' \
  localhost:50051 seshat.SeshatService/ConnectMCP

grpcurl -plaintext -import-path pkg/grpc/proto -proto seshat.proto \
  -d '{}' localhost:50051 seshat.SeshatService/HealthCheck`

const GO_CLIENT = `conn, err := grpc.Dial(
    "localhost:50051",
    grpc.WithTransportCredentials(insecure.NewCredentials()),
)
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

client := pb.NewSeshatServiceClient(conn)

resp, err := client.Query(ctx, &pb.QueryRequest{
    Prompt: "Review this repository and propose a refactor plan.",
    Model:  "anthropic:claude-sonnet-4-20250514",
    Tools:  []string{"read_file", "grep", "glob"},
})
if err != nil {
    log.Fatal(err)
}

fmt.Println(resp.Content)
fmt.Println(resp.ConversationId)
fmt.Println(resp.TokenUsage.TotalTokens)`

const PYTHON_PROTOC = `python -m grpc_tools.protoc \
  -I pkg/grpc/proto \
  --python_out=./gen \
  --grpc_python_out=./gen \
  pkg/grpc/proto/seshat.proto`

const PYTHON_CLIENT = `import grpc
from gen import seshat_pb2, seshat_pb2_grpc

channel = grpc.insecure_channel("localhost:50051")
client = seshat_pb2_grpc.SeshatServiceStub(channel)

resp = client.Query(
    seshat_pb2.QueryRequest(
        prompt="Summarize this project architecture.",
        model="anthropic:claude-sonnet-4-20250514",
        max_tokens=1200,
    )
)
print(resp.content)
print(resp.conversation_id)

stream = client.QueryStream(
    seshat_pb2.QueryRequest(
        prompt="Stream a code review of this repository.",
        context_id=resp.conversation_id,
    )
)
for item in stream:
    if item.item_type == "chunk":
        print(item.content, end="", flush=True)
    elif item.item_type == "runtime_event":
        print(f"\\n[event] {item.runtime_event.type} {item.runtime_event.tool_name}")
    elif item.item_type == "final":
        print(f"\\nfinal tokens={item.token_usage.total_tokens}")`

const NODE_PROTOC = `# Node / JS stub generation example
npx grpc_tools_node_protoc \
  --proto_path=pkg/grpc/proto \
  --js_out=import_style=commonjs,binary:./gen \
  --grpc_out=grpc_js:./gen \
  pkg/grpc/proto/seshat.proto`

const GO_PROTOC = `PATH="$HOME/.local/bin:$(go env GOPATH)/bin:$PATH" \
protoc \
  --proto_path=pkg/grpc/proto \
  --go_out=. \
  --go_opt=module=github.com/KPO-Tech/seshat \
  --go-grpc_out=. \
  --go-grpc_opt=module=github.com/KPO-Tech/seshat \
  pkg/grpc/proto/seshat.proto`

const REGISTER_EXTRA_SERVICE = `type FileServer struct {
    pb.UnimplementedFileServiceServer
}

func (s *FileServer) Read(ctx context.Context, req *pb.FileReadRequest) (*pb.FileReadResponse, error) {
    // map request to the runtime or filesystem layer here
    return &pb.FileReadResponse{Content: "..."}, nil
}

grpcServer := grpc.NewServer(...)
pb.RegisterSeshatServiceServer(grpcServer, NewSeshatServer(hostConfig))
pb.RegisterFileServiceServer(grpcServer, &FileServer{})`

const GAP_ROWS: TableRow[] = [
  {
    name: 'Proto naming drift in older docs',
    notes: 'Some repository docs still mention `nexus.proto` or `nexus.NexusService`. The current contract is `pkg/grpc/proto/seshat.proto` and `/seshat.SeshatService/...`.',
  },
  {
    name: 'Interactive permissions',
    notes: '`cmd/grpc` forces `sdk.PermissionModeNever`. The surface is intentionally headless and does not provide an approval handshake like the CLI app or a custom host UI could.',
  },
  {
    name: 'Request temperature',
    notes: '`QueryRequest.temperature` exists in the proto but is not mapped into `buildSDKClientConfig` yet.',
  },
  {
    name: 'Request stream flag',
    notes: '`QueryRequest.stream` is currently redundant. Streaming is selected by calling `QueryStream`.',
  },
  {
    name: 'GetSkillDetails.prompt',
    notes: 'The proto suggests prompt content can be returned, but the current server only returns skill metadata.',
  },
  {
    name: 'FileService and SystemService',
    notes: 'Declared in the proto, generated in stubs, but not implemented or registered in `cmd/grpc`.',
  },
  {
    name: 'Health depth',
    notes: '`HealthCheck` returns `ok`, version, and uptime; it does not perform a live provider/storage readiness probe per request.',
  },
  {
    name: 'Transport security',
    notes: 'No built-in auth layer and no TLS configuration. Treat it as local or trusted-network infrastructure unless you place it behind your own secure boundary.',
  },
]

function StatusBadge({ status }: { status?: 'live' | 'gap' }) {
  if (status === 'gap') {
    return <span className={styles.statusGap}>Proto only</span>
  }
  if (status === 'live') {
    return <span className={styles.statusLive}>Implemented</span>
  }
  return null
}

function SectionTable({ rows, showType = false, showBehavior = false }: { rows: TableRow[]; showType?: boolean; showBehavior?: boolean }) {
  return (
    <DocTable variant="dense">
      <thead>
        <tr>
          <th>Name</th>
          {showType ? <th>Type</th> : null}
          {showBehavior ? <th>Behavior</th> : null}
          <th>Notes</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.name}>
            <td className={styles.codeCell}>{row.name}</td>
            {showType ? <td>{row.type ?? '—'}</td> : null}
            {showBehavior ? <td>{row.behavior ?? '—'}</td> : null}
            <td className={styles.noteCell}>{row.notes}</td>
            <td>{row.status ? <StatusBadge status={row.status} /> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function GrpcAPI() {
  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk">SDK and API</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>gRPC API</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>gRPC API</h1>
        <p className={articleStyles.sub}>
          The gRPC server is Seshat&apos;s process boundary for other languages, remote orchestration, and service-to-service runtime access. This page documents the real contract as implemented today: the proto, the server behavior, session semantics, streaming protocol, code generation, extension path, and current gaps that still need to be completed.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section id="overview" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Overview</h2>
            <p className={styles.sectionLead}>
              Seshat currently has three core runtime entry points: the CLI app, the embedded Go SDK, and `cmd/grpc`. The Go SDK is the native same-process integration for Go hosts. gRPC is the network or language boundary when your host is not Go, when you want a separate runtime service, or when a future official SDK for Python, JS, Rust, Java, or another language needs a transport contract first.
            </p>
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Naming note</div>
              <p className={articleStyles.calloutText}>
                Some older repository docs still mention `nexus.proto` and `nexus.NexusService`. The current source of truth is `pkg/grpc/proto/seshat.proto`, package `seshat`, service `SeshatService`, with method paths such as <span className={articleStyles.inlineCode}>/seshat.SeshatService/Query</span>.
              </p>
            </div>
            <div className={styles.dualGrid}>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Use gRPC when</div>
                <p className={articleStyles.cardBody}>Your host language is not Go, you want to keep the runtime in a separate process, or you need a stable transport contract for polyglot clients.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Use Go SDK when</div>
                <p className={articleStyles.cardBody}>Your host is Go and you want full in-process control over sessions, providers, prompt layers, tools, permissions, hooks, and event handling.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Security posture</div>
                <p className={articleStyles.cardBody}>`cmd/grpc` has no authentication layer of its own. Treat it as local or trusted-network infrastructure, or put it behind your own auth, TLS, and policy boundary.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Runtime behavior</div>
                <p className={articleStyles.cardBody}>Behind gRPC, the server still builds a real `sdk.Client`, creates or loads persistent sessions, streams runtime events, and uses the same provider registry and tool system as the other entry points.</p>
              </div>
            </div>
          </section>

          <section id="start-server" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Start Server</h2>
            <p className={styles.sectionLead}>
              The entry point is `cmd/grpc`. By default it listens on `:50051` and builds the runtime host config from the same config loader used elsewhere in Seshat.
            </p>
            <DocCodeBlock code={LIVE_QUERY} label="Development" language="bash" />
            <DocCodeBlock code={BUILT_SERVER} label="Built binary" language="bash" />
            <ul className={articleStyles.list}>
              <li>The server registers `SeshatService` only.</li>
              <li>Reflection is disabled by default and must be enabled explicitly.</li>
              <li>Shutdown is graceful on `SIGINT` and `SIGTERM`.</li>
            </ul>
          </section>

          <section id="server-config" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Server Config</h2>
            <p className={styles.sectionLead}>
              There are two config layers to understand. First, the gRPC server has its own transport-level env vars. Second, it inherits the shared runtime host config from `pkg/config`, which controls the model default, session persistence, working directory, provider credentials, storage, browser settings, and more.
            </p>
            <h3 className={articleStyles.h3}>gRPC-specific environment</h3>
            <SectionTable rows={GRPC_ENV_ROWS} />
            <h3 className={articleStyles.h3}>Shared runtime environment reused by gRPC</h3>
            <SectionTable rows={HOST_ENV_ROWS} />
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Headless by design</div>
              <p className={articleStyles.calloutText}>
                `cmd/grpc` forces <span className={articleStyles.inlineCode}>sdk.PermissionModeNever</span>. That means the gRPC surface does not open interactive approval prompts. If you need interactive permissions, build your own host experience on top of the Go SDK instead of relying on the stock gRPC server.
              </p>
            </div>
          </section>

          <section id="service-contract" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Service Contract</h2>
            <p className={styles.sectionLead}>
              The current proto defines more than what `cmd/grpc` actually exposes. This table separates the live `SeshatService` surface from the proto-only services that still need implementation and server registration.
            </p>
            <SectionTable rows={SERVICE_ROWS} showType showBehavior />
          </section>

          <section id="query-unary" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Unary Query</h2>
            <p className={styles.sectionLead}>
              `Query` is the simplest call: one request, one completed turn, one final response. The server either creates a new persisted session or loads an existing one from `context_id`, applies any requested tool allowlist, runs the turn, and returns the latest assistant text plus usage totals.
            </p>
            <h3 className={articleStyles.h3}>`QueryRequest` fields and actual server behavior</h3>
            <SectionTable rows={REQUEST_ROWS} />
            <DocCodeBlock code={GRPCURL_QUERY} label="grpcurl / unary query" language="bash" />
            <DocCodeBlock code={GRPCURL_RESUME} label="grpcurl / resume with context_id" language="bash" />
            <ul className={articleStyles.list}>
              <li>`conversation_id` in the response is the underlying Seshat session id.</li>
              <li>Passing `tools` acts as an allowlist, not an additive tool request.</li>
              <li>Unknown tool names fail early with `InvalidArgument`.</li>
              <li>If `api_key` is present, it overrides host credential resolution for that request.</li>
            </ul>
          </section>

          <section id="streaming" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Streaming</h2>
            <p className={styles.sectionLead}>
              `QueryStream` is the main protocol for live experiences. It reuses the same runtime execution path, but instead of waiting for the full turn it forwards response chunks and structured runtime events as they are emitted, then closes with one final message containing the completed assistant text and token usage totals.
            </p>
            <h3 className={articleStyles.h3}>`QueryResponse.item_type` values</h3>
            <SectionTable rows={STREAM_ROWS} />
            <DocCodeBlock code={GRPCURL_STREAM} label="grpcurl / streaming query" language="bash" />
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Important streaming nuance</div>
              <p className={articleStyles.calloutText}>
                The server streams what the session callback emits. That gives you real incremental output and runtime events, but it is not documented as a provider-native token-perfect transport contract. In other words, treat it as a runtime stream, not as a raw vendor stream.
              </p>
            </div>
          </section>

          <section id="auxiliary-rpcs" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Skills, MCP, Models, and Health</h2>
            <p className={styles.sectionLead}>
              gRPC is not only for prompting. The server also exposes part of the runtime surface around skills discovery, MCP server lifecycle, provider registry introspection, and health reporting.
            </p>
            <DocCodeBlock code={GRPCURL_AUX} label="grpcurl / auxiliary methods" language="bash" />
            <ul className={articleStyles.list}>
              <li>`ListSkills` reads from the current skills discovery path using the server working directory.</li>
              <li>`ConnectMCP` persists an MCP server config, then reconnects it immediately through the runtime manager.</li>
              <li>`GetModels` lists models from the provider catalog, not only from currently-authenticated providers.</li>
              <li>`HealthCheck` returns server uptime and version, but it is not a full dependency readiness probe.</li>
            </ul>
          </section>

          <section id="client-usage" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Client Usage</h2>
            <p className={styles.sectionLead}>
              Today, gRPC is the cleanest cross-language contract Seshat has. The Go SDK is native embedding. Future Python, JS, Rust, Java, or C# SDKs can realistically start as higher-level wrappers around this gRPC surface, then grow richer runtime ergonomics later.
            </p>
            <h3 className={articleStyles.h3}>Go client</h3>
            <DocCodeBlock code={GO_CLIENT} label="Go gRPC client" language="go" />
            <h3 className={articleStyles.h3}>Python client</h3>
            <DocCodeBlock code={PYTHON_CLIENT} label="Python gRPC client" language="python" />
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>About future non-Go SDKs</div>
              <p className={articleStyles.calloutText}>
                Yes, gRPC is the most obvious foundation for official SDKs in other languages. The generated stubs alone are not enough for a polished developer experience, but they provide the stable transport boundary those SDKs can wrap: session resume, auth injection, stream aggregation, error normalization, and helper abstractions can all be layered on top of this contract.
              </p>
            </div>
          </section>

          <section id="codegen" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Codegen &amp; Regeneration</h2>
            <p className={styles.sectionLead}>
              If you modify `pkg/grpc/proto/seshat.proto`, you must regenerate the Go stubs and then rebuild or retest the server. The generated Go files live in `pkg/grpc/seshat/`.
            </p>
            <h3 className={articleStyles.h3}>Regenerate Go stubs from the repo root</h3>
            <DocCodeBlock code={GO_PROTOC} label="Go proto regeneration" language="bash" />
            <h3 className={articleStyles.h3}>Generate Python stubs</h3>
            <DocCodeBlock code={PYTHON_PROTOC} label="Python proto generation" language="bash" />
            <h3 className={articleStyles.h3}>Generate Node / JS stubs</h3>
            <DocCodeBlock code={NODE_PROTOC} label="Node proto generation" language="bash" />
            <ul className={articleStyles.list}>
              <li>After regeneration, rebuild with <span className={articleStyles.inlineCode}>go build ./cmd/grpc</span>.</li>
              <li>Then verify behavior with <span className={articleStyles.inlineCode}>go test ./cmd/grpc/...</span>.</li>
              <li>If you changed generated package names or method signatures, update any website examples and consumer wrappers as well.</li>
            </ul>
          </section>

          <section id="extend" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>How To Extend</h2>
            <p className={styles.sectionLead}>
              Completing the gRPC surface is more than adding lines to the proto. A real extension path has four layers: the `.proto` contract, regenerated stubs, server implementation, and bufconn tests that lock the behavior down.
            </p>
            <ol className={articleStyles.orderedList}>
              <li>Edit `pkg/grpc/proto/seshat.proto` and add or change the RPC or message you need.</li>
              <li>Regenerate the Go stubs in `pkg/grpc/seshat/` using `protoc`.</li>
              <li>Implement the server method in `cmd/grpc/main.go` and map it to real runtime behavior instead of placeholder logic.</li>
              <li>If you add a brand new service, register it explicitly on the gRPC server. The proto declaration alone does not expose it.</li>
              <li>Add bufconn-backed integration tests in `cmd/grpc/main_test.go` so request validation, streaming shape, and cleanup behavior stay stable.</li>
              <li>Rebuild, test, and then update docs so transport examples stay aligned with the real contract.</li>
            </ol>
            <DocCodeBlock code={REGISTER_EXTRA_SERVICE} label="Registering an additional service" language="go" />
          </section>

          <section id="gaps" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Current Gaps</h2>
            <p className={styles.sectionLead}>
              This is the part that matters if your goal is to complete the gRPC surface rather than just consume it. These are the concrete gaps visible in the current implementation and proto contract.
            </p>
            <SectionTable rows={GAP_ROWS} />
            <p className={articleStyles.p}>
              The highest-value next steps are straightforward: wire `temperature`, either remove or implement the proto-only services, populate `GetSkillDetails.prompt` if exposing skill bodies is intended, and add a real auth or proxy story if the server is meant to live beyond localhost.
            </p>
          </section>
        </div>

        <aside className={styles.aside}>
          <DocOnPageNav title="gRPC API" items={ON_PAGE} />
        </aside>
      </div>
    </article>
  )
}
