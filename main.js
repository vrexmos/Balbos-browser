const { app, ipcMain, session, BrowserWindow, BrowserView } = require('electron')
const path = require('path')

let win
let views = {}
let activeTabId = null
let adBlockerEnabled = true

const NAVBAR_HEIGHT = 48
const TITLEBAR_HEIGHT = 36
const LOADING_BAR_HEIGHT = 2
const TOP_HEIGHT = TITLEBAR_HEIGHT + NAVBAR_HEIGHT + LOADING_BAR_HEIGHT

function getViewBounds() {
  const { width, height } = win.getBounds()
  return {
    x: 0,
    y: TOP_HEIGHT,
    width: width,
    height: height - TOP_HEIGHT
  }
}

function updateViewBounds() {
  if (activeTabId && views[activeTabId]) {
    views[activeTabId].setBounds(getViewBounds())
  }
}

function createView(tabId) {
  const view = new BrowserView({
    webPreferences: {
      session: session.fromPartition('persist:balbos'),
      backgroundThrottling: false,
    }
  })
  win.addBrowserView(view)
  view.setBounds(getViewBounds())
  view.setAutoResize({ width: true, height: true })
  view.setBackgroundColor('#ffffff')

  // Forward events to renderer
  view.webContents.on('did-navigate', (e, url) => win.webContents.send('url-changed', url, tabId))
  view.webContents.on('did-navigate-in-page', (e, url) => win.webContents.send('url-changed', url, tabId))
  view.webContents.on('page-title-updated', (e, title) => win.webContents.send('title-changed', title, tabId))
  view.webContents.on('page-favicon-updated', (e, favicons) => {
    if (favicons && favicons[0]) win.webContents.send('favicon-changed', favicons[0], tabId)
  })
  view.webContents.on('did-fail-load', (e, errorCode) => {
    if (errorCode !== -3) win.webContents.send('load-failed', tabId, errorCode)
  })
  view.webContents.on('did-start-loading', () => win.webContents.send('loading-start', tabId))
  view.webContents.on('did-stop-loading', () => win.webContents.send('loading-stop', tabId))

  // Download handler (unchanged)
  view.webContents.session.on('will-download', (e, item) => {
    const { dialog } = require('electron')
    item.pause()
    dialog.showSaveDialog(win, {
      title: 'Save File',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      buttonLabel: 'Download'
    }).then(result => {
      if (result.canceled || !result.filePath) { item.cancel(); return }
      item.setSavePath(result.filePath)
      item.resume()
      win.webContents.send('download-started', { filename: item.getFilename(), path: result.filePath, totalBytes: item.getTotalBytes() })
      item.on('updated', (e, state) => {
        if (state === 'progressing') win.webContents.send('download-progress', {
          filename: item.getFilename(),
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes()
        })
      })
      item.once('done', (e, state) => win.webContents.send('download-done', {
        filename: item.getFilename(), path: result.filePath, state
      }))
    })
  })

  views[tabId] = view
  return view
}

function showView(tabId) {
  // Remove all views first (this helps with layering)
  Object.keys(views).forEach(id => {
    if (views[id]) win.removeBrowserView(views[id])
  })
  if (views[tabId]) {
    win.addBrowserView(views[tabId])
    views[tabId].setBounds(getViewBounds())
    activeTabId = tabId
  }
}

function hideAllViews() {
  Object.keys(views).forEach(id => {
    if (views[id]) win.removeBrowserView(views[id])
  })
  activeTabId = null
}

