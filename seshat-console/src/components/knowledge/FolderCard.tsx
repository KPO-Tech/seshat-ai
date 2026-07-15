import { Card, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { CorpusFolder } from '@/api/knowledge'
import { FolderIcon } from '@/components/knowledge/FolderIcon'
import { palette } from '@/theme/tokens'

// Google Drive/Canva-style folder card: a real (colored, skeuomorphic)
// folder icon rather than a generic icon-chip, so a grid of folders reads
// visually distinct at a glance.
export function FolderCard({ folder, corpusCount }: { folder: CorpusFolder; corpusCount: number }) {
  const navigate = useNavigate()

  return (
    <Card
      hoverable
      styles={{ body: { padding: '20px 20px 16px' } }}
      onClick={() => navigate(`/orgs/${folder.organization_id}/knowledge/folders/${folder.id}`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
        <FolderIcon folderId={folder.id!} emoji={folder.icon || '📁'} size={64} />
        <div style={{ minWidth: 0, width: '100%' }}>
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
