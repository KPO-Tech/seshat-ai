import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import {
  getWhisperStatus,
  downloadDefaultModels,
  downloadModel,
  activateModel,
  deleteModel,
  enableLocalWhisper,
  disableLocalWhisper,
  MODEL_CATALOG,
  type WhisperProgress,
  type WhisperModelId,
} from '../whisper-manager'

const PROGRESS_CHANNEL = 'whisper:progress'

function forwardProgress(event: IpcMainInvokeEvent) {
  return (progress: WhisperProgress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(PROGRESS_CHANNEL, progress)
    }
  }
}

export function registerWhisperHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('whisper:status', () => getWhisperStatus())

  ipcMain.handle('whisper:models', () => MODEL_CATALOG)

  ipcMain.handle('whisper:download-defaults', async (event: IpcMainInvokeEvent) => {
    await downloadDefaultModels(forwardProgress(event))
    await enableLocalWhisper()
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:download-model', async (event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    await downloadModel(modelId, forwardProgress(event))
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:activate-model', async (event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    await activateModel(modelId, forwardProgress(event))
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:delete-model', async (_event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    await deleteModel(modelId)
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
