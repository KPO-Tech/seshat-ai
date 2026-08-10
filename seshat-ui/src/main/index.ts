import { app, BrowserWindow, Menu, shell, ipcMain, globalShortcut, dialog, session } from 'electron'
import { join } from 'path'
import { registerSystemHandlers } from './ipc/system'
import { registerSecureStoreHandlers } from './ipc/secure-store'
import { registerBackendHandlers } from './ipc/backend'
import { registerWhisperHandlers } from './ipc/whisper'
import { registerEnvVarsHandlers } from './ipc/env-vars'
import { resolveRuntimeRoot } from './runtime'
import { startBackendSidecar, stopBackendSidecar } from './backend-process'
import { stopWhisperServerProcess } from './whisper-manager'
import { setupAutoUpdater } from './auto-update'
import { isExternalOpenAllowed } from './url-safety'
import { applyContentSecurityPolicy } from './content-security-policy'
import { createBrowserPanel } from './browser-panel'

function configureRuntimePaths() {
  const runtimeRoot = resolveRuntimeRoot()
  app.setPath('userData', join(runtimeRoot, 'electron', 'user-data'))
  app.setPath('sessionData', join(runtimeRoot, 'electron', 'session-data'))
  app.setPath('crashDumps', join(runtimeRoot, 'electron', 'crash-dumps'))
  app.setPath('temp', join(runtimeRoot, 'tmp', 'electron'))
  app.setAppLogsPath(join(runtimeRoot, 'electron', 'logs'))
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  mainWindow = win

  win.removeMenu()
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // DevTools access via a global (OS-wide, works even without window focus)
  // shortcut is a dev convenience, not something a packaged production build
  // should expose — restrict it to unpackaged/dev runs, same guard as
  // setupAutoUpdater's no-op-in-dev check in auto-update.ts (the inverse
  // condition, for the inverse reason).
  if (!app.isPackaged) {
    globalShortcut.register('F12', () => {
      win.webContents.toggleDevTools()
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Chat content (web search results, fetched pages) can put target="_blank" links
    // in front of the user with an attacker-controlled href. shell.openExternal hands
    // the URL to the OS, which resolves non-http(s) schemes via registered protocol
    // handlers (e.g. Windows search-ms:) - a known Electron RCE-chain vector. Restrict
    // to the schemes a browser link is actually supposed to open.
    if (isExternalOpenAllowed(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

configureRuntimePaths()

app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('use-angle', 'gl')
const remoteDebugPort = Number.parseInt(process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT || '9333', 10)
if (Number.isFinite(remoteDebugPort) && remoteDebugPort > 0) {
  app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebugPort))
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT = String(remoteDebugPort)
}

const browserPanel = createBrowserPanel({
  getWindow: () => mainWindow,
  remoteDebugPort,
})

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  applyContentSecurityPolicy()
  registerSystemHandlers(ipcMain)
  registerSecureStoreHandlers(ipcMain)
  registerBackendHandlers(ipcMain)
  registerWhisperHandlers(ipcMain)
  registerEnvVarsHandlers(ipcMain)
  browserPanel.registerIpc(ipcMain)

  // Packaged Electron apps deny every permission request by default when no
  // handler is registered. The voice-input control needs the renderer's
  // navigator.mediaDevices.getUserMedia({ audio: true }) to actually reach
  // the OS mic prompt instead of silently failing, so allow 'media'
  // (mic/camera) here. Every copy-to-clipboard button in the app (message
  // copy, tool output copy, diff copy) uses navigator.clipboard.writeText,
  // which Chromium gates behind 'clipboard-sanitized-write' (and
  // 'clipboard-read' for paste) - without allowing those too, every one of
  // those buttons silently no-ops. Everything else stays denied.
  const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission))

  try {
    await startBackendSidecar()
  } catch (error) {
    dialog.showErrorBox(
      'SeshatOS backend failed to start',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
    return
  }

  createWindow()
  setupAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  browserPanel.destroy()
  stopWhisperServerProcess()
  void stopBackendSidecar()
})
