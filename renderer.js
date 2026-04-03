const { ipcRenderer } = require('electron')

// Element references
const urlBar = document.getElementById('url-bar')
const homeScreen = document.getElementById('home-screen')
const btnBack = document.getElementById('btn-back')
const btnForward = document.getElementById('btn-forward')
const btnReload = document.getElementById('btn-reload')
const btnHome = document.getElementById('btn-home')
const btnGo = document.getElementById('btn-go')
const btnClose = document.getElementById('btn-close')
const btnMin = document.getElementById('btn-min')
const btnMax = document.getElementById('btn-max')
const btnNewTab = document.getElementById('btn-new-tab')
const tabList = document.getElementById('tab-list')
const btnBookmark = document.getElementById('btn-bookmark')
const btnBookmarksPanel = document.getElementById('btn-bookmarks-panel')
const btnHistoryPanel = document.getElementById('btn-history-panel')
const btnDownloadsPanel = document.getElementById('btn-downloads-panel')
const btnPasswordPanel = document.getElementById('btn-password-panel')
const btnSettingsPanel = document.getElementById('btn-settings-panel')
const btnFind = document.getElementById('btn-find')
const bookmarkPanel = document.getElementById('bookmark-panel')
const historyPanel = document.getElementById('history-panel')
const downloadsPanel = document.getElementById('downloads-panel')
const settingsPanel = document.getElementById('settings-panel')
const passwordPanel = document.getElementById('password-panel')
const findBar = document.getElementById('find-bar')
const findInput = document.getElementById('find-input')
const findCount = document.getElementById('find-count')
const loadingBar = document.getElementById('loading-fill')
const toastEl = document.getElementById('toast')
const bgLayer = document.getElementById('bg-layer')
const content = document.getElementById('content')

let tabs = []
let activeTabId = null
let nextTabId = 1

// Search engines
const searchEngines = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q='
}

// Default settings
const defaultSettings = {
  searchEngine: 'duckduckgo',
  adBlockerEnabled: true,
  homepageUrl: '',
  accentColor: '#e94560',
  bgType: 'transparent',  // transparent, color, gradient, image
  bgColor: '#0f141e',
  bgGradient: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',
  bgImage: '',
  bgOpacity: 0.18
}

let settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('balbos-settings') || '{}') }
let bookmarks = JSON.parse(localStorage.getItem('balbos-bookmarks') || '[]')
let history = JSON.parse(localStorage.getItem('balbos-history') || '[]')
let downloads = JSON.parse(localStorage.getItem('balbos-downloads') || '[]')
let passwords = JSON.parse(localStorage.getItem('balbos-passwords') || '[]')

let findMatches = 0
let currentFindMatch = 0

// ─── Tab Functions ─────────────────────────────────────
function createTab(url = null) {
  const id = nextTabId++
  tabs.push({ id, url: url || 'home', title: 'New Tab', favicon: null })
  renderTabs()
  switchTab(id)
  closeAllPanels()
  if (url) navigate(url, id)
  return id
}

function switchTab(id) {
  activeTabId = id
  const tab = tabs.find(t => t.id === id)
  if (!tab) return
  
  renderTabs()
  closeAllPanels()

  if (tab.url === 'home') {
    homeScreen.style.display = 'flex'
    urlBar.value = ''
    ipcRenderer.send('show-home')
  } else {
    homeScreen.style.display = 'none'
    urlBar.value = tab.url || ''
    ipcRenderer.send('switch-tab', id)
  }
  updateBookmarkBtn()
}

function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id)
  if (index === -1) return

  ipcRenderer.send('close-tab', id)
  tabs.splice(index, 1)

  if (!tabs.length) {
    createTab()
    return
  }

  if (activeTabId === id) {
    const newIndex = Math.min(index, tabs.length - 1)
    switchTab(tabs[newIndex].id)
  } else {
    renderTabs()
  }
}

