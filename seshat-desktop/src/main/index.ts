import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { registerBackendHandlers } from './ipc/backend'
import { registerSecureStoreHandlers } from './ipc/secure-store'
import { registerWindowHandlers } from './ipc/window'

const isDevelopment = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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
  registerWindowHandlers(ipcMain)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
