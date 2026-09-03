# Seshat Console — user guide

What each page in the web admin console (`seshat-console`) is for and how to
use it. Written section by section, matching the redesign work tracked in
`docs/helps/console-ui-redesign.md` — a section is added here once its pages
have actually been reviewed and cleaned up, not before. Currently covers:
**Organization**.

Format note: started as plain Markdown rather than MDX or the public
website's TSX-based docs system (`website/src/pages/docs/content/`) - the
scope and audience (internal reference vs. public customer docs) weren't
settled yet when this was written. Easy to port into either later; the
content is what matters first.

---

## Organization

The sidebar group covering who's in this organization, what they can do,
and what's happened. Everyone with any access to the console can see
these pages; most of the actions on them require the `organization.manage`
permission (an org admin/owner, by default).

### Overview

**What it's for:** a one-screen health check for the organization — is it
fully set up, is anything broken, what's happened recently.

**What's on it:**
- Five counters: Team Members, Pending Invites, Automation Jobs, Worker
  Devices, Knowledge Corpora.
- **Needs Attention** — only appears when something is actually missing:
  an incomplete organization profile, no AI provider credentials
  configured, no embedder configured, or automation jobs that exist with
  no worker device to run them on. Each alert has a button that jumps
  straight to the relevant settings page. If nothing is missing, this
  section just says so.
- **Setup Status** — a permanent checklist (Profile & Branding, AI
  Credentials, Embedder & Search, Integrations & Apps) showing what's
  configured and what's inherited from the platform default.
- **Recent Activity** — the last few audit events for this org (a
  shortcut into the fuller Activity → Audit page).
- **Recent runs** — the last few automation job executions.

**How to use it:** click "Edit Organization" (top right) to change the
name, slug, description, support email, or website. Everything else here
is read-only navigation into the page that actually manages it.

### Team & Access

Five tabs, reached from the same sub-nav: Memberships, Teams, Invitations,
Roles, Policies.

#### Memberships

**What it's for:** everyone who currently has direct access to this
organization, and what role each of them has.

**How to use it:**
- **Add member** — either pick an existing platform user (search by
  email) and assign them a role, or create a brand-new account in one
  step (they get an email to set their own password; nobody in the
  organization ever sees or sets it for them).
- **Change a role** — use the role dropdown directly in the table row.
  Takes effect immediately, no separate save step.
- **Confirm** — a checkmark appears only on rows still marked "pending";
  click it to finalize that membership.
- **Remove** — the trash icon. Blocked by the API if it would leave the
  organization with no owner at all.

#### Teams

**What it's for:** grouping members for policy assignment and general
structure. A member can belong to any number of teams, or none — teams
are optional.

**How to use it:** "New team" needs a name and a slug (the slug fills in
automatically as you type the name, using a lowercase-hyphenated version
of it — edit it yourself if you want something different; once a team
exists, its slug never auto-changes again since other things may already
reference it). Description is optional, capped at 200 characters and
shown as its own column in the list (hover a truncated one for the full
text). Members can be added right in the same form, either when creating
the team or later via Edit (which reopens the same form with the
current members pre-filled).

#### Invitations

**What it's for:** tracking *pending* access, as opposed to Memberships,
which only ever lists people who already have access. An invitation is a
promise of access by email; it becomes a membership once accepted.

**How to use it:** "Invite" — email, role, and how many days before it
expires (7 by default, up to 90). Use the status tabs (All / Pending /
Accepted / Revoked / Expired) to filter the list. A still-pending
invitation can be revoked with the stop icon; accepted/revoked/expired
ones have nothing left to do.

#### Roles

**What it's for:** named, reusable bundles of permissions. Four system
roles always exist — **owner**, **admin**, **member**, **viewer** — and
can't be edited, renamed, or deleted (no row actions appear for them).
An organization can also define its own custom roles.

**How to use it:** "New role" — a code (used internally, e.g. when a
policy binding targets this role — renaming it later cascades everywhere
it's referenced, so pick something stable up front), a display name, an
optional description (capped at 200 characters, shown in its own table
column), and which permissions it grants, picked from a checklist.

#### Policies (Policy Bindings)

**What it's for:** the actual mechanism that grants access — a policy
binding attaches a set of permissions to a *subject* (a specific user, an
entire team, or a role), optionally narrowed to one specific resource
(a single knowledge corpus or a single AI provider setting) instead of
applying organization-wide.

**How this relates to Roles:** assigning someone a Role (via Memberships)
is really just a convenient way to grant that role's whole permission
bundle at once. A policy binding can do the same thing more narrowly —
e.g. "give this one team read access to this one corpus" — without
touching anyone's role at all. Roles are the coarse, everyday tool;
policy bindings are for anything that needs to be scoped tighter than
"organization-wide."

**How to use it:** "New binding" — name, optional description (shown
directly under the name in the table, capped at 200 characters), the
subject type and the specific subject, the permissions to grant, and an
optional scope (leave as "Organization-wide" unless you're restricting
this grant to one specific corpus or provider setting).

### Activity

Two tabs: Audit, Chat Sessions.

#### Audit

**What it's for:** a chronological, append-only log of consequential
actions in this organization — logins, configuration changes, anything
that mutates state. Who did it, when, and to which resource.

**How to use it:** filter by action name (e.g. `login.succeeded`).
Nothing here can be edited or deleted — it's a record, not a management
surface.

#### Chat Sessions

**What it's for:** admin visibility into how much the organization's
members are using Workspace Chat (the personal AI chat every member has
in their own Workspace) — **metadata only**: who, when, the session
title, and how many messages. The actual conversation content is never
fetched here and stays private to the member who wrote it; they're the
only one who can open a session's real messages, from their own
Workspace → Chat.

**How to use it:** sort by "Last active" or "Started." Nothing to click
into — it's a read-only usage log.