function renderTabs() {
  tabList.innerHTML = ''
  tabs.forEach(tab => {
    const el = document.createElement('div')
    el.className = `tab-item ${tab.id === activeTabId ? 'active' : ''}`
    el.innerHTML = `
      <div class="tab-favicon">${tab.favicon ? `<img src="${tab.favicon}" width="16" height="16">` : '🌐'}</div>
      <span class="tab-label">${(tab.title || 'New Tab').substring(0, 30)}</span>
      <button class="tab-close-btn" data-tab-id="${tab.id}">×</button>
    `
    
    // Tab switch click handler
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close-btn')) {
        return // Let the close button handler take care of it
      }
      switchTab(tab.id)
    })
    
    // Tab close click handler
    const closeBtn = el.querySelector('.tab-close-btn')
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(tab.id)
    })
    
    tabList.appendChild(el)
  })
}

// ─── Navigation ──────────────────────────────────────
function navigate(input, tabId = activeTabId) {
  let url = input.trim()
  if (!url) return

  startLoading()

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.match(/^[a-z0-9][a-z0-9-]*\.[a-z]{2,}$/i) || url.includes('.')) {
      url = 'https://' + url
    } else {
      url = (searchEngines[settings.searchEngine] || searchEngines.duckduckgo) + encodeURIComponent(url)
    }
  }

  const tab = tabs.find(t => t.id === tabId)
  if (tab) {
    tab.url = url
    history.push({ title: url, url: url, timestamp: Date.now() })
    localStorage.setItem('balbos-history', JSON.stringify(history))
  }

  homeScreen.style.display = 'none'
  urlBar.value = url
  ipcRenderer.send('navigate', tabId, url)
  renderTabs()
  updateBookmarkBtn()
}

function startLoading() {
  loadingBar.classList.add('indeterminate')
}

function stopLoading() {
  loadingBar.classList.remove('indeterminate')
  loadingBar.style.width = '0%'
}

function updateBookmarkBtn() {
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab || tab.url === 'home') {
    btnBookmark.style.opacity = '0.5'
    btnBookmark.style.pointerEvents = 'none'
  } else {
    btnBookmark.style.opacity = '1'
    btnBookmark.style.pointerEvents = 'auto'
    if (bookmarks.find(b => b.url === tab.url)) {
      btnBookmark.style.color = 'var(--accent)'
    } else {
      btnBookmark.style.color = 'var(--text)'
    }
  }
}

function showToast(message) {
  toastEl.textContent = message
  toastEl.classList.add('show')
  setTimeout(() => toastEl.classList.remove('show'), 3000)
}

// ─── Apply Settings ──────────────────────────────────────
function applyTheme() {
  document.documentElement.style.setProperty('--accent', settings.accentColor)
  
  if (settings.bgType === 'transparent') {
    bgLayer.style.background = 'transparent'
  } else if (settings.bgType === 'color') {
    bgLayer.style.background = settings.bgColor
  } else if (settings.bgType === 'gradient') {
    bgLayer.style.background = settings.bgGradient
  } else if (settings.bgType === 'image' && settings.bgImage) {
    bgLayer.style.background = `url('${settings.bgImage}') center/cover`
  }
  
  bgLayer.style.opacity = settings.bgOpacity
}

// ─── Panel Management ───────────────────────────────────
const allPanels = [bookmarkPanel, historyPanel, downloadsPanel, settingsPanel, passwordPanel]

function closeAllPanels() {
  allPanels.forEach(p => p && p.classList.remove('open'))
  if (activeTabId) ipcRenderer.send('show-view', activeTabId)
}

function togglePanel(panel) {
  const isOpen = panel.classList.contains('open')
  closeAllPanels()
  if (!isOpen) {
    panel.classList.add('open')
    ipcRenderer.send('hide-view')
  }
}

// ─── Bookmark Panel ───────────────────────────────────
function renderBookmarkPanel() {
  const list = document.getElementById('bookmark-list')
  if (!list) return
  
  if (bookmarks.length === 0) {
    list.innerHTML = '<div class="panel-empty">No bookmarks yet</div>'
    return
  }
  
  list.innerHTML = bookmarks.map((b, i) => `
    <div class="panel-item" data-index="${i}">
      <span class="panel-item-title" title="${b.title}">${b.title}</span>
      <button class="item-delete" data-index="${i}">✕</button>
    </div>
  `).join('')
  
  list.querySelectorAll('.panel-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('item-delete')) {
        const idx = parseInt(el.dataset.index)
        navigate(bookmarks[idx].url)
        closeAllPanels()
      }
    })
  })
  
  list.querySelectorAll('.item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const idx = parseInt(e.target.dataset.index)
      bookmarks.splice(idx, 1)
      localStorage.setItem('balbos-bookmarks', JSON.stringify(bookmarks))
      renderBookmarkPanel()
      updateBookmarkBtn()
    })
  })
}

