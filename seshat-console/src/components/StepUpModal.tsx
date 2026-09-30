import { useState } from 'react'
import { Input, Modal, Typography } from 'antd'
import { useStepUpWithPassword } from '@/api/stepUp'
import { getErrorMessage } from '@/api/errors'
import { useStepUpModalStore } from '@/store/stepUpModal'

// StepUpModal — mounted once near the app root (main.tsx). Opened by
// api/client.ts's response middleware whenever a request comes back with
// error.code === "step_up_required" (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9); the
// middleware itself retries the original request once this modal's
// promise resolves, so no page needs to know this exists.
export function StepUpModal() {
  const isOpen = useStepUpModalStore((s) => s.isOpen)
  const resolve = useStepUpModalStore((s) => s.resolve)
  const reject = useStepUpModalStore((s) => s.reject)
  const close = useStepUpModalStore((s) => s.close)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const stepUp = useStepUpWithPassword()

  function reset() {
    setPassword('')
    setError(null)
  }

  function handleConfirm() {
    setError(null)
    stepUp.mutate(
      { current_password: password },
      {
        onSuccess: () => {
          reset()
          close()
          resolve?.()
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    )
  }

  function handleCancel() {
    reset()
    close()
    reject?.(new Error('step-up cancelled'))
  }

  return (
    <Modal
      title="Confirm your identity"
      open={isOpen}
      onOk={handleConfirm}
      onCancel={handleCancel}
      confirmLoading={stepUp.isPending}
      okText="Confirm"
      destroyOnHidden
    >
      <Typography.Paragraph>
        This action is sensitive - please re-enter your password to continue.
      </Typography.Paragraph>
      <Input.Password
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onPressEnter={handleConfirm}
        placeholder="Current password"
        status={error ? 'error' : undefined}
        autoFocus
      />
      {error && (
        <Typography.Text type="danger" style={{ display: 'block', marginTop: 8 }}>
          {error}
        </Typography.Text>
      )}
    </Modal>
  )
}
