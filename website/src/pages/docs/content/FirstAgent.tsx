import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import styles from './DocArticle.module.css'

const CHAT_CMD = 'seshat chat'
const RUN_CMD = 'seshat run "Read this project, identify the next valuable improvement, and explain why"'
const SDK_SNIPPET = 'package main\n\nimport (\n  "context"\n  "log"\n\n  "github.com/EngineerProjects/seshat/pkg/sdk"\n)\n\nfunc main() {\n  client, err := sdk.NewClient(sdk.DefaultClientConfig())\n  if err != nil {\n    log.Fatal(err)\n  }\n  defer client.Close()\n\n  resp, err := client.Query(context.Background(), "Write a Go function that reverses a string", nil)\n  if err != nil {\n    log.Fatal(err)\n  }\n\n  log.Println(resp.Text)\n}'

export default function FirstAgent() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <Link to={`${base}/getting-started`} className={styles.breadLink}>Getting Started</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>First Agent</span>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>First Agent</h1>
        <p className={styles.sub}>
          Your first agent does not need to be a complex multi-agent system. The real milestone is simpler:
          start a session, give it a concrete task, and get useful output in the environment where you actually work.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>Start with a real task</span>
          <p className={styles.calloutText}>
            Avoid toy prompts. Use a real repository, a real directory, or a real question. The first good experience with Seshat usually comes from a concrete task,
            not from asking it to say hello.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>CLI session</h2>
        <p className={styles.p}>
          For most people, the first agent is simply an interactive CLI session. Open it in the directory where the work lives.
        </p>
        <DocCodeBlock code={CHAT_CMD} label="Terminal" />
        <ul className={styles.list}>
          <li>Ask it to inspect the current codebase and explain the important parts.</li>
          <li>Ask it to find the next improvement worth making before touching files.</li>
          <li>Ask it to propose a plan, then validate or refine that plan.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>One-shot mode</h2>
        <p className={styles.p}>
          If you want a quick result without opening the TUI, use the headless runner. This is particularly useful in scripts or fast repo checks.
        </p>
        <DocCodeBlock code={RUN_CMD} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>How it maps to different profiles</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>User</span>
            <p className={styles.cardBody}>Use the agent as a working terminal companion: explore, summarize, search, and execute tasks step by step.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Vibecoder</span>
            <p className={styles.cardBody}>Drop Seshat into a real repo and iterate with it on code, commands, and file edits instead of treating it like a chatbot.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Developer</span>
            <p className={styles.cardBody}>Once the CLI flow is validated, move to the SDK and embed the same runtime programmatically.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Future platform user</span>
            <p className={styles.cardBody}>The runtime concepts stay the same, but SeshatOS adds auth, workspaces, governance, and richer product surfaces.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Minimal Go SDK example</h2>
        <p className={styles.p}>
          Developers usually want to see the smallest viable embedding example once the CLI is working. This is the right moment for that.
        </p>
        <DocCodeBlock code={SDK_SNIPPET} label="Go" language="go" />
      </section>

      <section className={styles.section}>
        <div className={styles.screenshotGrid}>
          <figure className={styles.screenshotCard}>
            <img src="/cli/provider_llm_zai_config.png" alt="Provider configuration screen in Seshat CLI" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Provider setup is the main thing to stabilise before longer sessions.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/working2.png" alt="Seshat CLI streaming response during work" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>A good first agent session should already feel like real work, not a static demo.</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Next step</h2>
        <p className={styles.p}>From here, the natural next move is either a richer CLI guide or the SDK/API side, depending on how you plan to use Seshat.</p>
        <div className={styles.actionRow}>
          <Link to={`${base}/guides`} className={styles.secondaryLink}>Guides</Link>
          <Link to={`${base}/sdk`} className={styles.primaryLink}>SDK and API</Link>
        </div>
      </section>
    </div>
  )
}
