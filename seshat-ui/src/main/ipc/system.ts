import type { IpcMain } from 'electron'
import { app, dialog, shell, BrowserWindow } from 'electron'

export function registerSystemHandlers(ipcMain: IpcMain) {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('system:open-path', (_, filePath: string) => shell.openPath(filePath))

  ipcMain.handle('system:show-file', (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('system:open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('system:select-file', async (_, options?: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options ?? {})
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    return dialog.showOpenDialog({ properties: ['openDirectory'] })
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
