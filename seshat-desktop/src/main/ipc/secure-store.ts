import { app, safeStorage, type IpcMain } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertTrustedSender } from './trusted-sender'
import { normalizeSecretKey } from './validation'

const volatileStore = new Map<string, string>()

function getStorePath(): string {
  return join(app.getPath('userData'), 'secure-store.json')
}

function canPersistSecrets(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  return safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
}

async function loadPersistentStore(): Promise<Record<string, string>> {
  const path = getStorePath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return {}
  }
}

async function savePersistentStore(data: Record<string, string>): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 })
  await writeFile(getStorePath(), JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
}

export async function setSecret(key: string, value: string): Promise<void> {
  const safeKey = normalizeSecretKey(key)
  if (!canPersistSecrets()) {
    volatileStore.set(safeKey, value)
    return
  }
  const store = await loadPersistentStore()
  store[safeKey] = safeStorage.encryptString(value).toString('base64')
  await savePersistentStore(store)
}

export async function getSecret(key: string): Promise<string | null> {
  const safeKey = normalizeSecretKey(key)
  if (volatileStore.has(safeKey)) return volatileStore.get(safeKey) ?? null
  if (!canPersistSecrets()) return null

  const store = await loadPersistentStore()
  const value = store[safeKey]
  if (value == null) return null
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return null
  }
}

export async function deleteSecret(key: string): Promise<void> {
  const safeKey = normalizeSecretKey(key)
  volatileStore.delete(safeKey)
  if (!canPersistSecrets()) return

  const store = await loadPersistentStore()
  if (!(safeKey in store)) return
  delete store[safeKey]
  await savePersistentStore(store)
}

export function registerSecureStoreHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('secure-store:set', async (event, key: string, value: string) => {
    assertTrustedSender(event)
    await setSecret(key, value)
  })

  ipcMain.handle('secure-store:get', async (event, key: string): Promise<string | null> => {
    assertTrustedSender(event)
    return getSecret(key)
  })

  ipcMain.handle('secure-store:delete', async (event, key: string) => {
    assertTrustedSender(event)
    await deleteSecret(key)
  })
}
