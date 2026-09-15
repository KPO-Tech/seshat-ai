# Agent Instructions - seshat-desktop

`seshat-desktop` is the clean SeshatOS desktop client.

Keep the boundary simple:

- frontend: Electron, React, TypeScript, Tailwind CSS;
- backend/runtime: Go services called through REST, SSE, and IPC-safe bridges;
- no direct database access from the renderer;
- no backend policy copied into React;
- no broad import from `seshat-ui` without rewriting the touched surface.

Migration order:

1. Rebuild Chat first.
2. Reintroduce API clients/types only when needed by Chat.
3. Keep Settings/Admin/Scheduling/Skills Creator/Knowledge UI locked until Chat is good enough.
4. Keep Automation/Inbox/Companion/Team post-MVP unless the MVP docs say otherwise.

Before editing, check `D:\Documents\PROJECTS\ai\Discussions\mvp`.