// ─── History Panel ───────────────────────────────────
function renderHistoryPanel() {
  const list = document.getElementById('history-list')
  if (!list) return
  
  if (history.length === 0) {
    list.innerHTML = '<div class="panel-empty">No history yet</div>'
    return
  }
  
  const reversed = history.slice().reverse()
  list.innerHTML = reversed.map((h, i) => {
    const time = new Date(h.timestamp).toLocaleString()
    return `
      <div class="panel-item" data-index="${history.length - 1 - i}">
        <div style="flex:1;">
          <span class="panel-item-title" title="${h.title}">${h.title}</span>
          <div style="font-size:11px; color:var(--text-dim);">${time}</div>
        </div>
        <button class="item-delete" data-index="${history.length - 1 - i}">✕</button>
      </div>
    `
  }).join('')
  
  list.querySelectorAll('.panel-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('item-delete')) {
        const idx = parseInt(el.dataset.index)
        navigate(history[idx].url)
        closeAllPanels()
      }
    })
  })
  
  list.querySelectorAll('.item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const idx = parseInt(e.target.dataset.index)
      history.splice(idx, 1)
      localStorage.setItem('balbos-history', JSON.stringify(history))
      renderHistoryPanel()
    })
  })
}

// ─── Downloads Panel ───────────────────────────────────
function renderDownloadsPanel() {
  const list = document.getElementById('downloads-list')
  if (!list) return
  
  if (downloads.length === 0) {
    list.innerHTML = '<div class="panel-empty">No downloads yet</div>'
    return
  }
  
  list.innerHTML = downloads.map(d => `
    <div class="download-item">
      <div class="download-name">${d.filename}</div>
      <div class="download-bar-bg">
        <div class="download-bar-fill" style="width: ${(d.receivedBytes/d.totalBytes)*100}%"></div>
      </div>
      <div class="download-status">${(d.receivedBytes/(1024*1024)).toFixed(1)}MB / ${(d.totalBytes/(1024*1024)).toFixed(1)}MB</div>
    </div>
  `).join('')
}

// ─── Password Manager ───────────────────────────────────
function renderPasswordPanel() {
  const list = document.getElementById('password-list')
  if (!list) return
  
  if (passwords.length === 0) {
    list.innerHTML = '<div class="panel-empty">No saved passwords</div>'
    return
  }
  
  list.innerHTML = passwords.map((p, i) => `
    <div class="password-item">
      <div class="pw-site">${p.site}</div>
      <div class="pw-row">
        <span class="pw-label">User:</span>
        <span class="pw-value">${p.user}</span>
        <button class="pw-copy" data-idx="${i}" data-field="user" title="Copy">📋</button>
      </div>
      <div class="pw-row">
        <span class="pw-label">Pass:</span>
        <span class="pw-value pw-hidden-${i}" data-pw="${p.pass}">••••••••</span>
        <button class="pw-show" data-idx="${i}" title="Show">👁</button>
        <button class="pw-copy" data-idx="${i}" data-field="pass" title="Copy">📋</button>
      </div>
      <button class="pw-delete" data-idx="${i}">Delete</button>
    </div>
  `).join('')
  
  // Show/hide password
  list.querySelectorAll('.pw-show').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = e.target.dataset.idx
      const el = list.querySelector(`.pw-hidden-${idx}`)
      if (el.textContent === '••••••••') {
        el.textContent = el.dataset.pw
        e.target.textContent = '🔒'
      } else {
        el.textContent = '••••••••'
        e.target.textContent = '👁'
      }
    })
  })
  
  // Copy field
  list.querySelectorAll('.pw-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx)
      const field = e.target.dataset.field
      const text = field === 'pass' ? passwords[idx].pass : passwords[idx].user
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard')
      })
    })
  })
  
  // Delete password
  list.querySelectorAll('.pw-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx)
      passwords.splice(idx, 1)
      localStorage.setItem('balbos-passwords', JSON.stringify(passwords))
      renderPasswordPanel()
    })
  })
}

