# SCIM provisioning

Seshat supports SCIM 2.0 (RFC 7643/7644) so an enterprise identity provider —
Okta, Microsoft Entra ID, or any other SCIM-compliant IdP — can create,
update and deactivate members of one organization automatically, instead of
an admin managing them by hand in the console.

## Setting up a connection

1. In the console, go to **Integrations → SCIM Provisioning** for the
   organization you want to provision.
2. Click **Set up SCIM**, give the connection a name (e.g. the IdP's name),
   and choose whether to sync groups (see [Group sync modes](#group-sync-modes)
   below).
3. Copy the bearer token shown immediately after creation. **This is the
   only time it is ever shown** — if you lose it, you'll need to rotate it
   (see [Rotating the token](#rotating-the-token)) and update your IdP again.

In your IdP's SCIM app configuration, set:

- **SCIM connector base URL**: `https://<your-seshat-server-host>/scim/v2`
- **Unique identifier field for users**: `userName` (Seshat treats `userName`
  and the user's email as the same value — there is no separate username)
- **Authentication mode**: Bearer token — paste the token from step 3
- **Provisioning actions to enable**: Create Users, Update User Attributes,
  Deactivate Users (and Push Groups, if you enabled group sync)

Once configured, most IdPs run a test connection that calls
`GET /scim/v2/ServiceProviderConfig` — if that succeeds, the token and URL
are correct and you can proceed to assign users/groups to the app in your
IdP.

## Group sync modes

A connection has two independent settings:

| Sync groups | Auto-create teams | Behavior |
|---|---|---|
| Off | — | Every `/Groups` push from the IdP is rejected outright (403). Use this if you only want to provision users. |
| On | Off ("metadata only") | Group pushes are accepted and recorded in the activity feed for visibility, but no team is created or changed in Seshat. Useful to see what your IdP *would* push before trusting it to manage real teams. |
| On | On | Group pushes create and update real Seshat teams, with membership kept in sync. A member must already exist (via `/Users`) before they can be added to a group — this mirrors how most IdPs push users before groups during a sync. |

## Rotating the token

If a token is compromised, or you simply need a fresh one, use **Rotate
token** on the connection. The previous token stops working immediately —
you'll need to update it in your IdP's app configuration right after, or
provisioning will start failing with 401s until you do.

## Deactivation, not deletion

Deprovisioning a user in your IdP (or setting their SCIM `active` attribute
to `false`) deactivates their Seshat membership — it never deletes their
account outright. This keeps the account's history intact and means
reactivating them later (from the IdP, or an admin) restores their access
without recreating anything. Deleting a *group* pushed via SCIM, however,
really does delete the corresponding Seshat team — there's no equivalent
"reactivate later" need for a team the way there is for a person's access.

## Troubleshooting

The SCIM Provisioning page shows a status badge (**Healthy** / **Last
operation failed** / **No activity yet**) and a recent-activity feed listing
every operation your IdP has sent, most recent first, with the error message
for anything that failed. Common issues:

- **"a user with this email already exists"**: the email is already a member
  of a different Seshat organization. Since an account belongs to exactly
  one organization, the IdP can't provision it into this one until it's
  removed from the other.
- **401 on every request**: the token was rotated (in Seshat or by mistake)
  since the IdP was last configured, or the connection was disabled. Check
  the connection's **Enabled** toggle and re-copy the token if needed.
- **A group push does nothing**: check the connection's group sync mode —
  "metadata only" mode intentionally never creates a real team.
