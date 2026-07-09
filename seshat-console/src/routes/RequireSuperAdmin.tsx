import { Result, Button } from 'antd'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

/** Platform settings are superadmin-only (User.is_admin) — this is
 * defense in depth: the nav link is already hidden for everyone else, this
 * guard covers anyone navigating to the URL directly. */
export function RequireSuperAdmin() {
  const isAdmin = useAuthStore((s) => s.user?.is_admin)
  const navigate = useNavigate()

  if (!isAdmin) {
    return (
      <Result
        status="403"
        title="Platform admin required"
        subTitle="This section is only available to Seshat platform admins."
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        }
      />
    )
  }

  return <Outlet />
}
