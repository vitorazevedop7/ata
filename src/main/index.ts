import { app, clipboard, ipcMain, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerCapture } from './capture'
import { registerJobsIpc } from './jobs'
import { registerRecordingIpc } from './recordings'
import { startRetention } from './retention'

// The installed app is named "Granola Local" while dev runs as "granola-local";
// pin one data folder so both see the same recordings.
app.setPath('userData', join(app.getPath('appData'), 'granola-local'))

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 420,
    minHeight: 520,
    title: 'Granola Local',
    // Matches the page background so the window never flashes white on open.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#13161d' : '#eef0f4',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('io.github.vitorazevedop7.granolalocal')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerCapture()
  registerRecordingIpc()
  registerJobsIpc()
  startRetention()
  ipcMain.handle('app:copy', (_event, text: string) => clipboard.writeText(String(text)))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
