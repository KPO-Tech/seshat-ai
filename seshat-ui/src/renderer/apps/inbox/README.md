# Inbox App

Inbox is the platform for connected messages, triage, drafting, account sync,
and future mailbox agents.

Target structure:

- `pages/` route-level screens.
- `components/` Inbox-specific UI pieces.
- `api/` Inbox-specific API wrappers and DTOs.
- `hooks/` Inbox-specific data hooks.
- `styles/` Inbox-specific scoped CSS.

Applied structure:

- `App.tsx` mounts the internal app router.
- `routes.tsx` owns Inbox routes.
- `api/types.ts` contains Inbox-specific DTOs/view types.
- `api/whatsappPairing.ts` owns the WhatsApp pairing stream used by Inbox and
  Settings.
- `pages/InboxPage.tsx` owns page-level orchestration: account loading, thread
  selection, provider/model preference, agent send/permission flows, and sync
  handlers.
- `components/InboxAgentPanel.tsx` owns the Inbox Agent chat surface.
- `components/ThreadListPane.tsx` owns the visible conversation list.
- `components/ThreadDetailPane.tsx` owns the selected conversation transcript
  and thread actions.
- `components/AccountsPanel.tsx` owns account cards, sync controls, and account
  summary metrics.
- `components/ConnectorsDrawer.tsx` owns connector selection.
- `components/WhatsAppPairingModal.tsx` owns WhatsApp QR pairing feedback.
- `components/StatusTile.tsx` owns small status/metric tiles.
- `lib/inboxDisplay.tsx` contains display metadata, formatting helpers, channel
  labels, and status tones.
- `lib/chatPreference.ts` contains persisted Inbox Agent model preference
  helpers.
- `lib/agentPrompt.ts` builds the Inbox Agent prompt from selected threads.
- `styles/inbox.css` owns the app stylesheet.
