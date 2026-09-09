# Companion App

Companion is the focused platform for creating, editing, deleting, and launching
custom agents.

Applied structure:

- `index.tsx` exposes the public app entrypoint.
- `pages/CompanionPage.tsx` owns page-level orchestration: loading agents,
  launching conversations, modal state, and create/update/delete handlers.
- `components/AgentCards.tsx` owns platform, user, and create cards.
- `components/AgentModal.tsx` owns the create/edit form.
- `components/DeleteConfirm.tsx` owns destructive confirmation UI.
- `components/ToastStack.tsx` owns local toast rendering.
- `hooks/useToast.ts` owns transient local notifications.
- `lib/companionForm.ts` owns form defaults and agent/form/API conversions.
- `styles/companion.css` owns the app stylesheet.
