import { useState, useEffect } from 'react'
import styles from './AgentSimulator.module.css'

interface Step {
  activeAgent: string;
  status: string;
  chat: { sender: string; message: string; role: 'user' | 'assistant'; avatar: string };
  terminal: string[];
}

interface Mission {
  name: string;
  icon: string;
  sidebarActiveIndex: number;
  crew: { id: string; name: string; role: string }[];
  steps: Step[];
}

const MISSIONS: Mission[] = [
  {
    name: 'Deploy RAG API',
    icon: '💻',
    sidebarActiveIndex: 5, // Workspace
    crew: [
      { id: 'architect', name: 'Lead Architect', role: 'System Architecture' },
      { id: 'rag', name: 'RAG Optimizer', role: 'Database Ingestion' },
      { id: 'developer', name: 'Go Developer', role: 'Search Controller' },
      { id: 'qa', name: 'QA Specialist', role: 'Verification Suite' },
    ],
    steps: [
      {
        activeAgent: 'architect',
        status: 'Planning',
        chat: {
          sender: 'User',
          message: 'Deploy a RAG search pipeline on /docs. Use pgvector for storing embedding chunks.',
          role: 'user',
          avatar: 'U',
        },
        terminal: [
          '[Engine] Session started for workspace: "docs-rag"',
          '[Engine] Agent "Lead Architect" initialized and active.',
          '[Lead Architect] Scanned workspace directory: found 146 Markdown files in /docs.',
        ],
      },
      {
        activeAgent: 'rag',
        status: 'Indexing DB',
        chat: {
          sender: 'Assistant',
          message: 'Starting document database indexing. I have activated the RAG Optimizer sub-agent to parse /docs and upload to Postgres pgvector.',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[RAG Optimizer] Calling tool: db_setup --provider=pgvector',
          '[Tool: db_setup] Connected to postgres://localhost:5432/seshat_docs.',
          '[Tool: db_setup] Table "embeddings" initialized (dimension=1536).',
          '[RAG Optimizer] Calling tool: index_files --path=/docs',
          '[Tool: index_files] Computing embeddings... [■■■■■■■■■■■■■■■■] 146/146 ingested.',
        ],
      },
      {
        activeAgent: 'developer',
        status: 'Coding Go Controller',
        chat: {
          sender: 'Assistant',
          message: 'The RAG database is successfully indexed. Go Developer is now implementing the search query gRPC routes in internal/rag/search.go.',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[Go Developer] Calling tool: file_write --path=internal/rag/search.go',
          '[Tool: file_write] Modified 86 lines in file "internal/rag/search.go".',
          '[Go Developer] Calling tool: run_command --cmd="go build ./..."',
          '[Command] Compiling package: github.com/EngineerProjects/seshat/internal/rag',
          '[Command] Build successful. 0 errors, 0 warnings.',
        ],
      },
      {
        activeAgent: 'qa',
        status: 'Testing Suite',
        chat: {
          sender: 'Assistant',
          message: 'Search controller compiled successfully. Activating QA Specialist to execute query verification tests. 100% of tests passed!',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[QA Specialist] Calling tool: run_tests --pkg=./internal/rag/...',
          '[Tool: run_tests] === RUN   TestRagQuery_Success',
          '[Tool: run_tests] --- PASS: TestRagQuery_Success (0.12s)',
          '[Tool: run_tests] === RUN   TestRagQuery_EmptyIndex',
          '[Tool: run_tests] --- PASS: TestRagQuery_EmptyIndex (0.03s)',
          '[Tool: run_tests] PASS',
          '[QA Specialist] Code is fully validated. Session results saved.',
          '[Engine] Mission marked COMPLETE. Workspace saved.',
        ],
      },
    ],
  },
  {
    name: 'Competitor Study',
    icon: '📊',
    sidebarActiveIndex: 2, // Teams
    crew: [
      { id: 'researcher', name: 'Lead Researcher', role: 'Analysis Lead' },
      { id: 'searcher', name: 'Search Specialist', role: 'Data Mining' },
      { id: 'synthesizer', name: 'Synthesizer', role: 'Report Writing' },
    ],
    steps: [
      {
        activeAgent: 'researcher',
        status: 'Scoping',
        chat: {
          sender: 'User',
          message: 'Analyze competitor agentic frameworks on GitHub and arXiv. Draft a SWOT analysis.',
          role: 'user',
          avatar: 'U',
        },
        terminal: [
          '[Engine] Session started for workspace: "market-intel"',
          '[Engine] Agent "Lead Researcher" active.',
          '[Lead Researcher] Scoping study target: Multi-Agent coordination systems.',
        ],
      },
      {
        activeAgent: 'searcher',
        status: 'Searching',
        chat: {
          sender: 'Assistant',
          message: 'Activating Search Specialist. I am querying recent papers on arXiv and checking GitHub repository readmes.',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[Search Specialist] Calling tool: search_web --query="multi agent frameworks arxiv"',
          '[Tool: search_web] Retrieved 42 papers. Filtering top 8.',
          '[Search Specialist] Calling tool: search_web --query="agent orchestration framework github"',
          '[Tool: search_web] Found 14 active projects. Extracting readmes.',
        ],
      },
      {
        activeAgent: 'synthesizer',
        status: 'Writing Report',
        chat: {
          sender: 'Assistant',
          message: 'I have compiled the data. The Synthesizer is now drafting the competitor report at reports/agent_frameworks_study.md.',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[Synthesizer] Synthesizing research data...',
          '[Synthesizer] Structuring SWOT matrix: latency, security, custom tools.',
          '[Synthesizer] Calling tool: write_file --path=reports/agent_frameworks_study.md',
          '[Tool: write_file] File reports/agent_frameworks_study.md written (485 lines).',
        ],
      },
      {
        activeAgent: 'researcher',
        status: 'Reviewing',
        chat: {
          sender: 'Assistant',
          message: 'The SWOT study is complete. Lead Researcher has validated the contents. It is ready for delivery.',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[Lead Researcher] Reading and auditing reports/agent_frameworks_study.md...',
          '[Lead Researcher] Validating figures and comparisons.',
          '[Lead Researcher] Report approved.',
          '[Engine] Mission marked COMPLETE. Persisting final report.',
        ],
      },
    ],
  },
  {
    name: 'Repair CI Build',
    icon: '🚀',
    sidebarActiveIndex: 4, // Scheduled Tasks
    crew: [
      { id: 'cibot', name: 'CI Pipeline Bot', role: 'CI Monitor' },
      { id: 'developer', name: 'Go Developer', role: 'Backend Dev' },
    ],
    steps: [
      {
        activeAgent: 'cibot',
        status: 'Alert Scan',
        chat: {
          sender: 'User',
          message: 'Build #394 is failing. Inspect the logs and resolve the handler compilation issue.',
          role: 'user',
          avatar: 'U',
        },
        terminal: [
          '[Engine] Session started for workspace: "ci-pipeline"',
          '[Engine] Agent "CI Pipeline Bot" triggered on event: push_failed',
          '[CI Pipeline Bot] Scanning build logs...',
          '[CI Pipeline Bot] Found compilation error: undefined type "UserSession" in internal/api/handlers.go:124.',
        ],
      },
      {
        activeAgent: 'developer',
        status: 'Debugging File',
        chat: {
          sender: 'Assistant',
          message: 'CI Bot found the syntax error in handlers.go:124. Go Developer is investigating. It seems "UserSession" was renamed to "AgentSession".',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[Go Developer] Calling tool: view_file --path=internal/api/handlers.go --start=115 --end=135',
          '[Tool: view_file] Line 124: session := context.Value("session").(*UserSession)',
          '[Go Developer] Refactor search: structure "UserSession" was renamed to "AgentSession" in internal/types/types.go.',
          '[Go Developer] Calling tool: replace_file_content --path=internal/api/handlers.go',
          '[Tool: replace_file_content] Replaced 1 occurrence of "UserSession" with "AgentSession".',
        ],
      },
      {
        activeAgent: 'developer',
        status: 'Verifying Build',
        chat: {
          sender: 'Assistant',
          message: 'The structure references are corrected. Go Developer is running a local compilation to verify.',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[Go Developer] Running command: go build ./...',
          '[Command] Compiling package: internal/api',
          '[Command] Build successful. 0 errors, 0 warnings.',
          '[Go Developer] Local verification passed. Re-triggering CI pipeline.',
        ],
      },
      {
        activeAgent: 'cibot',
        status: 'Deploying Build',
        chat: {
          sender: 'Assistant',
          message: 'Local build is green. CI Bot is rebuilding the staging Docker container image and deploying container to staging. Pipeline is green!',
          role: 'assistant',
          avatar: 'N',
        },
        terminal: [
          '[CI Pipeline Bot] Calling tool: run_command --cmd="docker build -t seshat-api:latest ."',
          '[Tool: run_command] Step 1/12 : FROM golang:1.21-alpine',
          '[Tool: run_command] Step 12/12 : CMD ["./seshat-api"]',
          '[Tool: run_command] Successfully tagged seshat-api:latest.',
          '[CI Pipeline Bot] Deploying container image to ECS staging...',
          '[CI Pipeline Bot] Deploy successful. Health checks: 2/2 PASS.',
          '[Engine] Staging pipeline is GREEN. Workspace session closed.',
        ],
      },
    ],
  },
]

