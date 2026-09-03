import { Button, Result, Spin, Typography, message } from 'antd'
import { Link, useSearchParams } from 'react-router'
import { useAcceptInvitation, useLookupInvitation } from '@/api/invitations'
import { api } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
import { AuthLayout } from '@/layout/AuthLayout'

/**
 * Public landing page for the link an invitation email sends
 * (/accept-invitation?token=...). Two states depending on whether the
 * invitee already has a session:
 *   - logged out: preview the invitation (org/role), then hand off to
 *     /login or /register with ?next= carrying the token through so the
 *     invitee lands right back here, now authenticated, to finish.
 *   - logged in: a single Accept button that redeems the token.
 */
export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? undefined
  const authToken = useAuthStore((s) => s.token)
  const currentUser = useAuthStore((s) => s.user)
  const { data: preview, isLoading } = useLookupInvitation(token)
  const acceptInvitation = useAcceptInvitation()

  if (!token) {
    return (
      <AuthLayout title="Invalid invitation link" subtitle="This link is missing its invitation token.">
        <Result status="error" title="Missing token" extra={<Link to="/login">Go to login</Link>} />
      </AuthLayout>
    )
  }

  if (isLoading) {
    return (
      <AuthLayout title="Checking your invitation" subtitle="One moment.">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </AuthLayout>
    )
  }

  if (!preview?.valid) {
    return (
      <AuthLayout title="Invitation no longer valid" subtitle="This invitation may have expired, been revoked, or already been used.">
        <Result status="warning" title="This invitation is no longer valid" extra={<Link to="/login">Go to login</Link>} />
      </AuthLayout>
    )
  }

  const nextPath = `/accept-invitation?token=${encodeURIComponent(token)}`

  if (!authToken) {
    return (
      <AuthLayout title="You're invited" subtitle={`Join ${preview.organization_name} on Seshat.`}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          You&apos;re invited to join {preview.organization_name}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          As <strong>{preview.role}</strong>, for {preview.email}. Log in or create an account with this email to accept.
        </Typography.Paragraph>
        <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>
          <Button type="primary" block size="large" style={{ marginBottom: 12 }}>
            Log in
          </Button>
        </Link>
        <Link to={`/register?next=${encodeURIComponent(nextPath)}`}>
          <Button block size="large">
            Create an account
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  if (currentUser && currentUser.email !== preview.email) {
    return (
      <AuthLayout title="Wrong account" subtitle="This invitation was sent to a different email address.">
        <Result
          status="warning"
          title={`This invitation is for ${preview.email}`}
          subTitle={`You're signed in as ${currentUser.email}. Log out and sign in with the invited address to accept.`}
          extra={<Link to="/login">Go to login</Link>}
        />
      </AuthLayout>
    )
  }

  const onAccept = () => {
    acceptInvitation.mutate(token, {
      onSuccess: async (membership) => {
        const { data } = await api.GET('/api/v1/auth/me')
        if (data?.user) {
          useAuthStore.getState().setSession({
            token: useAuthStore.getState().token!,
            user: data.user,
            organizations: data.organizations ?? [],
            memberships: data.memberships ?? [],
          })
        }
        message.success(`Joined ${preview.organization_name}`)
        // Workspace requires an org id in its URL now - the mutation's own
        // response (the membership just created) already has it, no need to
        // wait on or search through the refreshed session above for it.
        window.location.href = membership?.organization_id ? `/orgs/${membership.organization_id}/workspace` : '/'
      },
      onError: (error) => message.error(getErrorMessage(error)),
    })
  }

  return (
    <AuthLayout title="You're invited" subtitle={`Join ${preview.organization_name} on Seshat.`}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Join {preview.organization_name}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        You&apos;ll join as <strong>{preview.role}</strong>.
      </Typography.Paragraph>
      <Button type="primary" block size="large" loading={acceptInvitation.isPending} onClick={onAccept}>
        Accept invitation
      </Button>
    </AuthLayout>
  )
}
