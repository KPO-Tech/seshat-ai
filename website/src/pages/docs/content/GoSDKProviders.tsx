import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './ProviderTables.module.css'
import { CAPABILITY_ROWS, PROVIDER_SETUP_ROWS, PROVIDERS } from './ProviderReferenceData'

const EXPLICIT_PROVIDER_CONFIG = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    ProviderConfig: &providers.Config{
        Provider: types.APIProviderAnthropic,
        APIKey:   os.Getenv("ANTHROPIC_API_KEY"),
        BaseURL:  "https://api.anthropic.com",
    },
})`

const CREDENTIAL_RESOLVER = `type VaultResolver struct {
    Keys map[string]string
}

func (r VaultResolver) ResolveAPIKey(ctx context.Context, provider string) (string, error) {
    if key, ok := r.Keys[provider]; ok {
        return key, nil
    }
    return "", nil
}

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderOpenAI,
        Model:    "gpt-5.5",
    },
    CredentialResolver: VaultResolver{
        Keys: map[string]string{
            "openai": os.Getenv("OPENAI_API_KEY"),
            "codex":  os.Getenv("CODEX_ACCESS_TOKEN"),
        },
    },
})`

const CAPABILITY_WIRING = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    ImageGeneration: &sdk.ImageGenerationConfig{
        Provider: "openai",
        Model:    "gpt-image-1",
        APIKey:   os.Getenv("OPENAI_API_KEY"),
    },
    TextToSpeech: &sdk.TextToSpeechConfig{
        Provider: "openai",
        Model:    "gpt-4o-mini-tts",
        Voice:    "alloy",
        APIKey:   os.Getenv("OPENAI_API_KEY"),
    },
    SpeechToText: &sdk.SpeechToTextConfig{
        Provider: "openai",
        Model:    "gpt-4o-transcribe",
        APIKey:   os.Getenv("OPENAI_API_KEY"),
    },
})`

const CLI_LOGIN = `seshat login --provider openai`

const CODEX_RESOLVER = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderCodex,
        Model:    "gpt-5.3-codex",
    },
    CredentialResolver: VaultResolver{
        Keys: map[string]string{
            "codex": os.Getenv("CODEX_ACCESS_TOKEN"),
        },
    },
    ProviderConfig: &providers.Config{
        Provider: types.APIProviderCodex,
        BaseURL:  "https://chatgpt.com/backend-api/codex",
    },
})`

const OAUTH_DEVICE_FLOW = `flow, err := sdk.NewOAuthDeviceFlow(sdk.OAuthDeviceFlowConfig{
    Provider: string(sdk.APIProviderCodex),
    Persist:  true,
})
if err != nil {
    log.Fatal(err)
}

challenge, err := flow.Start(ctx)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Open %s and enter %s\\n", challenge.VerificationURL, challenge.UserCode)

token, err := flow.Wait(ctx, challenge)
if err != nil {
    log.Fatal(err)
}

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderCodex,
        Model:    "gpt-5.3-codex",
    },
    CredentialResolver: flow.CredentialResolver(),
})
if err != nil {
    log.Fatal(err)
}

