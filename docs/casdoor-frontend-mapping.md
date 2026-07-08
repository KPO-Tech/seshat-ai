# Casdoor Frontend Mapping For Seshat Server

## Goal

This document maps the most relevant Casdoor management screens to the current `seshat-server` control-plane API.
The objective is practical:

- identify which Casdoor screens can be reused quickly,
- identify where the data model mismatches are too large,
- define the next backend priorities before attempting a full frontend rebrand.

The analysis is based on the local Casdoor clone in:

- `/home/amiche/Projects/AI/ai/helps/casdoor/web/src/ManagementPage.js`
- `/home/amiche/Projects/AI/ai/helps/casdoor/web/src/backend/*.js`

## Executive Summary

Casdoor's admin frontend cannot be connected directly to the current `seshat-server` API without an adapter layer.
The main reason is not styling or routing. It is the data contract.

Casdoor expects:

- composite identities based on `owner/name`,
- list endpoints with pagination, filtering and sorting in a specific format,
- rich objects for `users`, `applications`, `providers`, `roles`, `invitations`,
- legacy endpoints like `/api/get-application`, `/api/update-user`, `/api/get-roles`, etc.

`seshat-server` currently exposes:

- REST-like `/api/v1/...` routes,
- opaque IDs for most resources,
- a smaller and cleaner domain model,
- only a subset of the management surface.

So there are two realistic integration strategies:

1. Build a Casdoor compatibility API layer in `seshat-server`.
2. Reuse Casdoor screens selectively and rewrite their data layer progressively.

For Seshat, option 2 is the better long-term path.
A thin compatibility layer may still be useful for a few high-value screens.

## Current Seshat Server Coverage

Current management endpoints in `seshat-server`:

- `GET /api/v1/auth/me`
- `GET/POST /api/v1/organizations`
- `GET/PUT /api/v1/organizations/{organizationID}`
- `GET/POST /api/v1/users`
- `GET /api/v1/roles`
- `GET/POST /api/v1/memberships`
- `GET/PUT /api/v1/memberships/{membershipID}`
- `GET/POST /api/v1/invitations`
- `GET /api/v1/invitations/{invitationID}`
- `POST /api/v1/invitations/accept`
- `POST /api/v1/invitations/{invitationID}/revoke`
- `GET /api/v1/audit-events`
- `GET/POST /api/v1/applications`
- `GET/PUT /api/v1/applications/{applicationID}`
- `GET/POST /api/v1/providers`
- `GET/PUT /api/v1/providers/{providerID}`

## Key Model Mismatches

### Identity shape

Casdoor management screens mostly identify records with `owner/name`.
Examples:

- organization: `admin/my-org`
- user: `my-org/alice`
- application: `my-org/my-app`
- provider: `my-org/google`
- role: `my-org/admin`

Seshat uses stable opaque IDs plus tenant fields such as `organization_id`.
That is a better backend design, but it means Casdoor pages cannot bind directly.

### List contract

Casdoor list backends expect a response style roughly like:

- `res.status`
- `res.data`
- `res.data2` for total count

Seshat uses cleaner JSON responses like:

- `{organizations: [...], count: N}`
- `{applications: [...], count: N}`

This is easy to adapt in a frontend wrapper, but not zero-cost.

### User model richness

Casdoor's user screens expect a much larger object than Seshat currently has.
Examples from `UserEditPage.js`:

- avatar
- phone
- countryCode
- affiliation
- title
- region
- address
- groups
- signupApplication
- multiFactorAuths
- applicationScopes
- transactions
- consents
- many profile-level flags

Seshat currently has a deliberately smaller IAM user model.

### Role model semantics

Casdoor roles are editable tenant resources with:

- `users`
- `groups`
- `roles`
- `domains`
- `isEnabled`

Seshat currently has a static role catalog plus memberships.
So Casdoor `RoleListPage` and `RoleEditPage` do not map to the current role design.

### Invitation semantics

Casdoor invitation objects are invitation-code centric:

- `code`
- `defaultCode`
- `quota`
- `usedCount`
- `application`
- `signupGroup`
- `username`
- `email`
- `phone`
- `state`

Seshat invitations are tenant access invites:

