const { app, BrowserWindow, ipcMain } = require('electron')

let win;

function createWindow () {
  win = new BrowserWindow({
    width: 900, // 变宽了，为了横向排列
    height: 600,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(createWindow)

ipcMain.on('close-app', () => { app.quit() })

// 新增：接收前端的置顶指令
ipcMain.on('toggle-top', (event, isTop) => {
    if (win) win.setAlwaysOnTop(isTop)
})