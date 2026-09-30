import { Result, Button } from 'antd'
import { Outlet, useNavigate, useParams } from 'react-router'
import { useAuthStore } from '@/store/auth'

/**
 * Gates the whole `/orgs/:organizationId/*` console scope on the
 * `organization.manage` permission for that specific org, not a hardcoded
 * role-name check — a custom role (e.g. "Manager") granting that same
 * permission qualifies exactly like the built-in owner/admin roles do,
 * matching how the backend itself resolves access (see
 * iam.hasOrganizationPermission). A plain member/viewer's daily work happens
 * in the Seshat desktop app, not this console.
 */
export function RequireOrganizationManager() {
  const isAdmin = useAuthStore((s) => s.user?.is_admin)
  const memberships = useAuthStore((s) => s.memberships)
  const { organizationId } = useParams<{ organizationId: string }>()
  const navigate = useNavigate()

  const canManage =
    isAdmin || memberships.some((m) => m.organization_id === organizationId && m.permissions?.includes('organization.manage'))

  if (!canManage) {
    return (
      <Result
        status="403"
        title="Organization admin access required"
        subTitle="This console is for organization owners and admins. For day-to-day work, use the Seshat desktop app instead."
        extra={
          <Button type="primary" onClick={() => navigate(`/orgs/${organizationId}/workspace`)}>
            Go to my workspace
          </Button>
        }
      />
    )
  }

  return <Outlet />
}
