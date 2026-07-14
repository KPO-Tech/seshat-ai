import { Result, Button } from 'antd'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useLandingRoute } from '@/hooks/useLandingRoute'

/** The entire Platform scope is superadmin-only (User.is_admin) - this is
 * defense in depth: the nav group is already hidden for everyone else, this
 * guard covers anyone navigating to a /platform/* URL directly. */
export function RequireSuperAdmin() {
  const isAdmin = useAuthStore((s) => s.user?.is_admin)
  const navigate = useNavigate()
  const landingRoute = useLandingRoute()

  if (!isAdmin) {
    return (
      <Result
        status="403"
        title="Platform admin required"
        subTitle="This section is only available to Seshat platform admins."
        extra={
          <Button type="primary" onClick={() => navigate(landingRoute)}>
            Back to my organization
          </Button>
        }
      />
    )
  }

  return <Outlet />
}
