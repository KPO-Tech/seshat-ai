import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import articleStyles from './DocArticle.module.css'
import styles from './MemoryRAG.module.css'

type Tone = 'session' | 'working' | 'memory' | 'retrieval'
type IconName =
  | 'database'
  | 'chat'
  | 'spark'
  | 'folder'
  | 'brain'
  | 'graph'
  | 'search'
  | 'stack'
  | 'cpu'
  | 'book'

const SESSION_COMMANDS = `seshat sessions list
seshat chat --resume <session-id>
seshat chat --continue`

const TOOL_SURFACES = `memory_create_entities
memory_add_observations
memory_search_nodes
memory_open_nodes

rag_ingest
rag_search`

const EMBEDDING_ENV = `export RAG_EMBEDDING_URL=http://localhost:11434
export RAG_EMBEDDING_MODEL=nomic-embed-text
export RAG_EMBEDDING_PROVIDER=ollama

seshat chat`

const SDK_WIRING = `client, err := sdk.NewClient(&sdk.ClientConfig{
    EnableMemory:   true,
    RAGService:     ragSvc,
    LongTermMemory: graphStore,
})`

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'database':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <path d="M5 5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
          <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
        </svg>
      )
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 18l-1.5 3L7 19h10a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v7a4 4 0 0 0 2 3z" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
    case 'folder':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h6l2 2h10v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5V7z" />
        </svg>
      )
    case 'brain':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4a3 3 0 0 0-3 3v1a2.5 2.5 0 0 0-2 2.4A2.6 2.6 0 0 0 5.7 13 3.5 3.5 0 0 0 9 18h1V4H9z" />
          <path d="M15 4a3 3 0 0 1 3 3v1a2.5 2.5 0 0 1 2 2.4A2.6 2.6 0 0 1 18.3 13 3.5 3.5 0 0 1 15 18h-1V4h1z" />
          <path d="M10 9H8M16 9h-2M10 13H7.5M16.5 13H14" />
        </svg>
      )
    case 'graph':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 11l7.7-4" />
          <path d="M8 13l7.7 4" />
        </svg>
      )
    case 'search':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      )
    case 'stack':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="14" height="4" rx="1.5" />
          <rect x="5" y="10" width="14" height="4" rx="1.5" />
          <rect x="5" y="15" width="14" height="4" rx="1.5" />
        </svg>
      )
    case 'cpu':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <rect x="10" y="10" width="4" height="4" rx="1" />
          <path d="M10 2v3M14 2v3M10 19v3M14 19v3M19 10h3M19 14h3M2 10h3M2 14h3" />
        </svg>
      )
    case 'book':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
          <path d="M8 7h8M8 11h8" />
        </svg>
      )
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'working':
      return styles.toneWorking
    case 'memory':
      return styles.toneMemory
    case 'retrieval':
      return styles.toneRetrieval
    default:
      return styles.toneSession
  }
}

