import { Button, Result, Space } from 'antd'
import { useNavigate } from 'react-router-dom'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Result
      status="404"
      title="Page not found"
      subTitle="This console page does not exist."
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate('/platform/overview')}>
            Go to overview
          </Button>
          <Button onClick={() => navigate('/platform/organizations')}>Organizations</Button>
        </Space>
      }
    />
  )
}
