import { Card, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { Corpus } from '@/api/knowledge'
import { CorpusIcon } from '@/components/knowledge/CorpusIcon'
import { palette } from '@/theme/tokens'

// Google Drive/Canva-style card: a real (colored, skeuomorphic) folder
// icon rather than a generic icon-chip, so a grid of corpora reads
// visually distinct at a glance.
export function CorpusCard({ corpus }: { corpus: Corpus }) {
  const navigate = useNavigate()
  const chunkCount = corpus.chunk_count ?? 0

  return (
    <Card
      hoverable
      styles={{ body: { padding: '20px 20px 16px' } }}
      onClick={() => navigate(`/orgs/${corpus.organization_id}/knowledge/corpora/${corpus.id}`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
        <CorpusIcon id={corpus.id!} size={64} />
        <div style={{ minWidth: 0, width: '100%' }}>
          <Typography.Text strong ellipsis style={{ display: 'block' }}>
            {corpus.name}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
            {chunkCount} {chunkCount === 1 ? 'chunk' : 'chunks'}
          </Typography.Text>
        </div>
      </div>
    </Card>
  )
}