export default function AgentSimulator() {
  const [activeMissionIndex, setActiveMissionIndex] = useState(0)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)

  const mission = MISSIONS[activeMissionIndex]
  const currentStep = mission.steps[currentStepIndex]

  // Autoplay
  useEffect(() => {
    if (!isPlaying) return

    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= mission.steps.length - 1) {
          return 0
        }
        return prev + 1
      })
    }, 4500 / speed)

    return () => clearInterval(timer)
  }, [isPlaying, activeMissionIndex, speed, mission.steps.length])

  const handleMissionChange = (index: number) => {
    setActiveMissionIndex(index)
    setCurrentStepIndex(0)
  }

  const handleSpeedToggle = () => {
    setSpeed((prev) => (prev === 1 ? 2 : 1))
  }

  const handlePlayToggle = () => {
    setIsPlaying((prev) => !prev)
  }

  const handleStepForward = () => {
    setIsPlaying(false)
    setCurrentStepIndex((prev) => (prev >= mission.steps.length - 1 ? 0 : prev + 1))
  }

  // Accumulated chat message items
  const chatLog = mission.steps.slice(0, currentStepIndex + 1).map((s) => s.chat)

  // Accumulated terminal outputs
  const terminalLogs: string[] = []
  mission.steps.slice(0, currentStepIndex + 1).forEach((s) => {
    terminalLogs.push(...s.terminal)
  })

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.titleArea}>
          <p className="section-label">Seshat in action</p>
          <h2 className={styles.title}>Simulated Agent Crew Workspace</h2>
          <p className={styles.sub}>
            Watch how a team of specialized agents collaborates using explicit communication,
            calling tools, and maintaining a minimal shared mission memory.
          </p>
        </div>

        {/* Tabs */}
        <div className={styles.missionTabs}>
          {MISSIONS.map((m, index) => (
            <button
              key={m.name}
              onClick={() => handleMissionChange(index)}
              className={`${styles.missionTab} ${activeMissionIndex === index ? styles.missionTabActive : ''}`}
            >
              <span style={{ marginRight: '0.4rem' }}>{m.icon}</span>
              {m.name}
            </button>
          ))}
        </div>

        {/* Dashboard window representing Nexus */}
        <div className={styles.dashboard}>
          {/* Top Address/Control Bar */}
          <div className={styles.windowBar}>
            <div className={styles.dots}>
              <div className={`${styles.dot} ${styles.dotRed}`} />
              <div className={`${styles.dot} ${styles.dotYellow}`} />
              <div className={`${styles.dot} ${styles.dotGreen}`} />
            </div>
            
            <div className={styles.addressBar}>
              nexus-desktop://workspaces/agent-crew
            </div>

            <div className={styles.controls}>
              <button
                onClick={handlePlayToggle}
                className={styles.controlBtn}
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
              >
                {isPlaying ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="4" height="16" />
                    <rect x="16" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleStepForward}
                className={styles.controlBtn}
                title="Next Step"
                aria-label="Next step in simulation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20" />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </button>
              <button
                onClick={handleSpeedToggle}
                className={styles.controlBtn}
                title="Toggle Speed"
                aria-label="Toggle simulation speed"
                style={{ fontSize: '0.65rem', fontWeight: 700 }}
              >
                {speed}x
              </button>
            </div>
          </div>

          {/* Real 3-column replica of Nexus Dashboard */}
          <div className={styles.grid}>
            {/* COLUMN 1: Collapsible Sidebar */}
            <div className={styles.sidebar}>
              <div className={styles.sbBrandSection}>
                <svg className={styles.sbLogoSvg} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 6 10 Q 16 18 26 10" stroke="var(--brand-engine-start)" strokeWidth="2" fill="none" />
                  <circle cx="16" cy="19" r="3" fill="#fff" />
                  <line x1="16" y1="19" x2="16" y2="11.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <circle cx="16" cy="11.5" r="2" fill="#fff" />
                </svg>
                <span className={styles.sbBrandName}>Nexus</span>
              </div>

              <div className={styles.sbNavList}>
                <button className={`${styles.sbNavItem}`}>
                  <span>New Chat</span>
                </button>
                <button className={`${styles.sbNavItem} ${mission.sidebarActiveIndex === 2 ? styles.sbNavItemActive : ''}`}>
                  <span>Teams</span>
                </button>
                <button className={`${styles.sbNavItem}`}>
                  <span>Skills Creator</span>
                </button>
                <button className={`${styles.sbNavItem} ${mission.sidebarActiveIndex === 4 ? styles.sbNavItemActive : ''}`}>
                  <span>Scheduled Tasks</span>
                </button>
                <button className={`${styles.sbNavItem} ${mission.sidebarActiveIndex === 5 ? styles.sbNavItemActive : ''}`}>
                  <span>Workspace</span>
                </button>
              </div>

              <div className={styles.sbSectionTitle}>Recents</div>
              <div className={styles.sbRecents}>
                <button className={`${styles.sbRecentLink} ${activeMissionIndex === 0 ? styles.sbRecentLinkActive : ''}`} onClick={() => handleMissionChange(0)}>
                  # Deploy RAG API
                </button>
                <button className={`${styles.sbRecentLink} ${activeMissionIndex === 1 ? styles.sbRecentLinkActive : ''}`} onClick={() => handleMissionChange(1)}>
                  # Competitor Study
                </button>
                <button className={`${styles.sbRecentLink} ${activeMissionIndex === 2 ? styles.sbRecentLinkActive : ''}`} onClick={() => handleMissionChange(2)}>
                  # Repair CI Build
                </button>
              </div>

              <div className={styles.sbFooter}>
                <span className={styles.sbFooterBtn}>Settings</span>
                <div className={styles.sbAvatar}>N</div>
              </div>
            </div>

            {/* COLUMN 2: Chat Pane */}
            <div className={styles.chatPanel}>
              <div className={styles.chatHeader}>
                <select className={styles.modelSelect} defaultValue="anthropic">
                  <option value="anthropic">anthropic / claude-3.5-sonnet</option>
                  <option value="openai">openai / gpt-4o</option>
                  <option value="gemini">google / gemini-1.5-pro</option>
                </select>
                
                <button className={styles.panelActionBtn}>
                  <span>Agent Monitor</span>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
                </button>
              </div>

              <div className={styles.chatMessages}>
                {chatLog.map((chat, idx) => {
                  const isUser = chat.role === 'user'
                  return (
                    <div key={idx} className={`${styles.messageRow} ${isUser ? styles.messageUser : ''}`}>
                      <div className={`${styles.msgAvatar} ${isUser ? styles.msgAvatarUser : ''}`}>
                        {chat.avatar}
                      </div>
                      <div className={styles.msgBubble}>
                        {chat.message}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className={styles.chatInputArea}>
                <div className={styles.inputWrapper}>
                  <input
                    type="text"
                    className={styles.inputField}
                    placeholder="Message Seshat..."
                    readOnly
                  />
                  <button className={styles.sendBtn} aria-label="Send message">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="3 22 21 12 3 2 3 10 16 12 3 14" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* COLUMN 3: Right Panel Host (Agent Monitor) */}
            <div className={styles.monitorPanel}>
              <div className={styles.monitorHeader}>
                <span className={styles.monitorTitle}>Agent Monitor</span>
                <div className={styles.statusIndicator}>
                  <div className={styles.pulseLight} />
                  <span>RUNNING</span>
                </div>
              </div>

              <div className={styles.monitorContent}>
                {/* Active Sub-agents list */}
                <div className={styles.agentList}>
                  {mission.crew.map((c) => {
                    const isActive = currentStep.activeAgent === c.id
                    return (
                      <div key={c.id} className={styles.agentRow}>
                        <div className={`${styles.agentDot} ${isActive ? styles.agentDotActive : ''}`} />
                        <div>
                          <span className={styles.agentName}>{c.name}</span>
                          <span style={{ fontSize: '0.65rem', color: '#6e6a62', marginLeft: '0.4rem' }}>({c.role})</span>
                        </div>
                        {isActive && (
                          <span className={styles.agentStatus}>{currentStep.status}</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* gRPC execution stream */}
                <div className={styles.terminalBody}>
                  {terminalLogs.map((line, idx) => {
                    let lineClass = styles.terminalLine
                    if (line.startsWith('[Tool:')) {
                      lineClass = `${styles.terminalLine} ${styles.terminalLineBlue}`
                    } else if (line.startsWith('[Engine]')) {
                      lineClass = `${styles.terminalLine} ${styles.terminalLineComment}`
                    } else if (line.includes('PASS') || line.includes('successful') || line.includes('complete') || line.includes('approved')) {
                      lineClass = `${styles.terminalLine}` // uses green standard
                    } else if (line.includes('failed') || line.includes('FAILED') || line.includes('error') || line.includes('ERROR')) {
                      lineClass = `${styles.terminalLine} ${styles.terminalLineOrange}`
                    } else if (line.startsWith('[Command]')) {
                      lineClass = `${styles.terminalLine} ${styles.terminalLineWhite}`
                    }
                    return (
                      <div key={idx} className={lineClass}>
                        {line}
                      </div>
                    )
                  })}
                  <div className={styles.terminalLine}>
                    <span className={styles.terminalCursor} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
