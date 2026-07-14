import { Alert, Card, Space, Tag, Typography } from 'antd'
import { PageHeader } from '@/components/PageHeader'

const runTargets = [
  'historique des chats, workflows et agents lances depuis le workspace',
  'etat, duree, modele, organisation et cible d execution',
  'logs utiles pour corriger les erreurs serveur ou runtime',
  'correlation avec les incidents remontes par le desktop',
]

export function WorkspaceRunsPage() {
  return (
    <div>
      <PageHeader
        title="Runs"
        description="Journal d execution personnel pour comprendre ce qui a tourne, comment, et avec quel resultat."
      />

      <Alert
        type="info"
        showIcon
        title="Cette page deviendra le point de verite pour l observabilite utilisateur cote web avant d ouvrir un vrai historique croise desktop/server."
        style={{ marginBottom: 24 }}
      />

      <Card title="Capacites ciblees" extra={<Tag color="gold">Planned</Tag>}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {runTargets.map((item) => (
            <Typography.Text key={item}>- {item}</Typography.Text>
          ))}
        </Space>
      </Card>
    </div>
  )
}
