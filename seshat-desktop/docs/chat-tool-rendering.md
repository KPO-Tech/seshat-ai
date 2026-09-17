# Chat Tool Rendering

SeshatOS renders tools by intent, not by a single universal card.

## Rendering Rule

- Observable tools use live workspaces.
- Informational tools use compact, collapsible tool cards.
- Delegated tools use agent activity cards.

## Tool Families

Observable tools are actions where watching the workspace matters:

- Browser navigation and automation
- Terminal commands
- File edits and patches
- Live task checklists
- Future desktop or computer automation

These tools should eventually connect to a session-scoped live surface so the user can watch the agent work without making the chat transcript noisy.

Task tools share a session-scoped checklist. `task.changed` events update it immediately, while structured tool-result metadata restores it when a session is reopened. Todo tasks remain separate from delegated agents and background process activity.

Informational tools are fast or mostly data-oriented:

- Web search
- Knowledge retrieval
- Memory lookups
- API reads
- Classification and routing

These stay as compact cards with optional input and result details.

Delegated tools represent another agent or workflow doing work:

- Sub-agents
- Planner or executor handoffs
- Long-running delegated jobs

These render as activity cards that can later expand into a richer trace.

Sub-agent cards track the delegated lifecycle separately from the outer tool call. A completed `spawn_agent` dispatch remains active until the runtime reports `subagent_finished`, failure, or cancellation. Nested turn, response, and tool-progress events update the agent activity in real time.

## Product Direction

The browser should become a real embedded browser, isolated per chat session when possible. Terminal and file edit tools should also become live surfaces, while the rest should remain compact so SeshatOS keeps the clean Manus-like workspace without losing the richer Seshat tool trace.
