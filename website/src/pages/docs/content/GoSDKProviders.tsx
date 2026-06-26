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
          This page is the practical provider tutorial for Go developers embedding Seshat. Instead of listing knobs first, it starts from the real integration scenarios: local operator apps, multi-user backends, mixed provider stacks, and Codex-specific auth flows.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Public SDK Auth Contract</h2>
        <p className={articleStyles.p}>
          The exported Go SDK keeps the auth boundary intentionally simple. Your host app can pass credentials directly through <span className={articleStyles.inlineCode}>ClientConfig.APIKey</span>, use provider-specific values in <span className={articleStyles.inlineCode}>ProviderConfig</span>, or resolve credentials dynamically with <span className={articleStyles.inlineCode}>CredentialResolver</span>.
        </p>
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>What changed recently</div>
          <p className={articleStyles.calloutText}>
            OAuth login is now exposed for Go hosts through <span className={articleStyles.inlineCode}>sdk.NewOAuthDeviceFlow</span>. That means a desktop app, CLI app, or internal operator tool can initiate login itself and then feed the resulting resolver back into the same runtime without inventing a separate auth bridge.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Choose The Right Scenario First</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Single-user app</div>
            <p className={articleStyles.cardBody}>Best for a CLI app, a local desktop utility, or an internal operator tool where one human controls one runtime and simple env-var auth is acceptable.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Multi-user backend</div>
            <p className={articleStyles.cardBody}>Best for SaaS or internal platforms where credentials belong to each tenant or user and must be resolved dynamically per request.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Mixed capability stack</div>
            <p className={articleStyles.cardBody}>Best when reasoning, image generation, speech, and transcription should not all come from the same provider.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Codex-specific flow</div>
            <p className={articleStyles.cardBody}>Best when you want ChatGPT-backed Codex access inside your own app, including device flow login and downstream gRPC handoff.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Scenario 1: Single-User CLI App, Desktop Utility, Or Operator Tool</h2>
        <p className={articleStyles.p}>
          This is the simplest embedding path. Pick a model, inject one API key, and optionally override transport details through <span className={articleStyles.inlineCode}>ProviderConfig</span>. If your host product also uses the Seshat auth store, you can bootstrap login with the CLI and then let the runtime reuse the stored credentials.
        </p>
        <DocCodeBlock code={EXPLICIT_PROVIDER_CONFIG} label="Explicit provider config" language="go" />
        <DocCodeBlock code={CLI_LOGIN} label="Optional shared auth-store bootstrap" language="bash" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Scenario 2: Multi-User Backend Or SaaS Integration</h2>
        <p className={articleStyles.p}>
          In a backend, process-wide environment variables are usually the wrong boundary. The cleaner pattern is to let your app own secret storage, token exchange, or tenant settings, then resolve the provider credential at runtime through <span className={articleStyles.inlineCode}>CredentialResolver</span>.
        </p>
        <ProviderSetupTable />
        <DocCodeBlock code={CREDENTIAL_RESOLVER} label="Per-user credential injection" language="go" />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Gemini naming gap</div>
          <p className={articleStyles.calloutText}>
            The current code still has a naming mismatch around Gemini: auth resolution uses <span className={articleStyles.inlineCode}>GOOGLE_API_KEY</span>, while some validation messaging still mentions <span className={articleStyles.inlineCode}>GOOGLE_GEMINI_API_KEY</span>. The runtime works, but the naming should be normalized later.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Scenario 3: One Reasoning Model, Different Capability Providers</h2>
        <p className={articleStyles.p}>
          Seshat does not require one provider to own everything. The main reasoning model can come from one vendor while image generation, speech-to-text, and text-to-speech use completely different providers. This is the right shape when you want better cost control, better local quality on one modality, or a more sovereign deployment mix.
        </p>
        <CapabilityTable />
        <DocCodeBlock code={CAPABILITY_WIRING} label="Capability-specific providers" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Scenario 4: Codex Inside Your App Or Through gRPC</h2>
        <p className={articleStyles.p}>
          Codex is the one provider that needs extra explanation. It uses a ChatGPT-backed transport, a dedicated base URL, and an auth story that is different from the standard API-key-only path. For local products, the most ergonomic path is to launch the device flow directly from the SDK and then reuse the returned resolver.
        </p>
        <DocCodeBlock code={OAUTH_DEVICE_FLOW} label="OAuth device flow" language="go" />
        <DocCodeBlock code={CODEX_RESOLVER} label="Codex resolver wiring" language="go" />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>gRPC handoff</div>
          <p className={articleStyles.calloutText}>
            The gRPC server does not perform an interactive OAuth handshake itself. The intended pattern is: do the login in your client app, obtain a live bearer token, then pass that token explicitly in the request that targets the Codex model.
          </p>
        </div>
        <DocCodeBlock code={GRPC_CODEX_REQUEST} label="gRPC explicit token" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Supported Provider Inventory</h2>
        <p className={articleStyles.p}>
          Once the scenario is clear, this table is the runtime-level source of truth for the provider ids, transports, endpoints, and auth modes currently understood by Seshat.
        </p>
        <ProviderInventoryTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/go-tools" state={{ from: location.pathname }}>
            Tools &amp; Surface
          </Link>
          {' '}to shape what the authenticated runtime can actually do, or go back to{' '}
          <Link className={articleStyles.link} to="/docs/concepts/tools" state={{ from: location.pathname }}>
            Tools &amp; Providers
          </Link>
          {' '}for the conceptual architecture behind the integration boundary.
        </p>
      </section>
    </article>
  )
}
