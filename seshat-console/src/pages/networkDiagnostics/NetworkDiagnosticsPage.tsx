import { Button, Collapse, Empty, Tag, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, MinusCircleFilled, ReloadOutlined, WifiOutlined } from '@ant-design/icons'
import { useRunNetworkDiagnostics, type NetworkDiagnosticResult, type NetworkDiagnosticStep } from '@/api/networkDiagnostics'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

const ACT_ON_LABEL: Record<string, string> = {
  network_admin: 'Your network administrator',
  it_security: 'Your IT/security team',
  support: 'Seshat support',
}

function StepStatusIcon({ status }: { status?: NetworkDiagnosticStep['status'] }) {
  if (status === 'pass') return <CheckCircleFilled style={{ color: palette.success }} />
  if (status === 'fail') return <CloseCircleFilled style={{ color: palette.danger }} />
  return <MinusCircleFilled style={{ color: palette.inkTertiary }} />
}

function CheckOverallTag({ check }: { check: NetworkDiagnosticResult }) {
  return check.ok ? (
    <Tag color="green" icon={<CheckCircleFilled />} style={{ margin: 0 }}>
      Reachable
    </Tag>
  ) : (
    <Tag color="red" icon={<CloseCircleFilled />} style={{ margin: 0 }}>
      Unreachable
    </Tag>
  )
}

// NetworkDiagnosticsPage is the server-side half of
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 6 - self-service
// connectivity troubleshooting for enterprise IT, run on demand (never
// automatically) since it makes real outbound network calls. The
// desktop-side half lives in seshat-ui's RuntimeView, checking this device's
// own path to Seshat Server rather than this server's outbound dependencies.
export function NetworkDiagnosticsPage() {
  const organizationId = useScopedOrganizationId()
  const runDiagnostics = useRunNetworkDiagnostics()

  const checks = runDiagnostics.data?.checks ?? []

  return (
    <div>
      <PageHeader
        actions={
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={runDiagnostics.isPending}
            disabled={!organizationId}
            onClick={() => organizationId && runDiagnostics.mutate(organizationId)}
          >
            Run diagnostics
          </Button>
        }
      />

      {runDiagnostics.isError ? (
        <Typography.Text type="danger">{getErrorMessage(runDiagnostics.error)}</Typography.Text>
      ) : !runDiagnostics.isSuccess ? (
        <div
          style={{
            border: `1px dashed ${palette.border}`,
            borderRadius: 12,
            padding: '48px 24px',
            background: palette.surface,
          }}
        >
          <Empty
            image={<WifiOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
            description="Click &quot;Run diagnostics&quot; to check this server's outbound connectivity"
          />
        </div>
      ) : checks.length === 0 ? (
        <Typography.Text type="secondary">
          Nothing to check yet - no SMTP relay and no enabled SSO providers are configured for this organization.
        </Typography.Text>
      ) : (
        <Collapse
          items={checks.map((check, index) => ({
            key: check.name ?? String(index),
            label: (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <Typography.Text strong>{check.name}</Typography.Text>{' '}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {check.target}
                  </Typography.Text>
                </div>
                <CheckOverallTag check={check} />
              </div>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(check.steps ?? []).map((step) => (
                  <div key={step.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StepStatusIcon status={step.status} />
                      <Typography.Text strong style={{ textTransform: 'uppercase', fontSize: 12 }}>
                        {step.name}
                      </Typography.Text>
                      {step.status !== 'skipped' && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {step.duration_ms}ms
                        </Typography.Text>
                      )}
                      {step.detail && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {step.detail}
                        </Typography.Text>
                      )}
                    </div>
                    {step.suggestion && (
                      <Typography.Text type="warning" style={{ fontSize: 12, marginLeft: 24 }}>
                        {step.act_on && <strong>{ACT_ON_LABEL[step.act_on] ?? step.act_on}: </strong>}
                        {step.suggestion}
                      </Typography.Text>
                    )}
                  </div>
                ))}
              </div>
            ),
          }))}
        />
      )}
    </div>
  )
}