// ─── Settings Panel ───────────────────────────────────
function renderSettingsPanel() {
  const body = settingsPanel.querySelector('.settings-body')
  if (!body) return
  
  // Apply saved settings to form
  const searchSelect = body.querySelector('#setting-search-engine')
  const homepageInput = body.querySelector('#setting-homepage')
  const adBlockerCheckbox = body.querySelector('#setting-adblocker')
  const colorInput = body.querySelector('#setting-color')
  const colorPreview = body.querySelector('#color-preview')
  const bgColorInput = body.querySelector('#setting-bg-color')
  const opacityInput = body.querySelector('#setting-bg-opacity')
  const opacityVal = body.querySelector('#opacity-val')
  
  if (searchSelect) searchSelect.value = settings.searchEngine
  if (homepageInput) homepageInput.value = settings.homepageUrl || ''
  if (adBlockerCheckbox) adBlockerCheckbox.checked = settings.adBlockerEnabled
  if (colorInput) colorInput.value = settings.accentColor
  if (colorPreview) colorPreview.style.background = settings.accentColor
  if (bgColorInput) bgColorInput.value = settings.bgColor
  if (opacityInput) {
    opacityInput.value = settings.bgOpacity
    opacityVal.textContent = Math.round(settings.bgOpacity * 100) + '%'
  }
  
  // Background type buttons
  const bgTypeBtns = body.querySelectorAll('.bg-type-btn')
  bgTypeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === settings.bgType)
    btn.addEventListener('click', () => {
      bgTypeBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      settings.bgType = btn.dataset.type
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      updateBackgroundUI()
      applyTheme()
    })
  })
  
  // Gradient buttons
  const gradientBtns = body.querySelectorAll('.gradient-btn')
  gradientBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      settings.bgGradient = btn.dataset.gradient
      settings.bgType = 'gradient'
      bgTypeBtns.forEach(b => b.classList.remove('active'))
      body.querySelector('[data-type="gradient"]').classList.add('active')
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      updateBackgroundUI()
      applyTheme()
    })
  })
  
  // Event listeners for settings
  if (searchSelect) {
    searchSelect.addEventListener('change', (e) => {
      settings.searchEngine = e.target.value
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
    })
  }
  
  if (homepageInput) {
    homepageInput.addEventListener('change', (e) => {
      settings.homepageUrl = e.target.value
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
    })
  }
  
  if (adBlockerCheckbox) {
    adBlockerCheckbox.addEventListener('change', (e) => {
      settings.adBlockerEnabled = e.target.checked
      ipcRenderer.send('set-adblocker', e.target.checked)
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
    })
  }
  
  if (colorInput) {
    colorInput.addEventListener('change', (e) => {
      settings.accentColor = e.target.value
      colorPreview.style.background = e.target.value
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      applyTheme()
    })
  }
  
  if (bgColorInput) {
    bgColorInput.addEventListener('change', (e) => {
      settings.bgColor = e.target.value
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      applyTheme()
    })
  }
  
  if (opacityInput) {
    opacityInput.addEventListener('input', (e) => {
      settings.bgOpacity = parseFloat(e.target.value)
      opacityVal.textContent = Math.round(settings.bgOpacity * 100) + '%'
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      applyTheme()
    })
  }
  
  // Buttons
  const resetThemeBtn = body.querySelector('#btn-reset-theme')
  if (resetThemeBtn) {
    resetThemeBtn.addEventListener('click', () => {
      settings.accentColor = defaultSettings.accentColor
      if (colorInput) colorInput.value = settings.accentColor
      if (colorPreview) colorPreview.style.background = settings.accentColor
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      applyTheme()
    })
  }
  
  const bgImageInput = body.querySelector('#setting-bg-image')
  const bgImageLabel = body.querySelector('#setting-bg-image-label')
  if (bgImageInput && bgImageLabel) {
    bgImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          settings.bgImage = event.target.result
          settings.bgType = 'image'
          bgTypeBtns.forEach(b => b.classList.remove('active'))
          body.querySelector('[data-type="image"]').classList.add('active')
          localStorage.setItem('balbos-settings', JSON.stringify(settings))
          updateBackgroundUI()
          applyTheme()
        }
        reader.readAsDataURL(file)
      }
    })
  }
  
  const clearBgBtn = body.querySelector('#btn-clear-bg')
  if (clearBgBtn) {
    clearBgBtn.addEventListener('click', () => {
      settings.bgType = 'transparent'
      settings.bgImage = ''
      bgTypeBtns.forEach(b => b.classList.remove('active'))
      body.querySelector('[data-type="transparent"]').classList.add('active')
      localStorage.setItem('balbos-settings', JSON.stringify(settings))
      updateBackgroundUI()
      applyTheme()
    })
  }
  
  const clearCacheBtn = body.querySelector('#btn-clear-cache')
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
      ipcRenderer.send('clear-cache')
      showToast('Cache cleared')
    })
  }
}

