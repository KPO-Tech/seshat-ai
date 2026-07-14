import { Button, Result } from 'antd'
import { useLogout } from '@/api/auth'

export function NoAccessPage() {
  const logout = useLogout()

  return (
    <Result
      status="403"
      title="No organization access yet"
      subTitle="Your account isn't a member of any organization. Ask a platform admin or an organization owner to add you."
      extra={
        <Button type="primary" onClick={() => logout.mutate()}>
          Log out
        </Button>
      }
    />
  )
}
