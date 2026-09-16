> **Archived 2026-09-16.** The IA regroup this describes shipped, but naming has since drifted (e.g. "AI Config" became "AI Core" — see `docs/console-guides/` for the current structure). Kept for historical context.

---

# Seshat Console — Target Information Architecture

Updated 2026-07-14 after a direct code audit of `seshat-console` and a product-direction clarification: this console is not a general-purpose desktop UI, and not a temporary internal CRUD tool. It is the enterprise control plane for organizations that use `seshat-ui` through `seshat-backend` + `seshat-server`.

## Product role

`seshat-console` is the web control plane for:

- platform admins operating the shared Seshat cloud
- organization admins managing their own teams, AI configuration, automation, knowledge, and integrations

It must therefore feel closer to a scoped control plane (`platform` -> `organization`) than to a flat admin dashboard made of unrelated list pages.

## Design principles

1. Scope first, resource second.
   - Users think "I am managing the platform" or "I am managing Acme Corp", not "I am visiting MembershipsPage.tsx".
2. Organization context belongs in the URL and shell.
   - `OrganizationPicker` inside every page is a fallback pattern, not the target architecture.
3. Navigation should expose a small number of business spaces.
   - Dense CRUD screens are fine inside a space.
   - They should not all sit at the same navigation depth.
4. The console should be simpler than GCP/Azure, not smaller in ambition.
   - Reuse their strengths: scope, grouping, explicit context, operational clarity.
   - Avoid their weaknesses: too many first-level entries, hidden product logic, accidental complexity.

## Top-level scopes

### Platform

Audience:
- Seshat platform admins

Responsibilities:
- global tenancy
- platform-wide users
- fallback AI defaults
- security oversight

Routes:
- `/platform/overview`
- `/platform/organizations`
- `/platform/users`
- `/platform/ai-defaults/providers`
- `/platform/ai-defaults/embedder`
- `/platform/security/sessions`
- `/platform/security/audit`

### Organization

Audience:
- organization owners/admins

Responsibilities:
- team and access control
- org-specific AI configuration
- automation
- knowledge corpora
- integrations
- activity monitoring

Canonical route prefix:
- `/orgs/:organizationId/...`

Routes:
- `/orgs/:organizationId/overview`
- `/orgs/:organizationId/team/memberships`
- `/orgs/:organizationId/team/invitations`
- `/orgs/:organizationId/team/groups`
- `/orgs/:organizationId/team/roles`
- `/orgs/:organizationId/team/policies`
- `/orgs/:organizationId/ai/provider-settings`
- `/orgs/:organizationId/ai/embedder`
- `/orgs/:organizationId/automation/devices`
- `/orgs/:organizationId/automation/jobs`
- `/orgs/:organizationId/automation/runs`
- `/orgs/:organizationId/knowledge/corpora`
- `/orgs/:organizationId/knowledge/corpora/:corpusId`
- `/orgs/:organizationId/integrations/applications`
- `/orgs/:organizationId/integrations/providers`
- `/orgs/:organizationId/activity/audit`

## Screen regrouping

The current console is already strong at page-level CRUD execution. The main issue is grouping, not implementation quality.

### Keep as standalone platform screens

- Organizations
- Users
- Sessions
- Audit

### Regroup under organization spaces

#### Team & Access

Contains:
- Memberships
- Invitations
- Groups
- Roles
- Policy Bindings

Rationale:
- one mental model: "who has access, and why?"

#### AI Config

Contains:
- Provider Settings
- Embedder Settings

Rationale:
- both define how this org uses AI services
- they should be discovered together

#### Automation

Contains:
- Devices
- Jobs
- Runs

Rationale:
- device fleet and job execution are one operational story

#### Knowledge

Contains:
- Corpora
- Corpus detail

Rationale:
- one domain, one operational space

#### Integrations

Contains:
- Applications
- Providers

Rationale:
- inbound/outbound identity and application connectivity belong together

#### Activity

Contains:
- Audit events

Rationale:
- this is the org-level operational trace

## Shell model

### Sidebar

The sidebar should not list every resource page as a first-level item.

It should contain:

1. Brand
2. Platform navigation
3. Current organization selector
4. Organization navigation (only when an organization is active)

### Header

The header should communicate:

- current scope (`Platform` or organization name)
- current section (`Automation`, `AI Config`, etc.)
- current user session

### Secondary navigation

Within a section, use a secondary nav strip for sibling pages:

- Team & Access: Memberships / Invitations / Groups / Roles / Policies
- AI Config: Provider Settings / Embedder
- Automation: Devices / Jobs / Runs
- Integrations: Applications / Providers
- Platform AI Defaults: Providers / Embedder
- Platform Security: Sessions / Audit

## Why this is better than the current flat model

- fewer first-level choices
- organization context is explicit and bookmarkable
- easier future expansion when org-admin self-service becomes real
- closer to enterprise control-plane expectations
- retains the existing implementation investment instead of replacing every CRUD screen

## Migration strategy

1. Keep the existing page components where possible.
2. Move organization context into `/orgs/:organizationId/...` routes.
3. Make the shell context-aware.
4. Remove repeated in-page organization pickers from org-scoped screens.
5. Keep legacy redirects temporarily so existing links do not break immediately.
