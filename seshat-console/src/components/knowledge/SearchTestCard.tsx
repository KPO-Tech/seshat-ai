import { useState } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'
import { Alert, Button, Card, Empty, Input, Space, Tag, Typography, message } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { getErrorMessage } from '@/api/errors'
import { palette, monoStack } from '@/theme/tokens'

interface SearchHit {
  score?: number
  text?: string
  metadata?: Record<string, string>
}

export function SearchTestCard<T extends { results?: SearchHit[] }>({
  title = 'Try a search',
  placeholder = 'Ask something this should be able to answer',
  search,
}: {
  title?: string
  placeholder?: string
  search: UseMutationResult<T | undefined, Error, { query: string; topK?: number }>
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<T | null>(null)

  const runSearch = () => {
    if (!query.trim()) return
    search.mutate(
      { query },
      {
        onSuccess: (data) => setResult(data ?? null),
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <Card title={title} size="small">
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} onPressEnter={runSearch} />
        <Button type="primary" icon={<SearchOutlined />} loading={search.isPending} onClick={runSearch}>
          Search
        </Button>
      </Space.Compact>

      {search.isError && <Alert type="warning" showIcon title="Search failed" description={getErrorMessage(search.error)} />}

      {result && (result.results?.length ?? 0) === 0 && (
        <Empty description="No matching chunks found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {result && (result.results?.length ?? 0) > 0 && (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {result.results!.map((item, index) => (
            <div key={index} style={{ paddingBottom: 12, borderBottom: `1px solid ${palette.border}` }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag style={{ fontFamily: monoStack, margin: 0 }}>score {item.score?.toFixed(3)}</Tag>
                {item.metadata?.filename && (
                  <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{item.metadata.filename}</Typography.Text>
                )}
              </Space>
              <Typography.Paragraph style={{ margin: 0, fontSize: 13 }} ellipsis={{ rows: 3, expandable: true }}>
                {item.text}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      )}
    </Card>
  )
}
