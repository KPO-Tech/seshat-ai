import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Form, Input, Space, Typography } from 'antd'
import { useProbeMCPServerConfig, useCreateMCPServerConfig, type MCPProbeResult, type MCPServerConfigInput } from '@/api/mcpServerConfigs'
import { getErrorMessage } from '@/api/errors'

function slugifyHostname(url: string): string {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  } catch {
    return ''
  }
}

// SmartAddMCPServerDrawer is the default "New MCP server" entry point (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 8): paste one
// URL, the server probes it with a real MCP handshake and classifies
// whether it needs a credential, rather than making the admin fill out the
// full manual form up front. Deliberately does NOT attempt OAuth - a
// 401/403 just asks for a credential the admin already has, then re-probes
// with it before ever saving (never persists an entry known not to work).
// stdio and websocket servers, or anything the probe gets wrong, fall back
// to the unchanged manual form via onSwitchToManual.
export function SmartAddMCPServerDrawer({
  organizationId,
  open,
  onClose,
  onSwitchToManual,
}: {
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSwitchToManual: () => void
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [credentialHeader, setCredentialHeader] = useState('Authorization')
  const [credentialValue, setCredentialValue] = useState('')
  const [result, setResult] = useState<MCPProbeResult | null>(null)

  const probe = useProbeMCPServerConfig()
  const create = useCreateMCPServerConfig()

  useEffect(() => {
    if (!open) {
      setUrl('')
      setName('')
      setCredentialHeader('Authorization')
      setCredentialValue('')
      setResult(null)
      probe.reset()
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function runProbe(withCredential: boolean) {
    if (!organizationId || !url.trim()) return
    probe.mutate(
      {
        organization_id: organizationId,
        url: url.trim(),
        ...(withCredential ? { credential_header: credentialHeader.trim(), credential_value: credentialValue } : {}),
      },
      {
        onSuccess: (data) => {
          setResult(data)
          if (!name) setName(slugifyHostname(url))
        },
      },
    )
  }

  function handleCreate(withCredential: boolean) {
    if (!organizationId || !result) return
    const payload: MCPServerConfigInput = {
      organization_id: organizationId,
      name: name.trim(),
      server_type: (result.server_type as MCPServerConfigInput['server_type']) ?? 'http',
      url: url.trim(),
      timeout_secs: 30,
      ...(withCredential ? { headers: { [credentialHeader.trim()]: credentialValue } } : {}),
    }
    create.mutate(payload, { onSuccess: onClose })
  }

  return (
    <Drawer title="New MCP server" open={open} onClose={onClose} destroyOnHidden size={480}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>Server URL</Typography.Text>
          <Input
            placeholder="https://mcp.example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setResult(null)
              probe.reset()
            }}
            onPressEnter={() => runProbe(false)}
            style={{ marginTop: 6 }}
          />
          <Button type="primary" style={{ marginTop: 10 }} loading={probe.isPending} disabled={!url.trim()} onClick={() => runProbe(false)}>
            Check server
          </Button>
        </div>

        {probe.isError && <Alert type="error" showIcon message={getErrorMessage(probe.error)} />}

        {result?.auth_mode === 'none' && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="success" showIcon message="Reachable, no credential needed" description={result.detail} />
            <Form.Item label="Name" required style={{ marginBottom: 0 }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="internal-jira" />
            </Form.Item>
            {create.isError && <Alert type="error" showIcon message={getErrorMessage(create.error)} />}
            <Button type="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => handleCreate(false)}>
              Add server
            </Button>
          </Space>
        )}

        {result?.auth_mode === 'credential' && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="This server needs a credential" description={result.detail} />
            <Form.Item label="Name" required style={{ marginBottom: 0 }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="internal-jira" />
            </Form.Item>
            <Form.Item label="Header name" required style={{ marginBottom: 0 }}>
              <Input value={credentialHeader} onChange={(e) => setCredentialHeader(e.target.value)} />
            </Form.Item>
            <Form.Item label="Credential" required extra="A token or API key you've already obtained from this server - never entered anywhere but here." style={{ marginBottom: 0 }}>
              <Input.Password value={credentialValue} onChange={(e) => setCredentialValue(e.target.value)} placeholder="Bearer sk-..." />
            </Form.Item>
            {create.isError && <Alert type="error" showIcon message={getErrorMessage(create.error)} />}
            <Button
              type="primary"
              loading={probe.isPending || create.isPending}
              disabled={!name.trim() || !credentialValue.trim()}
              onClick={() =>
                probe.mutate(
                  { organization_id: organizationId ?? '', url: url.trim(), credential_header: credentialHeader.trim(), credential_value: credentialValue },
                  {
                    onSuccess: (data) => {
                      setResult(data)
                      if (data.auth_mode === 'none') handleCreate(true)
                    },
                  },
                )
              }
            >
              Test &amp; add
            </Button>
          </Space>
        )}

        {result?.auth_mode === 'unknown' && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="Couldn't confirm automatically" description={result.detail} />
            <Form.Item label="Name" required style={{ marginBottom: 0 }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="internal-jira" />
            </Form.Item>
            {create.isError && <Alert type="error" showIcon message={getErrorMessage(create.error)} />}
            <Space>
              <Button loading={create.isPending} disabled={!name.trim()} onClick={() => handleCreate(false)}>
                Add anyway
              </Button>
              <Button onClick={onSwitchToManual}>Switch to manual setup</Button>
            </Space>
          </Space>
        )}

        {!result && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Or{' '}
            <a onClick={onSwitchToManual} style={{ cursor: 'pointer' }}>
              switch to manual setup
            </a>{' '}
            - required for stdio and websocket servers.
          </Typography.Text>
        )}
      </Space>
    </Drawer>
  )
}