function IconBadge({ icon, tone }: { icon: IconName; tone: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${toneClassName(tone)}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

function LayerCard({
  tone,
  icon,
  eyebrow,
  title,
  body,
  meta,
}: {
  tone: Tone
  icon: IconName
  eyebrow: string
  title: string
  body: string
  meta: string
}) {
  return (
    <div className={styles.layerCard}>
      <div className={styles.layerTop}>
        <IconBadge icon={icon} tone={tone} />
        <span className={styles.eyebrow}>{eyebrow}</span>
      </div>
      <strong className={styles.cardTitle}>{title}</strong>
      <p className={styles.cardBody}>{body}</p>
      <span className={styles.metaChip}>{meta}</span>
    </div>
  )
}

function MemoryLandscapeDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.layerGrid}>
        <LayerCard
          tone="session"
          icon="database"
          eyebrow="Persistence"
          title="Session Store"
          body="The full transcript, metadata, tool results, and resumability live in SQLite."
          meta="Full history"
        />
        <LayerCard
          tone="working"
          icon="chat"
          eyebrow="Working Window"
          title="Active Context"
          body="Only the provider-facing slice stays hot in the current turn. This is what compaction protects."
          meta="Prompt-sized"
        />
        <LayerCard
          tone="memory"
          icon="brain"
          eyebrow="Durable Memory"
          title="Learned Memory"
          body="Project instructions, user preferences, tool patterns, and recent session summaries can be re-injected later."
          meta="Prompt support"
        />
        <LayerCard
          tone="retrieval"
          icon="search"
          eyebrow="External Recall"
          title="RAG Corpora"
          body="Indexed chunks live outside the transcript and are pulled only when retrieval is needed."
          meta="On-demand retrieval"
        />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.layerTop}>
          <IconBadge icon="cpu" tone="session" />
          <span className={styles.eyebrow}>One Runtime Contract</span>
        </div>
        <strong className={styles.cardTitle}>Session + Loop + Prompt Assembly</strong>
        <p className={styles.cardBody}>
          The runtime uses all four layers, but it does not collapse them into one bag of text. Session state, compacted context, learned memory, and retrieval each solve a different problem.
        </p>
      </div>

      <div className={styles.branchRow}>
        <div className={styles.branchCard}>
          <div className={styles.layerTop}>
            <IconBadge icon="spark" tone="working" />
            <span className={styles.eyebrow}>Prompt Path</span>
          </div>
          <strong className={styles.cardTitle}>Compaction + Memory Context</strong>
          <p className={styles.cardBody}>The prompt builder receives a compact working window plus durable memory context.</p>
        </div>
        <div className={styles.branchCard}>
          <div className={styles.layerTop}>
            <IconBadge icon="graph" tone="memory" />
            <span className={styles.eyebrow}>Tool Path</span>
          </div>
          <strong className={styles.cardTitle}>Knowledge Graph + RAG Tools</strong>
          <p className={styles.cardBody}>Explicit tool calls can read or update longer-lived knowledge without stuffing it all into the conversation.</p>
        </div>
      </div>
    </div>
  )
}

function CompactionDiagram() {
  return (
    <div className={styles.flowBoard}>
      <div className={styles.flowRow}>
        <div className={styles.flowCard}>
          <IconBadge icon="stack" tone="session" />
          <strong className={styles.cardTitle}>1. Estimate usage</strong>
          <p className={styles.cardBody}>The runtime computes current request tokens against the model window.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="spark" tone="working" />
          <strong className={styles.cardTitle}>2. Micro-compact first</strong>
          <p className={styles.cardBody}>Messages are normalized and shortened before a summary model is used.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="book" tone="working" />
          <strong className={styles.cardTitle}>3. Summarize if still too large</strong>
          <p className={styles.cardBody}>A compact summary preserves active requests, decisions, tools, and unresolved work.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="database" tone="session" />
          <strong className={styles.cardTitle}>4. Keep the full transcript elsewhere</strong>
          <p className={styles.cardBody}>The active window shrinks, but the durable session record stays intact.</p>
        </div>
      </div>
    </div>
  )
}

function RAGPipelineDiagram() {
  return (
    <div className={styles.flowBoard}>
      <div className={`${styles.flowRow} ${styles.flowRowWide}`}>
        <div className={styles.flowCard}>
          <IconBadge icon="folder" tone="retrieval" />
          <strong className={styles.cardTitle}>Ingest</strong>
          <p className={styles.cardBody}>A document enters a named corpus and optionally gets an artifact reference.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="stack" tone="retrieval" />
          <strong className={styles.cardTitle}>Chunk</strong>
          <p className={styles.cardBody}>The default chunker splits by paragraph and hard-caps chunks around 800 characters.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="spark" tone="retrieval" />
          <strong className={styles.cardTitle}>Embed</strong>
          <p className={styles.cardBody}>Each chunk is embedded through an OpenAI-compatible or Ollama embedding endpoint.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="database" tone="retrieval" />
          <strong className={styles.cardTitle}>Index</strong>
          <p className={styles.cardBody}>Vectors are upserted into the embedded HNSW store under a corpus namespace.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="search" tone="retrieval" />
          <strong className={styles.cardTitle}>Search + rerank</strong>
          <p className={styles.cardBody}>Query embeddings retrieve candidates, hybrid weighting can blend keywords, and reranking is optional.</p>
        </div>
      </div>
    </div>
  )
}