_ = token`

const GRPC_CODEX_REQUEST = `resp, err := grpcClient.Query(ctx, &pb.QueryRequest{
    Prompt: "Review this repository and propose a refactor plan.",
    Model:  "codex:gpt-5.3-codex",
    ApiKey: accessToken,
    Stream: false,
})`

function ProviderInventoryTable() {
  return (
    <DocTable variant="balanced">
      <colgroup>
        <col className={styles.providerRefColProvider} />
        <col className={styles.providerRefColAuth} />
        <col className={styles.providerRefColTransport} />
        <col className={styles.providerRefColBase} />
        <col className={styles.providerRefColNotes} />
      </colgroup>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Auth</th>
          <th>Transport</th>
          <th>Base / Endpoint</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {PROVIDERS.map(provider => (
          <tr key={provider.id}>
            <td className={styles.codeCell}>{provider.id}</td>
            <td>{provider.auth}</td>
            <td>{provider.transport}</td>
            <td className={styles.wrapCodeCell}>{provider.base}</td>
            <td className={styles.noteCell}>{provider.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function ProviderSetupTable() {
  return (
    <DocTable variant="balanced" className={styles.setupTable}>
      <colgroup>
        <col className={styles.setupColProvider} />
        <col className={styles.setupColAuth} />
        <col className={styles.setupColEnv} />
        <col className={styles.setupColConfig} />
        <col className={styles.setupColNotes} />
      </colgroup>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Auth flow</th>
          <th>Environment variables</th>
          <th>Config path</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {PROVIDER_SETUP_ROWS.map(row => (
          <tr key={row.provider}>
            <td className={styles.codeCell}>{row.provider}</td>
            <td>{row.authFlow}</td>
            <td className={styles.wrapCodeCell}>{row.envVars}</td>
            <td className={styles.wrapCodeCell}>{row.configKeys}</td>
            <td className={styles.noteCell}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function CapabilityTable() {
  return (
    <DocTable variant="balanced">
      <colgroup>
        <col className={styles.capabilityColName} />
        <col className={styles.capabilityColProviders} />
        <col className={styles.capabilityColConfig} />
        <col className={styles.capabilityColNotes} />
      </colgroup>
      <thead>
        <tr>
          <th>Capability</th>
          <th>Current provider options</th>
          <th>SDK config path</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {CAPABILITY_ROWS.map(row => (
          <tr key={row.capability}>
            <td>{row.capability}</td>
            <td>{row.providers}</td>
            <td className={styles.wrapCodeCell}>{row.configPath}</td>
            <td className={styles.noteCell}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function GoSDKProviders() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk">SDK and API</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk/go">Go SDK</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Providers &amp; Auth</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Providers &amp; Auth</h1>
        <p className={articleStyles.sub}>
          This subpage is the developer integration reference for provider wiring in the public Go SDK. It covers provider ids, auth flows, environment variables, capability-provider slots, explicit config overrides, per-user credential resolution, public OAuth helpers, Codex integration, and gRPC credential handoff.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Public SDK Integration Contract</h2>
        <p className={articleStyles.p}>
          For the exported Go SDK, the reliable contract is explicit credential injection. In practice that means one of three paths: set <span className={articleStyles.inlineCode}>ClientConfig.APIKey</span>, set provider-specific values on <span className={articleStyles.inlineCode}>ProviderConfig</span>, or implement <span className={articleStyles.inlineCode}>CredentialResolver</span> for per-user or per-request resolution.
        </p>
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Public SDK Surface</div>
          <p className={articleStyles.calloutText}>
            OAuth login is now exposed directly for Go hosts through <span className={articleStyles.inlineCode}>sdk.NewOAuthDeviceFlow</span> and stored-token reuse through <span className={articleStyles.inlineCode}>sdk.NewStoredCredentialResolver</span>. The lower-level integration contract stays the same: the runtime consumes an access token or API key, no matter whether your app got it from OAuth, env vars, vaults, or user settings.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Public OAuth Device Flow</h2>
        <p className={articleStyles.p}>
          For OpenAI and Codex-backed flows, the Go SDK now exposes a public device-code login helper. This is the right path when you want your own app to trigger ChatGPT authentication, persist the token into the Seshat auth store, and then reuse it through the standard credential resolver interface.
        </p>
        <DocCodeBlock code={OAUTH_DEVICE_FLOW} label="OAuth device flow" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Supported Providers</h2>
        <p className={articleStyles.p}>
          These are the provider ids currently understood by the runtime. This is the right reference when you need to know which provider string or <span className={articleStyles.inlineCode}>sdk.APIProvider*</span> constant your integration should actually use.
        </p>
        <ProviderInventoryTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Explicit Provider Wiring</h2>
        <p className={articleStyles.p}>
          The simplest path is to choose the model in <span className={articleStyles.inlineCode}>ClientConfig.Model</span>, set the main API key, and optionally attach a provider-specific config block when you need a base URL override, routing rules, or alias behavior from <span className={articleStyles.inlineCode}>providers.Config</span>.
        </p>
        <DocCodeBlock code={EXPLICIT_PROVIDER_CONFIG} label="Go SDK" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Auth Resolution Patterns</h2>
        <p className={articleStyles.p}>
          Use a resolver when your app owns user credentials, a vault, a secrets manager, or a token exchange layer. In the current public SDK, <span className={articleStyles.inlineCode}>CredentialResolver</span> is the clean server-mode boundary and is the right place to inject per-user provider access without mutating global process state.
        </p>
        <ProviderSetupTable />
        <DocCodeBlock code={CREDENTIAL_RESOLVER} label="CredentialResolver" language="go" />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Gemini Naming Gap</div>
          <p className={articleStyles.calloutText}>
            The current code still has a naming mismatch around Gemini: auth resolution uses <span className={articleStyles.inlineCode}>GOOGLE_API_KEY</span>, while some validation messaging still mentions <span className={articleStyles.inlineCode}>GOOGLE_GEMINI_API_KEY</span>.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Capability Providers</h2>
        <p className={articleStyles.p}>
          The main reasoning provider is only one part of the integration. Seshat also supports separate provider slots for multimodal built-in tools like image generation, speech-to-text, and text-to-speech.
        </p>
        <CapabilityTable />
        <DocCodeBlock code={CAPABILITY_WIRING} label="Capability-specific providers" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Codex Integration Patterns</h2>
        <p className={articleStyles.p}>
          Codex is the special case. The runtime uses a ChatGPT-backed Codex transport with a dedicated base URL, forced streaming behavior, and token handling that does not look like the normal OpenAI chat-completions path.
        </p>
        <ul className={articleStyles.list}>
          <li>For local or embedded products, start a ChatGPT login directly from the SDK with <span className={articleStyles.inlineCode}>sdk.NewOAuthDeviceFlow</span> and then hand the resulting resolver to <span className={articleStyles.inlineCode}>sdk.NewClient</span>.</li>
          <li>For backend or multi-user products, keep the OAuth or token exchange in your own app boundary and inject the live token with <span className={articleStyles.inlineCode}>CredentialResolver</span>.</li>
          <li>For locked-down deployments, you can bypass the interactive flow and inject <span className={articleStyles.inlineCode}>CODEX_API_KEY</span> or <span className={articleStyles.inlineCode}>CODEX_ACCESS_TOKEN</span> directly.</li>
        </ul>
        <DocCodeBlock code={CLI_LOGIN} label="CLI bootstrap" language="bash" />
        <DocCodeBlock code={CODEX_RESOLVER} label="Codex via resolver" language="go" />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>gRPC Handoff</div>
          <p className={articleStyles.calloutText}>
            The gRPC server does not run an interactive OAuth handshake itself, but it now accepts an explicit bearer token or API key per <span className={articleStyles.inlineCode}>QueryRequest</span>. That makes Codex usable over gRPC once your client app has already performed the OAuth login.
          </p>
        </div>
        <DocCodeBlock code={GRPC_CODEX_REQUEST} label="gRPC explicit token" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Start with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/go" state={{ from: location.pathname }}>
            Go SDK
          </Link>
          {' '}for the embedding model, then continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/tools" state={{ from: location.pathname }}>
            Tools &amp; Providers
          </Link>
          {' '}if you want the architectural separation behind these integration choices.
        </p>
      </section>
    </article>
  )
}
