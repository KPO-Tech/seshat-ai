import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { registerBackendHandlers } from './ipc/backend'
import { createBrowserPanel } from './ipc/browser-panel'
import { registerEnvVarsHandlers } from './ipc/env-vars'
import { registerSecureStoreHandlers } from './ipc/secure-store'
import { registerTerminalRelayHandlers } from './ipc/terminal-relay'
import { registerWindowHandlers } from './ipc/window'

const isDevelopment = !app.isPackaged
const remoteDebugPort = Number.parseInt(process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT || '9333', 10)
let mainWindow: BrowserWindow | null = null

if (Number.isFinite(remoteDebugPort) && remoteDebugPort > 0) {
  app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebugPort))
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT = String(remoteDebugPort)
}

const browserPanel = createBrowserPanel({
  getWindow: () => mainWindow,
  remoteDebugPort
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: 'SeshatOS',
    backgroundColor: '#0f1115',
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  registerSecureStoreHandlers(ipcMain)
  registerBackendHandlers(ipcMain)
  browserPanel.registerIpc(ipcMain)
  registerEnvVarsHandlers(ipcMain)
  registerTerminalRelayHandlers(ipcMain)
  registerWindowHandlers(ipcMain)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  browserPanel.destroy()
})
