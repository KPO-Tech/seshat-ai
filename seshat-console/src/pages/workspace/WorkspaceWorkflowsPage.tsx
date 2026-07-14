import { Alert, Card, Space, Tag, Typography } from 'antd'
import { PageHeader } from '@/components/PageHeader'

const workflowTargets = [
  'workflows preconstruits comme RAG, ingestion et synthesis',
  'comparaison des resultats selon le provider ou l embedder',
  'verification du statut, des entrees, des sorties et des erreurs',
  'rejeu simple pour confirmer un bug ou une regression',
]

export function WorkspaceWorkflowsPage() {
  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Espace de test pour les workflows utilisateur avant ou en parallele des integrations desktop."
      />

      <Alert
        type="info"
        showIcon
        title="La valeur ici est operationnelle: si un workflow casse dans le desktop mais pas ici, le probleme n est probablement pas dans le serveur."
        style={{ marginBottom: 24 }}
      />

      <Card title="Capacites ciblees" extra={<Tag color="gold">Planned</Tag>}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {workflowTargets.map((item) => (
            <Typography.Text key={item}>- {item}</Typography.Text>
          ))}
        </Space>
      </Card>
    </div>
  )
}