function updateBackgroundUI() {
  const body = settingsPanel.querySelector('.settings-body')
  if (!body) return
  
  const bgColorRow = body.querySelector('#bg-color-row')
  const bgGradientRow = body.querySelector('#bg-gradient-row')
  const bgImageRow = body.querySelector('#bg-image-row')
  
  if (bgColorRow) bgColorRow.style.display = settings.bgType === 'color' ? 'flex' : 'none'
  if (bgGradientRow) bgGradientRow.style.display = settings.bgType === 'gradient' ? 'flex' : 'none'
  if (bgImageRow) bgImageRow.style.display = settings.bgType === 'image' ? 'flex' : 'none'
}

// ─── Event Listeners ───────────────────────────────────
btnNewTab.addEventListener('click', () => createTab())

btnHome.addEventListener('click', () => {
  closeAllPanels()
  switchTab(createTab())
})

btnBack.addEventListener('click', () => ipcRenderer.send('go-back', activeTabId))
btnForward.addEventListener('click', () => ipcRenderer.send('go-forward', activeTabId))
btnReload.addEventListener('click', () => ipcRenderer.send('reload', activeTabId))

btnGo.addEventListener('click', () => {
  if (urlBar.value) navigate(urlBar.value)
})

urlBar.addEventListener('keydown', e => {
  if (e.key === 'Enter') navigate(urlBar.value)
})

btnClose.addEventListener('click', () => window.close())
btnMin.addEventListener('click', () => ipcRenderer.send('minimize'))
btnMax.addEventListener('click', () => ipcRenderer.send('maximize'))

// Bookmark button
btnBookmark.addEventListener('click', () => {
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab || tab.url === 'home') return
  
  const existing = bookmarks.findIndex(b => b.url === tab.url)
  if (existing !== -1) {
    bookmarks.splice(existing, 1)
    showToast('Bookmark removed')
  } else {
    bookmarks.push({ title: tab.title || tab.url, url: tab.url })
    showToast('Bookmark added')
  }
  localStorage.setItem('balbos-bookmarks', JSON.stringify(bookmarks))
  updateBookmarkBtn()
  if (bookmarkPanel.classList.contains('open')) {
    renderBookmarkPanel()
  }
})

// Panel buttons - navbar
btnBookmarksPanel.addEventListener('click', () => {
  togglePanel(bookmarkPanel)
  renderBookmarkPanel()
})

btnHistoryPanel.addEventListener('click', () => {
  togglePanel(historyPanel)
  renderHistoryPanel()
})

btnDownloadsPanel.addEventListener('click', () => {
  togglePanel(downloadsPanel)
  renderDownloadsPanel()
})

btnPasswordPanel.addEventListener('click', () => {
  togglePanel(passwordPanel)
  renderPasswordPanel()
})

btnSettingsPanel.addEventListener('click', () => {
  updateBackgroundUI()
  togglePanel(settingsPanel)
  renderSettingsPanel()
})

btnFind.addEventListener('click', () => {
  findBar.classList.toggle('open')
  if (findBar.classList.contains('open')) findInput.focus()
})

// Panel close buttons
document.getElementById('btn-close-bookmarks')?.addEventListener('click', closeAllPanels)
document.getElementById('btn-close-history')?.addEventListener('click', closeAllPanels)
document.getElementById('btn-close-downloads')?.addEventListener('click', closeAllPanels)
document.getElementById('btn-close-password')?.addEventListener('click', closeAllPanels)
document.getElementById('btn-close-settings')?.addEventListener('click', closeAllPanels)
document.getElementById('btn-find-close')?.addEventListener('click', () => findBar.classList.remove('open'))

