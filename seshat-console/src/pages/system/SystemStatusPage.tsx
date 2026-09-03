import { Card, Skeleton, Space, Tag, Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { useDoclingStatus } from '@/api/system'
import { PageHeader } from '@/components/PageHeader'
import { palette, monoStack } from '@/theme/tokens'

export function SystemStatusPage() {
  const { data, isLoading } = useDoclingStatus()

  return (
    <div>
      <PageHeader />

      <Card
        title={
          <Space>
            <FileTextOutlined style={{ color: palette.inkTertiary }} />
            <span>Document conversion (Docling)</span>
          </Space>
        }
      >
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : (
          <Space orientation="vertical" size={8}>
            <Space size={10}>
              <Tag color={data?.configured ? 'green' : 'default'} style={{ margin: 0 }}>
                {data?.configured ? 'Configured' : 'Not configured'}
              </Tag>
            </Space>
            {data?.configured && data.url && (
              <Typography.Text style={{ fontFamily: monoStack, fontSize: 13, color: palette.inkSecondary }}>
                {data.url}
              </Typography.Text>
            )}
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
              {data?.configured
                ? 'Converts PDF, DOCX, PPTX, XLSX, audio, and image files to markdown before ingestion and for the read_document_url automation tool.'
                : 'Set SESHAT_SERVER_DOCLING_URL on the server to enable binary-format conversion for knowledge ingestion. Plain-text, markdown, and JSON files ingest fine without it.'}
            </Typography.Text>
          </Space>
        )}
      </Card>
    </div>
  )
}
