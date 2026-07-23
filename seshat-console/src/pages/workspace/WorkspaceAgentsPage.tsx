import { Alert, Card, Space, Tag, Typography } from 'antd'
import { PageHeader } from '@/components/PageHeader'

const agentTargets = [
  'essayer des presets d agents dans un contexte utilisateur reel',
  'tester les combinaisons de tools, permissions et MCP resolves',
  'valider les prompts systeme et comportements avant exposition plus large',
  'documenter les presets qui meritent ensuite un partage organisationnel',
]

export function WorkspaceAgentsPage() {
  return (
    <div>
      <PageHeader
        title="Agents"
        description="Zone de validation des agents avant leur promotion en presets d organisation ou en experiences produit plus larges."
      />

      <Alert
        type="info"
        showIcon
        title="Cet espace doit rester user-scoped: on y essaie, on y casse, on y comprend, puis seulement on partage au niveau organisation."
        style={{ marginBottom: 24 }}
      />

      <Card title="Capacites ciblees" extra={<Tag color="gold">Planned</Tag>}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {agentTargets.map((item) => (
            <Typography.Text key={item}>- {item}</Typography.Text>
          ))}
        </Space>
      </Card>
    </div>
  )
}
