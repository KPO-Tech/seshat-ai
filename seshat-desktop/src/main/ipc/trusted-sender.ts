import type { IpcMainInvokeEvent } from 'electron'

export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url
  if (!url) throw new Error('Untrusted sender')

  if (url.startsWith('file://')) return
  if (url.startsWith('http://localhost:')) return
  if (url.startsWith('http://127.0.0.1:')) return

  throw new Error('Untrusted sender')
}
