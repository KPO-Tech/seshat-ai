import { Card, Typography } from 'antd'
import { useNavigate } from 'react-router'
import type { Corpus } from '@/api/knowledge'
import { CorpusIcon } from '@/components/knowledge/CorpusIcon'
import { palette } from '@/theme/tokens'

export function CorpusCard({ corpus }: { corpus: Corpus }) {
  const navigate = useNavigate()
  const chunkCount = corpus.chunk_count ?? 0

  return (
    <Card
      hoverable
      className="stat-card"
      styles={{ body: { padding: '24px 20px 20px' } }}
      onClick={() => navigate(`/orgs/${corpus.organization_id}/knowledge/corpora/${corpus.id}`)}
      style={{
        cursor: 'pointer',
        borderRadius: 14,
        border: `1px solid ${palette.border}`,
        background: palette.surface,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <div
          style={{
            padding: 8,
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${palette.borderSubtle}`,
            display: 'inline-flex',
          }}
        >
          <CorpusIcon id={corpus.id!} size={56} />
        </div>
        <div style={{ minWidth: 0, width: '100%' }}>
          <Typography.Text strong ellipsis style={{ display: 'block', fontSize: 14.5, color: palette.ink, marginBottom: 4 }}>
            {corpus.name}
          </Typography.Text>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${palette.borderSubtle}`,
              fontSize: 11.5,
              color: palette.inkSecondary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {chunkCount} {chunkCount === 1 ? 'chunk' : 'chunks'}
          </span>
        </div>
      </div>
    </Card>
  )
}

