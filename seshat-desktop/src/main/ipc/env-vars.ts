import { app, type IpcMain } from 'electron'
import { ENV_VAR_CATALOG, deleteEnvVar, listEnvVarStatus, setEnvVar } from '../env-vars-manager'
import { assertTrustedSender } from './trusted-sender'

function assertKnownEnvKey(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Environment variable key must be a string')
  const key = value.trim()
  if (!ENV_VAR_CATALOG.some((def) => def.key === key)) throw new Error(`Unknown environment variable: ${key}`)
  return key
}

export function registerEnvVarsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('env-vars:catalog', (event) => {
    assertTrustedSender(event)
    return ENV_VAR_CATALOG
  })

  ipcMain.handle('env-vars:status', async (event) => {
    assertTrustedSender(event)
    return listEnvVarStatus()
  })

  ipcMain.handle('env-vars:set', async (event, key: unknown, value: unknown) => {
    assertTrustedSender(event)
    const safeKey = assertKnownEnvKey(key)
    if (typeof value !== 'string') throw new Error('Environment variable value must be a string')
    await setEnvVar(safeKey, value)
  })

  ipcMain.handle('env-vars:delete', async (event, key: unknown) => {
    assertTrustedSender(event)
    await deleteEnvVar(assertKnownEnvKey(key))
  })

  ipcMain.handle('env-vars:restart-backend', (event) => {
    assertTrustedSender(event)
    if (!app.isPackaged) {
      return { ok: false, error: 'Dev mode: restart the backend terminal to apply environment changes.' }
    }
    return { ok: false, error: 'Packaged backend restart is not wired in seshat-desktop yet.' }
  })
}
