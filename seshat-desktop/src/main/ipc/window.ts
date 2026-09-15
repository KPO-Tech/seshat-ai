import { BrowserWindow, type IpcMain } from 'electron'
import { assertTrustedSender } from './trusted-sender'

export function registerWindowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('window:minimize', (event) => {
    assertTrustedSender(event)
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    assertTrustedSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    assertTrustedSender(event)
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}
