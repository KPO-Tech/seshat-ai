# Seshat Concepts

This document fixes the vocabulary used in the MVP.

The goal is to avoid calling everything an agent.

## Runtime

Definition:

The runtime is the execution environment. It provides the primitives that make
agents, tools, services and workflows run.

Responsibilities:

- session lifecycle
- agent loop
- provider calls
- tool execution
- permissions
- sandbox
- context assembly
- memory infrastructure
- events and streaming
- MCP
- browser/web primitives
- monitoring
- storage hooks

Non-example:

- A runtime is not a large agent.
- A runtime does not own product policy.

## Agent

Definition:

An agent is an entity with a goal and the ability to choose actions dynamically.

Minimum requirements:

- goal
- instructions
- decision loop
- tool/action selection
- execution context
- termination condition

Optional properties:

- identity
- role
- memory
- task queue
- mailbox
- long-running ownership

Use an agent when the system must decide what to do next based on observations.

Do not create an agent for a simple one-shot function.

## Tool

Definition:

A tool is an atomic callable capability.

Examples:

- read_file
- write_file
- web_search
- knowledge_search
- gmail_send
- calendar_create_event
- browser_open

A tool does not make strategic decisions. It receives input, performs an action,
and returns a result.

## Skill

Definition:

A skill is a reusable composed capability. It has instructions and may use
multiple tools, but it does not require its own autonomous identity.

Examples:

- competitive research
- invoice analysis
- report writing
- code review method
- contract risk analysis

Use a skill when the main agent needs a reusable method, not a separate agent.

## Workflow

Definition:

A workflow is an explicit sequence of steps.

It can include LLM steps, but it is not automatically an agent.

Examples:

- incoming email classification
- nightly invoice extraction
- scheduled report generation
- document ingestion pipeline

Use a workflow when the path is mostly known in advance.

## Service

Definition:

A service is a durable infrastructure capability used by agents, tools or
workflows.

Examples:

- Knowledge
- Memory
- Files
- Search
- Embedding
- Reranking
- Document extraction
- Connector synchronization

Knowledge is a service, not an agent.

The main agent can use `knowledge_search`, but there should not be a separate
Knowledge Agent just for retrieval.

## Task

Definition:

A task is a concrete unit of work.

Examples:

- "Analyze these contracts and identify risky clauses."
- "Compare this PDF with the internal purchasing policy."
- "Research these competitors and prepare a table."

Tasks can be assigned to agents or created by workflows.

## Subagent Rule

Create a subagent only when at least one of these is true:

- the work is long
- the work can be parallelized
- the work needs its own context
- the work needs a different tool surface
- the work has an independent objective
- the work must produce a separate deliverable
- the work can continue while the parent does something else

Do not spawn a subagent for simple retrieval.

Example:

- "Analyze these 15 competitors" can spawn research subagents.
- "Find the HR policy" should call `knowledge_search`.

