import type { IpcMain } from 'electron'
import { app, dialog, shell, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export function registerSystemHandlers(ipcMain: IpcMain) {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('system:open-path', (_, filePath: string) => shell.openPath(filePath))

  ipcMain.handle('system:show-file', (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('system:read-file-data-url', async (_, filePath: string) => {
    const mimeType = IMAGE_MIME_BY_EXT[extname(filePath).toLowerCase()]
    if (!mimeType) throw new Error('Unsupported preview file type')
    const buffer = await readFile(filePath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  })

  ipcMain.handle('system:open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('system:select-file', async (_, options?: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options ?? {})
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    return dialog.showOpenDialog({ properties: ['openDirectory'] })
  })

  ipcMain.handle('system:save-file', async (event, defaultName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: defaultName })
      : await dialog.showSaveDialog({ defaultPath: defaultName })
    if (result.canceled || !result.filePath) {
      return { canceled: true as const }
    }
    await writeFile(result.filePath, content, 'utf-8')
    return { canceled: false as const, filePath: result.filePath }
  })

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
}
