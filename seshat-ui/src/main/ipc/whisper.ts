import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import {
  getWhisperStatus,
  downloadWhisper,
  enableLocalWhisper,
  disableLocalWhisper,
  type WhisperProgress,
} from '../whisper-manager'

const PROGRESS_CHANNEL = 'whisper:progress'

export function registerWhisperHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('whisper:status', () => getWhisperStatus())

  ipcMain.handle('whisper:download', async (event: IpcMainInvokeEvent) => {
    await downloadWhisper((progress: WhisperProgress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(PROGRESS_CHANNEL, progress)
      }
    })
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:enable', async () => {
    await enableLocalWhisper()
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:disable', async () => {
    await disableLocalWhisper()
    return getWhisperStatus()
  })
}
