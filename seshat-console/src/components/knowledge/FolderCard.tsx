import { Card, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { CorpusFolder } from '@/api/knowledge'
import { palette } from '@/theme/tokens'

// Same visual language as StatTile (accent-soft icon chip + label/value
// stack) applied to a clickable folder - the corpus count reads like a
// stat, and clicking navigates into the folder.
export function FolderCard({ folder, corpusCount }: { folder: CorpusFolder; corpusCount: number }) {
  const navigate = useNavigate()

  return (
    <Card
      hoverable
      styles={{ body: { padding: '18px 20px' } }}
      onClick={() => navigate(`/orgs/${folder.organization_id}/knowledge/folders/${folder.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: palette.accentSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {folder.icon || '📁'}
        </div>
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong ellipsis style={{ display: 'block' }}>
            {folder.name}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
            {corpusCount} {corpusCount === 1 ? 'corpus' : 'corpora'}
          </Typography.Text>
        </div>
      </div>
    </Card>
  )
}
