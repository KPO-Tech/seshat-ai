# DONE Criteria

Each application has to pass a concrete gate before the next one becomes active.

## Shared DONE Gate

An application is DONE only when:

- UI is fully migrated to Tailwind where practical.
- No old app-specific CSS remains except justified third-party overrides.
- Dark and light themes are coherent.
- Supported desktop window sizes work.
- Loading states exist.
- Empty states exist.
- Error states exist.
- Keyboard interactions are not broken.
- Important flows are manually checked.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Related tests pass or test gaps are documented.

## Chat DONE Gate

Chat is DONE only when:

- conversation rendering is stable
- streaming is stable
- tool blocks are coherent
- tool errors are readable
- quiet tool groups are understandable
- attachments work
- PDF/DOCX/PPTX/XLSX previews work
- image lightbox works
- right panel works
- provider selection works
- model selection works
- web tool display works
- Knowledge search can be used from Chat
- session history works
- session resume works
- stop/cancel behavior works
- permissions prompts are coherent
- mobile/narrow desktop width does not break basic layout
- no Chat-specific injected CSS remains

## Settings DONE Gate

Settings is DONE only when:

- account/provider/knowledge/network/memory/admin views use the same primitives
- forms are consistent
- save/loading/error states are clear
- settings changes persist
- destructive actions have clear confirmation

## Admin DONE Gate

Admin is DONE only when:

- teams/users/memberships are coherent
- provider settings are coherent
- desktop policies are coherent
- connector OAuth apps are coherent
- capability links are coherent
- audit/security states are visible where needed

## Knowledge UI DONE Gate

Knowledge UI is DONE only when:

- corpus list works
- upload works
- ingestion progress is visible
- search works
- source preview works
- connector sources are understandable
- ACL/freshness status is visible where available
- citations/provenance are easy to inspect