function setupAdBlocker(targetSession) {
  // ... (your existing ad blocker code - unchanged)
  const { ElectronBlocker } = require('@ghostery/adblocker-electron')
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))
  ElectronBlocker.fromLists(fetch, [
    'https://easylist.to/easylist/easylist.txt',
    'https://easylist.to/easylist/easyprivacy.txt',
    'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt'
  ]).then(blocker => {
    blocker.enableBlockingInSession(targetSession)
    console.log('Ad blocker active')
  }).catch(() => {
    const blocked = ['google-analytics.com','doubleclick.net','facebook.com/tr','googlesyndication.com','adservice.google.com','ads.yahoo.com','amazon-adsystem.com','scorecardresearch.com','outbrain.com','taboola.com','criteo.com','pubmatic.com','rubiconproject.com']
    targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (!adBlockerEnabled) { callback({ requestHeaders: details.requestHeaders }); return }
      const url = details.url.toLowerCase()
      if (blocked.some(b => url.includes(b))) callback({ cancel: true })
      else callback({ requestHeaders: details.requestHeaders })
    })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 700,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hidden',
    frame: false,
    show: false,
    autoHideMenuBar: true,
  })

  // Acrylic / blur effect
  if (win.setAcrylic) {
    win.setAcrylic()
    win.setDarkTheme()
  } else if (win.setBlur) {
    win.setBlur()
  }

  win.loadFile('index.html')
  win.webContents.setBackgroundThrottling(false)
  win.once('ready-to-show', () => win.show())

  const tabSession = session.fromPartition('persist:balbos')
  tabSession.setSpellCheckerEnabled(false)
  setupAdBlocker(tabSession)

  // HTTP → HTTPS redirect
  tabSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url
    if (url.startsWith('http://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.')) {
      callback({ redirectURL: url.replace('http://', 'https://') })
    } else callback({})
  })

  win.on('resize', updateViewBounds)

  // IPC handlers
  ipcMain.on('navigate', (e, tabId, url) => {
    if (!views[tabId]) createView(tabId)
    showView(tabId)
    views[tabId].webContents.loadURL(url)
  })

  ipcMain.on('switch-tab', (e, tabId) => {
    if (!views[tabId]) createView(tabId)
    showView(tabId)
  })

  ipcMain.on('show-home', () => {
    hideAllViews()
  })

  ipcMain.on('close-tab', (e, tabId) => {
    if (views[tabId]) {
      win.removeBrowserView(views[tabId])
      views[tabId].webContents.destroy()
      delete views[tabId]
    }
  })

  ipcMain.on('hide-view', () => hideAllViews())
  ipcMain.on('show-view', (e, tabId) => {
    if (tabId && views[tabId]) showView(tabId)
  })

  // Other handlers (back, forward, reload, find, minimize, etc.) remain the same
  ipcMain.on('go-back', (e, tabId) => { if (views[tabId]) views[tabId].webContents.navigationHistory.goBack() })
  ipcMain.on('go-forward', (e, tabId) => { if (views[tabId]) views[tabId].webContents.navigationHistory.goForward() })
  ipcMain.on('reload', (e, tabId) => { if (views[tabId]) views[tabId].webContents.reload() })

  ipcMain.on('find-in-page', (e, tabId, text, forward) => {
    if (views[tabId] && text) views[tabId].webContents.findInPage(text, { forward: forward !== false })
  })
  ipcMain.on('find-next', (e, tabId) => {
    if (views[tabId]) views[tabId].webContents.findInPage('', { forward: true })
  })
  ipcMain.on('find-prev', (e, tabId) => {
    if (views[tabId]) views[tabId].webContents.findInPage('', { forward: false })
  })
  ipcMain.on('find-stop', (e, tabId) => { if (views[tabId]) views[tabId].webContents.stopFindInPage('clearSelection') })

  ipcMain.on('minimize', () => win.minimize())
  ipcMain.on('maximize', () => { if (win.isMaximized()) win.unmaximize(); else win.maximize() })
  
  ipcMain.on('window-close', () => win.close())

  ipcMain.on('set-adblocker', (e, enabled) => { adBlockerEnabled = enabled })

  ipcMain.on('clear-cache', async () => {
    await tabSession.clearCache()
    await tabSession.clearStorageData({ storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb'] })
    win.webContents.send('cache-cleared')
  })
}

app.whenReady().then(() => {
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })