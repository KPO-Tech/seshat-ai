import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './ProviderTables.module.css'
import { CAPABILITY_ROWS, PROVIDER_SETUP_ROWS, PROVIDERS } from './ProviderReferenceData'

const SDK_PROVIDER_CONFIG = `client, err := sdk.NewClient(&sdk.ClientConfig{
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
    ImageGeneration: &sdk.ImageGenerationConfig{
        Provider: "openai",
        Model:    "gpt-image-1",
        APIKey:   os.Getenv("OPENAI_API_KEY"),
    },
})`

const CODEX_LOGIN = `seshat login --provider codex --method oauth`

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

export default function ProvidersReference() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk">SDK and API</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Providers &amp; Auth</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Providers &amp; Auth</h1>
        <p className={articleStyles.sub}>
          This page is the practical reference for configuring Seshat providers in code and in the CLI app. It covers the supported provider ids, auth flows, environment variables, capability-provider slots, and the specific Codex OAuth path.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Supported Providers</h2>
        <p className={articleStyles.p}>
          The runtime provider registry currently exposes the following provider ids. This is the right reference when you need to know which identifiers the runtime actually understands, rather than which vendors are merely mentioned in the docs.
        </p>
        <ProviderInventoryTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Provider Setup Reference</h2>
        <p className={articleStyles.p}>
          For most direct APIs, Seshat resolves credentials from environment variables first and falls back to the local auth store. In server-mode embeddings, the cleaner pattern is to pass credentials through <span className={articleStyles.inlineCode}>sdk.ClientConfig.CredentialResolver</span> instead of relying on one global process-level API key.
        </p>
        <ProviderSetupTable />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Gemini Note</div>
          <p className={articleStyles.calloutText}>
            The current code has a naming mismatch: provider auth resolution uses <span className={articleStyles.inlineCode}>GOOGLE_API_KEY</span>, while validation messages mention <span className={articleStyles.inlineCode}>GOOGLE_GEMINI_API_KEY</span>. The runtime behavior is still usable, but the naming should be normalized later.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Capability Providers</h2>
        <p className={articleStyles.p}>
          Seshat does not force the same provider to handle everything. Image generation, speech-to-text, and text-to-speech can be configured independently from the main reasoning model.
        </p>
        <CapabilityTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Go SDK Wiring</h2>
        <p className={articleStyles.p}>
          In the SDK, the main model path and the capability-provider paths are separate. The example below shows the common shape: one main provider config for the session model, then optional nested configs for specific multimodal capabilities.
        </p>
        <DocCodeBlock code={SDK_PROVIDER_CONFIG} label="Go SDK" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Codex OAuth Flow</h2>
        <p className={articleStyles.p}>
          Codex is the one provider that behaves differently enough to deserve its own note. In the current runtime, it uses a ChatGPT device flow, persists the OAuth token locally, and then talks to the ChatGPT-backed Codex Responses API rather than to the standard OpenAI chat-completions route.
        </p>
        <DocCodeBlock code={CODEX_LOGIN} label="CLI" language="bash" />
        <ul className={articleStyles.list}>
          <li>The CLI-era auth helpers persist OAuth state under <span className={articleStyles.inlineCode}>~/.seshat/auth.json</span> unless <span className={articleStyles.inlineCode}>SESHAT_AUTH_PATH</span> overrides it.</li>
          <li>The runtime can refresh the stored OAuth token automatically when it expires.</li>
          <li>You can still bypass the device flow with an explicit <span className={articleStyles.inlineCode}>CODEX_API_KEY</span> if your deployment model requires it.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          For the architecture view of how providers fit with the tool surface, continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/tools" state={{ from: location.pathname }}>
            Tools &amp; Providers
          </Link>
          . For execution behavior and surface differences, continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/runtime-modes" state={{ from: location.pathname }}>
            Runtime Modes
          </Link>
          .
        </p>
      </section>
    </article>
  )
}
