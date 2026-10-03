# SeshatOS — Project Goals

This document describes what SeshatOS is building, where the project is going, and how contributions fit into the roadmap. It is the reference for anyone who wants to understand the direction of the project or get involved.

---

## 🧭 What We Are Building

**SeshatOS is an Agentic Workspace** — a self-hosted, open platform where humans and AI agents work together to build, research, automate, and create.

It is built on two open-source repositories:

- 🔧 **[seshat](https://github.com/KPO-Tech/seshat)** (Apache 2.0) — the Go agent runtime: multi-turn execution, tools, permissions, providers, MCP, RAG, skills, sub-agents, streaming. Ships a CLI tool developers can use directly.
- 🏗️ **[seshat-ai](https://github.com/EngineerProjects/seshat-ai)** (AGPL-3.0) — the production platform on top: multi-user auth, organizations, workspaces, REST API, sessions, memory, plans, skills, scheduler, knowledge base, audit — and the desktop application.

The dependency is strictly one-way: seshat-ai builds on seshat. seshat has no knowledge of seshat-ai.

---

## 📍 Development Levels

The project is organized into levels of ambition. Each level builds on the previous one. We do not start a level before the one below it is stable.

### 🟢 Level 2 — Robust Solo-Agent Platform (NOW)

A capable, safe, production-grade agent platform that any developer or team can deploy today.

**What exists:**
- ⚙️ Multi-turn agent loop with tool use, recovery, compaction, and permission modes
- 🌍 7 AI providers switchable per session with automatic fallback
- 🛡️ Sandboxed bash, filesystem, web, browser, RAG, MCP, sub-agents, skills
- 👥 Multi-user backend: auth, organizations, workspaces, API keys, quotas, audit log
- 📡 REST API + SSE streaming + Anthropic-compatible `/v1/messages` endpoint
- 📚 Knowledge base: hybrid BM25 + vector search, file ingestion
- ⏰ Scheduled tasks, memories, plans, MCP server management
- 🖥️ Desktop app: chat, tool views, plan editor, settings, skills creator (rebuilding as `seshat-desktop`, Chat-first, replacing `seshat-ui`)

**What we are finishing:**
- 🔭 OpenTelemetry tracing (per session / per turn / per tool call)
- 🔌 MCP spec conformance (November 2025: async tasks, elicitation)
- 📦 Go SDK: stable contract, versioned SSE events, documented with examples
- 🔒 Security hardening: sandbox read isolation, CORS hardening, session expiry
- ✨ `seshat-desktop` (the `seshat-ui` rebuild) stabilized on Chat, its first essential user path

**Gate to Level 3:** Level 2 is stable with real users. No open critical issues.

---

### 🔵 Level 3 — Agent Team Runtime (NEXT)

Multiple full SeshatOS agents collaborating on a shared mission. Not a pipeline — a real team where each agent has a role, a private memory, and shared tools to coordinate.

```
Mission: "Build and ship the authentication feature"

Alex (CEO)    → reads mission → posts tasks on the board
Jordan (CTO)  → claims architecture → mails design to Sam
Sam (Dev)     → claims implementation → codes → spawns test workers
Taylor (QA)   → reviews → sends bugs back to Sam
Robin (DevOps)→ claims deploy → ships → marks mission complete
```

Each agent is a complete Level 2 agent. Coordination happens through shared tools: `send_mail`, `read_mail`, `post_task`, `claim_task`, `complete_task`. No central orchestrator — each agent decides its own actions based on its inbox, the task board, and its role skills.

**What this unlocks:**
- 🚀 Entire projects executed by agent teams with human supervision
- 🎭 Roles defined by skills — each agent works in its domain
- 🧠 Shared memory (team decisions) + private memory per agent
- 💰 Mandatory budget enforcement: token limits per agent, global timeout per mission

Early experimentation and RFCs on Level 3 are welcome from the community. The constraint is that no Level 3 code merges into the main platform before Level 2 is production-stable.

---

### 🟣 Level 4 — Multimodal & Extended Workspaces (FUTURE)

SeshatOS expands beyond text and code into all modalities and domains of work.

- 🎨 **Image generation** — agents that generate, edit, and compose images inline. Pluggable backends (Stable Diffusion, FLUX, cloud APIs).
- 🎙️ **Audio** — text-to-speech, speech-to-text, transcription, voice narration. Agents that can listen and speak.
- 🧊 **3D generation** — asset generation from text or image prompts for design, prototyping, and creative work.
- 💡 **Brainstorming & prototyping** — a dedicated workspace mode for structuring ideas, building concept maps, and iterating on designs before committing to implementation.
- 🎓 **Learning environment** — an AI-native space for education: agents that teach, quiz, adapt to the learner's pace, and generate exercises. This will be developed as a separate open-source project (`seshat-learn`) with its own community, then integrated into the platform.
- 🌐 **The multi-workspace desktop** — at full maturity, the SeshatOS Desktop is not a single application. It is an environment containing multiple specialized workspaces (code, research, creation, learning, team missions), each powered by agents, all sharing the same runtime, auth, and data layer.

---

## 🌍 Community & Extensibility

SeshatOS cannot build everything. The platform is designed so the community can.

- ⚡ **Skills** are the primary extension mechanism — a Markdown file that teaches the agent how to work in a specific context. Anyone can write and publish skills. The official collection is [seshat-skills](https://github.com/EngineerProjects/seshat-skills); community repos are installable from any URL.
- 🔌 **MCP servers** extend what agents can do. The MCP ecosystem has 10,000+ servers (GitHub, Postgres, Slack, Docker, Notion, and more). SeshatOS is a first-class MCP client — any MCP server works immediately.
- 🤖 **Custom agents** — users define specialized agents with their own system prompts, tools, permission modes, and models.
- 📦 **The SDK** — [seshat](https://github.com/KPO-Tech/seshat) ships a Go SDK and a stable HTTP + SSE API. seshat-ai is itself a consumer of that SDK. Developers can build their own products on top.

We actively want the community to push SeshatOS into directions we have not imagined. The architecture (skills, MCP, pluggable providers, SDK) is designed to accommodate this.

---

## 🚫 What SeshatOS Is Not

These are deliberate scope boundaries, not limitations:

- **Not a no-code workflow builder.** SeshatOS agents reason; they don't follow fixed rules.
- **Not a single-provider tool.** Multi-provider with no lock-in is a core architectural commitment.
- **Not a Python/TypeScript framework.** seshat is a Go runtime consumed via API or SDK.
- **Not a fully-managed cloud SaaS.** SeshatOS is self-hosted first.
- **Not a chatbot.** The agent executes things: reads files, writes code, runs commands, searches the web.

---

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.

The most valuable contributions right now:
- 📝 Skills for seshat-skills (any domain, any framework, any workflow)
- 🔌 MCP server integrations and documentation
- 🐛 Bug reports and fixes on the Level 2 platform
- 🧪 RFCs and early experiments on Level 3 (team runtime)
- 📖 SDK examples and documentation

PRs target `dev`, never directly `main`.
