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
- Future desktop or computer automation

These tools should eventually connect to a session-scoped live surface so the user can watch the agent work without making the chat transcript noisy.

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

## Product Direction

The browser should become a real embedded browser, isolated per chat session when possible. Terminal and file edit tools should also become live surfaces, while the rest should remain compact so SeshatOS keeps the clean Manus-like workspace without losing the richer Seshat tool trace.