- `organization_id`
- `email`
- `role`
- `token`
- `status`
- `expires_at`

This is a product-level semantic mismatch, not just field renaming.

## Screen Mapping

### Tier A: Good Candidates For Early Reuse

These screens are conceptually close to the current backend and can be reused after a moderate data-layer rewrite.

#### Organizations

Casdoor references:

- `OrganizationListPage.js`
- `OrganizationEditPage.js`
- `backend/OrganizationBackend.js`

Current Seshat fit:

- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/{organizationID}`
- `PUT /api/v1/organizations/{organizationID}`

Compatibility assessment:

- list view: partial fit
- detail view: partial fit
- settings edit: partial fit

Notes:

- Casdoor organization pages are much larger than what Seshat currently supports.
- The basic admin block can be reused: name, slug, website, support email, description.
- Large parts should be hidden or removed initially: password policy, logo variants, MFA defaults, account item matrices, LDAP, transactions, theme-heavy configuration.

Recommendation:

- reuse the page shell and split it into smaller Seshat sections,
- do not try to keep the whole Casdoor organization form.

#### Applications

Casdoor references:

- `ApplicationListPage.js`
- `ApplicationEditPage.js`
- `backend/ApplicationBackend.js`

Current Seshat fit:

- `GET /api/v1/applications`
- `POST /api/v1/applications`
- `GET /api/v1/applications/{applicationID}`
- `PUT /api/v1/applications/{applicationID}`

Compatibility assessment:

- list view: partial fit
- detail view: partial fit
- edit view: partial fit

Notes:

- Seshat already has the essential admin slice: name, slug, display name, callback URL, homepage URL, provider bindings, generated credentials.
- Casdoor expects a much wider OAuth/OIDC/SAML surface: grant types, scopes, signin methods, signup schema, certificates, metadata export, theme controls.

Recommendation:

- reuse only the `basic` and `providers` sections first,
- defer advanced auth protocol sections until the backend is intentionally expanded.

#### Providers

Casdoor references:

- `ProviderListPage.js`
- `ProviderEditPage.js`
- `backend/ProviderBackend.js`

Current Seshat fit:

- `GET /api/v1/providers`
- `POST /api/v1/providers`
- `GET /api/v1/providers/{providerID}`
- `PUT /api/v1/providers/{providerID}`

Compatibility assessment:

- list view: partial fit
- detail view: partial fit
- edit view: partial fit

Notes:

- Current Seshat provider model supports a generic upstream provider: name, slug, kind, client credentials, issuer URL.
- Casdoor provider pages are much richer and category-specific: OAuth, email, SMS, SAML, storage, payment, notification, MFA, captcha, etc.

Recommendation:

- reuse the page structure but not the full provider category system,
- define a reduced Seshat provider taxonomy first.

#### Audit Events

Casdoor references:

- `RecordListPage.js`

Current Seshat fit:

- `GET /api/v1/audit-events`

Compatibility assessment:

- conceptual fit only

Notes:

- Casdoor records are request/response HTTP logs.
- Seshat currently stores domain audit events, not raw HTTP request logs.

Recommendation:

- build a Seshat-specific audit page inspired by Casdoor's table UX,
- do not try to fake Casdoor's exact `RecordListPage` schema.

### Tier B: Reusable Only After Backend Expansion

#### Users

Casdoor references:

- `UserListPage.js`
- `UserEditPage.js`
- `backend/UserBackend.js`

Current Seshat fit:

- `GET /api/v1/users`
- `POST /api/v1/users`

Missing backend capability:

- `GET /api/v1/users/{userID}`
- `PUT /api/v1/users/{userID}`
- `DELETE /api/v1/users/{userID}`
- user profile fields beyond email/display name/admin
- user-level session visibility
- user-level transactions/consents/MFA/groups
- impersonation

Compatibility assessment:

- list view: weak partial fit
- edit view: not ready

Recommendation:

- implement a Seshat user detail/update/delete slice before attempting Casdoor's user screens,
- keep the first Seshat user page much smaller than Casdoor's.

#### Invitations

Casdoor references:

- `InvitationListPage.js`
- `InvitationEditPage.js`
- `backend/InvitationBackend.js`

Current Seshat fit:

- `GET /api/v1/invitations`
- `POST /api/v1/invitations`
- `GET /api/v1/invitations/{invitationID}`
- `POST /api/v1/invitations/accept`
- `POST /api/v1/invitations/{invitationID}/revoke`

Missing backend capability for Casdoor parity:

- invitation code info lookup
- invitation send email action
- editable invitation quotas / used counts / application binding / signup group binding
- phone/username invitation payloads
- invitation update endpoint
- invitation delete endpoint

Compatibility assessment:

- list view: partial conceptual fit
- edit view: incompatible today

Recommendation:

- keep Seshat invitation semantics as organization-access invites,
- do not force Casdoor's invitation-code product model onto Seshat.

#### Sessions

Casdoor references:

- `SessionListPage.js`
- `backend/SessionBackend.js`

Current Seshat fit:

- no public session management endpoints yet

Missing backend capability:

- list sessions
- revoke one session
- revoke all sessions of a principal/user

Recommendation:

- implement Seshat-native session admin endpoints,
- then reuse the table idea from Casdoor, not its exact response contract.

### Tier C: Not Compatible With Current Seshat Direction

#### Roles

Casdoor references:

- `RoleListPage.js`
- `RoleEditPage.js`
- `backend/RoleBackend.js`

Current Seshat fit:

- `GET /api/v1/roles`

Why this does not fit yet:

- Casdoor roles are mutable tenant resources.
- Seshat roles are currently a static role catalog attached to memberships.
- Casdoor also assumes groups and role nesting.

Recommendation:

- do not port Casdoor role screens in the current phase,
- first decide whether Seshat wants dynamic roles at all.

#### Groups, Permissions, Models, Adapters, Enforcers

Casdoor references:

- `GroupListPage.js`
- `PermissionListPage.js`
- `ModelListPage.js`
- `AdapterListPage.js`
- `EnforcerListPage.js`

Current Seshat fit:

- none

Recommendation:

- out of scope for the current Seshat server milestone.

## Recommended Integration Strategy

### Do Not Reuse Casdoor Frontend "As Is"

Direct reuse would force us into one of these bad outcomes:

- polluting `seshat-server` with legacy Casdoor endpoint shapes,
- inflating the domain model prematurely,
- implementing features we do not actually want just to satisfy old screens.

### Reuse Casdoor Selectively

The realistic approach is:

1. Keep Casdoor as a UI reference and source of page structure.
2. Rebuild only the Seshat-relevant screens in `seshat-ui`.
3. Optionally extract useful visual/form components from Casdoor page by page.
4. Add a very small frontend adapter only where it saves substantial time.

## Recommended Backend Priorities After This Mapping

### Priority 1

User administration parity for a first Seshat admin console:

- `GET /api/v1/users/{userID}`
- `PUT /api/v1/users/{userID}`
- `DELETE /api/v1/users/{userID}`
- richer profile fields that Seshat actually needs

### Priority 2

Session administration:

- list sessions
- revoke one session
- revoke all sessions for a user

### Priority 3

Compatibility improvements for app/provider screens:

- delete application
- delete provider
- optional pagination/filter/sort query support on list endpoints
- optional lightweight alias fields for frontend convenience

### Priority 4

Decide product direction for roles:

- keep static role catalog plus memberships
- or introduce dynamic tenant roles intentionally

This decision should happen before any serious reuse of Casdoor role screens.

## Suggested First Reusable Admin Surface For Seshat

If we want the fastest path to a credible enterprise admin console, the best first screen set is:

- organization list
- organization settings
- user list
- user detail/edit
- membership list/edit
- invitation list/detail
- application list/detail
- provider list/detail
- audit events list
- session list

This set fits Seshat's actual control-plane shape much better than Casdoor's full IAM universe.

## Bottom Line

Casdoor is a good reference implementation and a useful source of UI structure.
It is not a good drop-in frontend for the current `seshat-server` domain model.

The correct move is:

- reuse the strongest page patterns,
- keep Seshat's cleaner backend model,
- rebuild the data layer around Seshat semantics,
- avoid forcing feature parity with all of Casdoor before we even need it.
