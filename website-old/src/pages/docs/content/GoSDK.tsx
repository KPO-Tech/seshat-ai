import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import articleStyles from './DocArticle.module.css'

const BASIC_CLIENT = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:         os.Getenv("ANTHROPIC_API_KEY"),
    WorkingDir:     "/workspace/project",
    PermissionMode: sdk.PermissionModeOnRequest,
})
if err != nil {
    log.Fatal(err)
}
defer client.Close()`

const SESSION_AND_EVENTS = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    ResponseChunkFn: func(chunk sdk.ResponseChunk) {
        if chunk.Type == sdk.ResponseChunkTypeContentBlockDelta {
            fmt.Print(chunk.Delta)
        }
    },
    RuntimeEventFn: func(event sdk.RuntimeEvent) {
        switch event.Type {
        case sdk.RuntimeEventTypeToolProgress:
            fmt.Printf("tool %s: %s\n", event.ToolProgress.ToolName, event.ToolProgress.Message)
        case sdk.RuntimeEventTypeTurnCompleted:
            fmt.Printf("turn complete: %s\n", event.StopReason)
        }
    },
})

session, err := client.CreateSession(ctx)
if err != nil {
    log.Fatal(err)
}
defer session.Close()

response, err := session.SubmitMessage(ctx, "Inspect this Go service and suggest fixes.")
if err != nil {
    log.Fatal(err)
}

fmt.Println(response.Content)`

export default function GoSDK() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk">SDK and API</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Go SDK</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Go SDK</h1>
        <p className={articleStyles.sub}>
          The Go SDK is the direct embedding layer for Seshat. It gives developers the same mono-run runtime model used by the CLI app and other host surfaces, but as a library they can wire into their own product, backend, automation worker, or internal tool.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What This Page Is For</h2>
        <p className={articleStyles.p}>
          Concepts explains what the runtime is and why tools, permissions, providers, memory, and execution modes are separated. This page is different: it is about embedding that runtime in your own Go application and understanding the main integration surfaces exposed by <span className={articleStyles.inlineCode}>sdk.ClientConfig</span>.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Common Integration Patterns</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Local developer companion</div>
            <p className={articleStyles.cardBody}>Embed Seshat into a desktop utility, IDE-adjacent tool, or automation helper that needs filesystem, shell, browser, and MCP access from one runtime.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Backend service</div>
            <p className={articleStyles.cardBody}>Run Seshat behind an API or job system and inject per-user credentials, policies, storage, and monitoring from your own infrastructure.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Automation worker</div>
            <p className={articleStyles.cardBody}>Use the runtime as the execution core behind scheduled research, code maintenance, data transformation, or long-running internal operations.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Product feature runtime</div>
            <p className={articleStyles.cardBody}>Expose autonomous task execution inside your own SaaS while keeping sessions, permissions, tools, memory, and multimodal providers under one host-controlled runtime.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Minimal Client Bootstrap</h2>
        <p className={articleStyles.p}>
          The main public entry point is <span className={articleStyles.inlineCode}>sdk.NewClient</span>. You choose a model, provide credentials, pick a working directory and permission mode, then the SDK builds the provider client, engine, tool registry, memory services, and execution loop for you.
        </p>
        <DocCodeBlock code={BASIC_CLIENT} label="Go SDK" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Sessions, Streaming, And Runtime Events</h2>
        <p className={articleStyles.p}>
          The Go SDK is not just a thin “generate text” wrapper. It exposes persistent sessions, streamed response chunks, structured runtime events, tool progress notifications, and the same loop-level execution model that drives the rest of Seshat.
        </p>
        <DocCodeBlock code={SESSION_AND_EVENTS} label="Sessions and callbacks" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Core Go SDK Subpages</h2>
        <p className={articleStyles.p}>
          The first layer under Go SDK explains the primitives you actually wire first: providers, auth, agent shape, prompt architecture, and tool surface control.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Providers &amp; Auth</div>
            <p className={articleStyles.cardBody}>Provider ids, environment variables, OAuth and Codex login flows, explicit API key injection, capability-provider slots, and gRPC credential handoff.</p>
            <Link className={articleStyles.link} to="/docs/sdk/providers" state={{ from: location.pathname }}>
              Open Providers &amp; Auth
            </Link>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Agent</div>
            <p className={articleStyles.cardBody}>How to define embedded agent roles, choose the right client-versus-session boundary, and model personas cleanly in your own Go application.</p>
            <Link className={articleStyles.link} to="/docs/sdk/agent" state={{ from: location.pathname }}>
              Open Agent
            </Link>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Prompt</div>
            <p className={articleStyles.cardBody}>The shipped prompt architecture, stable and dynamic layers, stage overlays, project instructions, tool hints, and every prompt-shaping parameter exposed by the SDK.</p>
            <Link className={articleStyles.link} to="/docs/sdk/prompt" state={{ from: location.pathname }}>
              Open Prompt
            </Link>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Tools &amp; Surface</div>
            <p className={articleStyles.cardBody}>Builtin tool inventory, permission-sensitive tools, deferred tools, MCP surface shaping, and runtime-owned execution boundaries for host apps.</p>
            <Link className={articleStyles.link} to="/docs/sdk/go-tools" state={{ from: location.pathname }}>
              Open Tools &amp; Surface
            </Link>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Applied Go SDK Tracks</h2>
        <p className={articleStyles.p}>
          `SDK and API` should come right after Concepts because this is where implementation starts. The next three pages stay under Go SDK on purpose: they are not generic user guides, they are developer-facing runtime composition guides.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Building Workflows</div>
            <p className={articleStyles.cardBody}>Compose sessions, prompt stages, tool policies, retries, and memory boundaries into workflow shapes that still respect the runtime instead of bypassing it.</p>
            <Link className={articleStyles.link} to="/docs/sdk/workflows" state={{ from: location.pathname }}>
              Open Building Workflows
            </Link>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Multi-Agent Scenarios</div>
            <p className={articleStyles.cardBody}>Document mailbox patterns, agent delegation, role separation, and the practical path from one agent loop to team-like runtime behavior in host applications.</p>
            <Link className={articleStyles.link} to="/docs/sdk/multi-agent" state={{ from: location.pathname }}>
              Open Multi-Agent Scenarios
            </Link>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Developer Integration</div>
            <p className={articleStyles.cardBody}>Cover backend embedding, desktop embedding, auth bridging, event streaming, observability hooks, and the product integration patterns teams actually need.</p>
            <Link className={articleStyles.link} to="/docs/sdk/dev-integration" state={{ from: location.pathname }}>
              Open Developer Integration
            </Link>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          For the runtime-side architecture, continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/mono-run" state={{ from: location.pathname }}>
            Mono-Run Architecture
          </Link>
          . For tool and provider separation at the conceptual level, continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/tools" state={{ from: location.pathname }}>
            Tools &amp; Providers
          </Link>
          .
        </p>
      </section>
    </article>
  )
}
