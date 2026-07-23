import {
  ApartmentOutlined,
  CommentOutlined,
  CrownOutlined,
  FileSearchOutlined,
  RobotOutlined,
  ScheduleOutlined,
} from '@ant-design/icons'
import { Card, Space, Tag, Typography } from 'antd'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useAuthStore } from '@/store/auth'

const workspaceModules = [
  {
    key: 'chat',
    title: 'Chat',
    description: 'Tester en conditions reelles les providers, MCP, skills et agents sans passer par le desktop.',
    icon: <CommentOutlined />,
  },
  {
    key: 'workflows',
    title: 'Workflows',
    description: 'Executer les parcours preconfigures comme RAG, ingestion ou automatisations de validation.',
    icon: <ScheduleOutlined />,
  },
  {
    key: 'agents',
    title: 'Agents',
    description: 'Comparer des presets, piles MCP et modes d execution avant leur usage ailleurs.',
    icon: <RobotOutlined />,
  },
  {
    key: 'runs',
    title: 'Runs',
    description: 'Historiser les essais et isoler plus vite un probleme serveur d un probleme desktop.',
    icon: <FileSearchOutlined />,
  },
]

export function WorkspaceOverviewPage() {
  const user = useAuthStore((state) => state.user)
  const organizations = useAuthStore((state) => state.organizations)
  const memberships = useAuthStore((state) => state.memberships)

  return (
    <div>
      <PageHeader
        title="Workspace"
        description="Espace personnel d execution et de validation pour les usages IA reels, distinct de la configuration d organisation et de ton compte."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatTile label="Organizations" value={organizations.length} icon={<ApartmentOutlined />} />
        <StatTile label="Memberships" value={memberships.length} icon={<CrownOutlined />} />
        <StatTile label="Platform Access" value={user?.is_admin ? 'Yes' : 'No'} icon={<CrownOutlined />} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {workspaceModules.map((module) => (
          <Card key={module.key}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space align="center" size={10}>
                <div style={{ fontSize: 18 }}>{module.icon}</div>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {module.title}
                </Typography.Title>
                <Tag color="gold" style={{ marginInlineStart: 'auto' }}>
                  Planned
                </Tag>
              </Space>
              <Typography.Text type="secondary">{module.description}</Typography.Text>
            </Space>
          </Card>
        ))}
      </div>
    </div>
  )
}
