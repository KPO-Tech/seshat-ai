import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import {
  getWhisperStatus,
  downloadWhisper,
  switchModel,
  enableLocalWhisper,
  disableLocalWhisper,
  MODEL_CATALOG,
  type WhisperProgress,
  type WhisperModelId,
} from '../whisper-manager'

const PROGRESS_CHANNEL = 'whisper:progress'

export function registerWhisperHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('whisper:status', () => getWhisperStatus())

  ipcMain.handle('whisper:models', () => MODEL_CATALOG)

  ipcMain.handle('whisper:download', async (event: IpcMainInvokeEvent, modelId?: WhisperModelId) => {
    await downloadWhisper(modelId, (progress: WhisperProgress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(PROGRESS_CHANNEL, progress)
      }
    })
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:switch-model', async (event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    await switchModel(modelId, (progress: WhisperProgress) => {
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
