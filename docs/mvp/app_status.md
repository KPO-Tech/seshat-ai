# Application Status

Current status for the MVP frontend.

| Surface | Status | Notes |
| --- | --- | --- |
| Chat | ACTIVE | Main product surface. Finish first. |
| Settings | LOCKED | Next after Chat is DONE. |
| Admin Panel | ACTIVE | Unlocked ahead of order by explicit decision - built in parallel with Chat/Settings. |
| Skills Creator | LOCKED | MVP surface after Admin. |
| Knowledge UI | LOCKED | UI is last MVP surface, but Knowledge capability stays available to Chat. |
| Automation, Scheduling | NOT IN SESHATOS | Scheduled work lives in SeshatCloud only; the local code was removed on 2026-10-08. |
| Inbox | POST_MVP | Frozen. Avoid chatbot-per-page expansion. |
| Companion | POST_MVP | Frozen. |
| Team | POST_MVP | Frozen. |
| Store | ACTIVE | Unlocked by explicit decision - SeshatOS's own app catalog (Play Store/Microsoft Store style). Ships as a catalog of active vs. coming-soon platforms; each entry activates as its real platform lands. |
| Other surfaces | POST_MVP | Frozen unless explicitly promoted. |

## Current Focus

Chat is the active surface.

While Chat is active, allowed work includes:

- shared components needed by Chat
- layout/shell/right-panel primitives needed by Chat
- tool display
- message rendering
- attachments and previews
- Knowledge capability used by Chat
- provider/model selection
- session correctness
- error/loading/empty states

Avoid unrelated work in:

- Inbox UI
- Companion UI
- Team UI
- new vertical agents
- new workflow nodes
- new connector surfaces