// History clear button
document.getElementById('btn-clear-history')?.addEventListener('click', () => {
  history = []
  localStorage.setItem('balbos-history', JSON.stringify(history))
  renderHistoryPanel()
  showToast('History cleared')
})

// Downloads clear button
document.getElementById('btn-clear-downloads')?.addEventListener('click', () => {
  downloads = []
  localStorage.setItem('balbos-downloads', JSON.stringify(downloads))
  renderDownloadsPanel()
  showToast('Downloads cleared')
})

// Password manager - save button
document.getElementById('btn-save-password')?.addEventListener('click', () => {
  const site = document.getElementById('pw-site-input').value.trim()
  const user = document.getElementById('pw-user-input').value.trim()
  const pass = document.getElementById('pw-pass-input').value.trim()
  
  if (!site || !user || !pass) {
    showToast('Fill in all fields')
    return
  }
  
  passwords.push({ site, user, pass })
  localStorage.setItem('balbos-passwords', JSON.stringify(passwords))
  
  document.getElementById('pw-site-input').value = ''
  document.getElementById('pw-user-input').value = ''
  document.getElementById('pw-pass-input').value = ''
  
  renderPasswordPanel()
  showToast('Password saved')
})

// Find bar functionality
findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      ipcRenderer.send('find-prev', activeTabId)
    } else {
      ipcRenderer.send('find-next', activeTabId)
    }
  }
})

findInput.addEventListener('input', (e) => {
  if (e.target.value) {
    ipcRenderer.send('find-in-page', activeTabId, e.target.value, true)
  } else {
    ipcRenderer.send('find-stop', activeTabId)
  }
})

document.getElementById('btn-find-prev')?.addEventListener('click', () => {
  if (findInput.value) {
    ipcRenderer.send('find-in-page', activeTabId, findInput.value, false)
  }
})

document.getElementById('btn-find-next')?.addEventListener('click', () => {
  if (findInput.value) {
    ipcRenderer.send('find-in-page', activeTabId, findInput.value, true)
  }
})

// ─── IPC Listeners ───────────────────────────────────
ipcRenderer.on('url-changed', (e, url, tabId) => {
  const tab = tabs.find(t => t.id === tabId)
  if (tab) {
    tab.url = url
    if (tabId === activeTabId) {
      urlBar.value = url
    }
  }
})

ipcRenderer.on('title-changed', (e, title, tabId) => {
  const tab = tabs.find(t => t.id === tabId)
  if (tab) {
    tab.title = title
    renderTabs()
  }
})

ipcRenderer.on('favicon-changed', (e, favicon, tabId) => {
  const tab = tabs.find(t => t.id === tabId)
  if (tab) {
    tab.favicon = favicon
    renderTabs()
  }
})

ipcRenderer.on('loading-start', (e, tabId) => {
  if (tabId === activeTabId) startLoading()
})

ipcRenderer.on('loading-stop', (e, tabId) => {
  if (tabId === activeTabId) stopLoading()
})

ipcRenderer.on('download-started', (e, downloadInfo) => {
  downloads.push(downloadInfo)
  localStorage.setItem('balbos-downloads', JSON.stringify(downloads))
})

ipcRenderer.on('download-progress', (e, downloadInfo) => {
  const idx = downloads.findIndex(d => d.filename === downloadInfo.filename)
  if (idx !== -1) {
    downloads[idx] = downloadInfo
    if (downloadsPanel.classList.contains('open')) {
      renderDownloadsPanel()
    }
  }
})

ipcRenderer.on('download-done', (e, downloadInfo) => {
  showToast(`Downloaded: ${downloadInfo.filename}`)
  renderDownloadsPanel()
})

// ─── Initialization ─────────────────────────────────────
function init() {
  applyTheme()
  ipcRenderer.send('set-adblocker', settings.adBlockerEnabled)
  
  // Ensure only one tab at startup
  if (tabs.length === 0) {
    createTab()
  } else if (tabs.length > 1) {
    // Keep only the first tab if multiple were created
    tabs = [tabs[0]]
    renderTabs()
    switchTab(tabs[0].id)
  }
  
  // Check if settings has homepage and navigate
  if (settings.homepageUrl && activeTabId) {
    navigate(settings.homepageUrl, activeTabId)
  }
}

window.addEventListener('DOMContentLoaded', init)