export default function MemoryRAG() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link to={base} className={articleStyles.breadLink}>Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link to={`${base}/concepts`} className={articleStyles.breadLink}>Concepts</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Memory and RAG</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Memory and RAG</h1>
        <p className={articleStyles.sub}>
          In Seshat, memory is not one subsystem. The runtime keeps a durable session record, compresses the active context window, learns reusable memory across sessions, exposes explicit long-term memory tools, and can also retrieve from indexed corpora with RAG. Those pieces work together, but they are not interchangeable.
        </p>
      </header>

      <section className={articleStyles.section}>
        <div className={articleStyles.callout}>
          <span className={articleStyles.calloutTitle}>Short version</span>
          <p className={articleStyles.calloutText}>
            Session persistence answers <em>what happened</em>. Compaction answers <em>what still needs to stay in the current prompt</em>. Durable memory answers <em>what should still influence future sessions</em>. RAG answers <em>what external corpus should be retrieved on demand</em>.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Four different problems, not one memory bucket</h2>
        <MemoryLandscapeDiagram />
        <p className={articleStyles.p}>
          That separation matters because each layer has different latency, size, persistence, and retrieval behavior. If you mix them conceptually, the architecture becomes fuzzy very quickly. The code does not treat them as the same thing, and the docs should not either.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>1. The full session is durable even when the prompt is not</h2>
        <p className={articleStyles.p}>
          The first layer is the session store. Seshat persists multi-turn sessions so they can survive restarts, be resumed later, and remain inspectable. This is the source of truth for full transcript history. It is not constrained by the provider context window in the same way the active prompt is.
        </p>
        <DocCodeBlock code={SESSION_COMMANDS} label="CLI" language="bash" />
        <p className={articleStyles.p}>
          This is the first distinction many agent systems blur. The model only sees the active request window. The runtime still owns a larger durable session record containing messages, metadata, tool results, and resumability information.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>2. Compaction protects the active working window</h2>
        <CompactionDiagram />
        <p className={articleStyles.p}>
          The compaction engine in <span className={articleStyles.inlineCode}>internal/runtime/memory</span> estimates request tokens, computes an effective context window after reserving summary output budget, and triggers auto-compaction once the configured threshold is crossed. It first tries micro-compaction, then escalates to summary compaction if the context is still too large.
        </p>
        <ul className={articleStyles.list}>
          <li><span className={articleStyles.inlineCode}>AutoCompactThreshold</span> is converted into an absolute token ceiling based on the current model window.</li>
          <li><span className={articleStyles.inlineCode}>CompactTargetPercentage</span> defines how far the runtime tries to shrink the active context after compaction.</li>
          <li><span className={articleStyles.inlineCode}>MaxSummaryTokens</span> reserves output space for the summarizer so compaction does not immediately recreate the same overflow.</li>
          <li>A consecutive-failure limit acts like a circuit breaker so a broken summarizer does not trap the session in endless retries.</li>
        </ul>
        <p className={articleStyles.p}>
          The key point is architectural, not cosmetic: compaction reduces the provider-facing working set, but it does not mean the earlier session history disappeared from the runtime.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>3. Durable learned memory is prompt support, not transcript storage</h2>
        <p className={articleStyles.p}>
          Separate from the transcript and compactor, the memory manager keeps scoped memory under <span className={articleStyles.inlineCode}>{'<runtime-root>/memory'}</span>. Its job is to surface stable context that should keep influencing future turns or future sessions.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Project memory</span>
            <p className={articleStyles.cardBody}>Instructions and preferences tied to one codebase or working directory.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>User preferences</span>
            <p className={articleStyles.cardBody}>Response language, format, tone, or other stable user-level habits.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Learned tool usage</span>
            <p className={articleStyles.cardBody}>Patterns extracted from successful or failed tool execution over time.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Recent session history</span>
            <p className={articleStyles.cardBody}>Short summaries of past sessions for the same project, kept outside the live prompt loop.</p>
          </div>
        </div>
        <p className={articleStyles.p}>
          The runtime also learns some of this automatically. User messages can be scanned for durable directives, tool usage can update pattern memory, and finished sessions can generate summaries that later re-enter the prompt as compact context. In catalog mode, the integration layer can also search memory entries instead of only formatting them into prompt text.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>4. Explicit long-term memory tools are a second durable surface</h2>
        <p className={articleStyles.p}>
          There is another persistent memory path in the runtime: the explicit <span className={articleStyles.inlineCode}>memory_*</span> tool family. These tools do not just append notes to the prompt. They operate on a long-term knowledge graph with entities, observations, search, and node opening.
        </p>
        <DocCodeBlock code={TOOL_SURFACES} label="Built-in tools" language="text" />
        <p className={articleStyles.p}>
          In the CLI runtime, this graph is wired through <span className={articleStyles.inlineCode}>LongTermMemory</span> and backed by the same SQLite database path when available. This means Seshat currently has two durable-memory shapes: prompt-facing scoped memory for reuse in future prompts, and tool-facing graph memory for explicit structured recall.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>5. RAG is retrieval from corpora, not memory of the session</h2>
        <RAGPipelineDiagram />
        <p className={articleStyles.p}>
          The RAG service in <span className={articleStyles.inlineCode}>internal/rag</span> ingests text into a named corpus, chunks it, embeds each chunk, and upserts the records into a vector store. At query time it embeds the question, searches the corpus namespace, optionally blends keyword scoring through <span className={articleStyles.inlineCode}>HybridWeight</span>, and can apply a reranker before returning the final results.
        </p>
        <ul className={articleStyles.list}>
          <li>The default chunker is local and simple: paragraph splitting with a hard cap around 800 characters per chunk.</li>
          <li>The default embedded vector backend is the persistent HNSW store under <span className={articleStyles.inlineCode}>{'<runtime-root>/data/hnsw'}</span>.</li>
          <li>Artifact storage is optional, so the index can still work even when raw document blobs are not persisted.</li>
          <li>The CLI only enables RAG automatically when an embedding endpoint is configured.</li>
        </ul>
        <DocCodeBlock code={EMBEDDING_ENV} label="Embeddings" language="bash" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>SDK wiring keeps the distinction explicit</h2>
        <p className={articleStyles.p}>
          The SDK composition boundary makes the architecture obvious. Memory, RAG, and long-term graph memory are not one field or one switch. They are separate capabilities wired into the client and then exposed through the runtime.
        </p>
        <DocCodeBlock code={SDK_WIRING} label="Go SDK" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Memory is not RAG</h2>
        <div className={styles.compareGrid}>
          <div className={styles.compareCard}>
            <div className={styles.layerTop}>
              <IconBadge icon="brain" tone="memory" />
              <span className={styles.eyebrow}>Memory</span>
            </div>
            <strong className={styles.cardTitle}>State the runtime wants to keep carrying</strong>
            <ul className={styles.miniList}>
              <li>User preferences and stable instructions.</li>
              <li>Project conventions and learned tool patterns.</li>
              <li>Session summaries and graph observations.</li>
            </ul>
          </div>
          <div className={styles.compareCard}>
            <div className={styles.layerTop}>
              <IconBadge icon="search" tone="retrieval" />
              <span className={styles.eyebrow}>RAG</span>
            </div>
            <strong className={styles.cardTitle}>External knowledge retrieved only when needed</strong>
            <ul className={styles.miniList}>
              <li>Documents indexed into named corpora.</li>
              <li>Query-time search over embedded chunks.</li>
              <li>Best for large bodies of reference material.</li>
            </ul>
          </div>
        </div>
        <p className={articleStyles.p}>
          Good systems usually need both. Memory helps the runtime stay coherent over time. RAG helps it pull in source material that is too large or too external to live inside that memory permanently.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What exists today versus what is still evolving</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Already real</span>
            <p className={articleStyles.cardBody}>Session persistence, auto-compaction, scoped learned memory, HNSW-backed RAG, and explicit long-term memory tools all exist in the current codebase.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Still evolving</span>
            <p className={articleStyles.cardBody}>The retrieval stack can still grow with richer ingestion paths, better ranking, more memory policies, and tighter product-layer knowledge experiences in seshat-ai.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Next concept</h2>
        <p className={articleStyles.p}>
          Once memory boundaries are clear, the next important layer is capability distribution: how tools, skills, and MCP servers extend the runtime without breaking its core contract.
        </p>
        <div className={articleStyles.actionRow}>
          <Link to={`${base}/concepts/runtime-modes`} className={articleStyles.secondaryLink}>Runtime Modes</Link>
          <Link to={`${base}/guides/cli`} className={articleStyles.secondaryLink}>CLI guide</Link>
          <Link to={`${base}/concepts/skills-mcp`} className={articleStyles.primaryLink}>Skills and MCP</Link>
        </div>
      </section>
    </div>
  )
}
