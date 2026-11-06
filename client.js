/**
 * dsh-novel-reader — Client half.
 *
 * Registers one right-Sidebar tab type (`kind: 'novel'`) that reads local
 * TXT / Markdown / EPUB books, plus a sidebar-foot button and a guide card
 * that open it. Parsing happens in the page; the durable shelf and every
 * reading position live in the Host half under /api/novel-reader.
 *
 * The reader remembers, per book, the chapter and the scroll ratio inside
 * that chapter. Opening the tab resumes the last book at that exact spot.
 */
window.__ModuleLoader__.load({
  id: 'dsh-novel-reader',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/api/novel-reader'
    const TAB_ID = 'dsh-novel-reader'
    const KIND = 'novel'
    const NS = 'novel'
    const SETTINGS_KEY = 'dsh.novel-reader.settings.v1'
    const MAX_IMPORT_BYTES = 80 * 1024 * 1024
    const PAGE_GAP = 40
    const DEFAULT_SETTINGS = { version: 2, theme: 'auto', font: 'song', fontSize: 16, lineHeight: 1.95, disguise: true }

    /** The fake WPS document names the cover picks from. */
    const FAKE_DOCS = [
      '2026年Q3经营分析报告（终稿）.docx',
      '2026年Q3经营分析会材料_v3.docx',
      '集团三季度经营复盘与四季度计划.docx',
      '2026年华东区域渠道分析报告.docx',
      '2026年Q3销售数据分析-内部.docx',
      '经营分析报告_2026Q3_修订版.docx',
    ]
    const BOSS_SHEET_TITLE = '2026年Q3销售数据分析-内部.xlsx'

    // The cover mode is shared by the tab body, the tab chip, the sidebar
    // button and the frame-wide sheet overlay, so it lives outside React.
    const modeListeners = new Set()
    const modeState = { document: true, boss: false, bookName: null }
    function notifyMode() {
      for (const listener of [...modeListeners]) listener()
    }
    function setMode(patch) {
      Object.assign(modeState, patch)
      notifyMode()
    }
    function useMode() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const listener = () => bump((value) => value + 1)
        modeListeners.add(listener)
        return () => modeListeners.delete(listener)
      }, [])
      return modeState
    }


    const zh = {
      'tab.title': '阅读',
      'button.label': '阅读',
      'button.tooltip': '打开本地电子书',
      'button.docLabel': '文档',
      'button.docTooltip': '打开本地文档',
      'guide.title': '本地阅读器',
      'guide.description': '在边栏读 TXT / EPUB，自动记住进度；带文档与表格伪装',
      'disguise.tab': '经营分析',
      'disguise.toggle': '文档伪装',
      'disguise.read': '阅读',
      'disguise.doc': '文档',
      'disguise.on': '文档伪装已开启 · B 切回阅读 · Esc 显示表格',
      'disguise.off': '已切回阅读视图',
      'disguise.boss': '表格伪装',
      'disguise.bossKey': 'Esc / Ctrl+Shift+X',
      'disguise.hint': 'B 切换文档伪装；Esc 或 Ctrl+Shift+X 立即显示表格。',
      'doc.head': '内部资料 · 注意保密',
      'doc.watermark': '内部资料',
      'doc.footer': '经营分析中心',
      'doc.page': '第 {current} 页，共 {total} 页',
      'doc.words': '字数 {count}',
      'doc.readonly': '当前为只读预览',
      'doc.subtitle': '内部资料 · 2026年10月',
      'doc.tableCaption': '表 {no}　区域渠道走访明细',
      'doc.tableNote': '注：数据来源于三季度区域走访汇总，供内部讨论使用。',
      'doc.col.region': '区域',
      'doc.col.channel': '渠道',
      'doc.col.stores': '走访门店',
      'doc.col.orders': '意向订单',
      'doc.col.mom': '环比',
      'doc.col.share': '占比',
      'doc.tab.file': '文件',
      'doc.tab.home': '开始',
      'doc.tab.insert': '插入',
      'doc.tab.review': '审阅',
      'doc.tab.view': '视图',
      'doc.toc': '文档结构',
      'sheet.title': '2026年Q3销售数据分析-内部.xlsx',
      'sheet.saved': '已保存',
      'sheet.close': '关闭表格伪装',
      'home.openDoc': '打开本地文档',
      'home.hintDoc': '支持 TXT、EPUB、Markdown，以文档形式打开',
      'home.emptyDoc': '还没有最近的文档',
      'home.emptyHintDoc': '导入一本文档，下次会自动回到上次的位置',
      'home.shelfDoc': '最近文档',
      'home.importedDoc': '已加入最近文档：{name}',
      'home.docMeta': '{pages} 页 · 字数 {words} · 上次 {time}',
      'home.open': '打开本地电子书',
      'home.hint': '支持 TXT、EPUB、Markdown，也可以把文件直接拖进面板',
      'home.choose': '选择文件',
      'home.shelf': '书架',
      'home.empty': '书架还是空的',
      'home.emptyHint': '导入一本 TXT 或 EPUB，下次会自动回到上次读到的位置',
      'home.continue': '继续阅读',
      'home.resumeAt': '读到第 {chapter} 章 · {percent}%',
      'home.importing': '正在解析 {name}…',
      'home.imported': '已加入书架：{name}',
      'home.importFailed': '导入失败：{message}',
      'home.emptyFile': '这个文件里没有可阅读的文字',
      'home.tooLarge': '文件超过 {size} MB，换个小一点的版本吧',
      'home.remove': '移除',
      'home.removeConfirm': '确认移除',
      'home.removed': '已移除《{name}》',
      'home.chapters': '{count} 章',
      'home.words': '{count} 字',
      'home.lastRead': '上次 {time}',
      'home.unread': '尚未开始',
      'home.retry': '重试',
      'home.loadFailed': '读取书架失败：{message}',
      'reader.loading': '正在打开…',
      'reader.openFailed': '打开失败：{message}',
      'reader.back': '返回书架',
      'reader.toc': '目录',
      'reader.settings': '阅读设置',
      'reader.prev': '上一章',
      'reader.next': '下一章',
      'reader.prevPage': '上一页',
      'reader.nextPage': '下一页',
      'reader.page': '第 {current} / {total} 页',
      'reader.chapter': '第 {current} / {total} 章',
      'reader.resumed': '已回到第 {chapter} 章',
      'reader.start': '正文',
      'reader.section': '第 {n} 节',
      'reader.empty': '这本书没有可阅读的内容',
      'reader.crash': '阅读面板出了点问题',
      'reader.epubUnsupported': '当前环境不支持解压 EPUB',
      'reader.epubInvalid': '不是有效的 EPUB 文件',
      'toc.title': '目录',
      'toc.search': '筛选章节',
      'toc.empty': '没有匹配的章节',
      'settings.theme': '背景',
      'settings.theme.auto': '自动',
      'settings.theme.paper': '纸白',
      'settings.theme.sepia': '米黄',
      'settings.theme.night': '夜间',
      'settings.font': '字体',
      'settings.font.song': '宋体',
      'settings.font.hei': '黑体',
      'settings.font.kai': '楷体',
      'settings.font.system': '系统',
      'settings.size': '字号',
      'settings.line': '行距',
      'settings.line.compact': '紧凑',
      'settings.line.normal': '标准',
      'settings.line.loose': '宽松',
      'settings.hint': '背景选「自动」时跟随 DSH 深浅色；只影响阅读区，自动保存',
      'time.justNow': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'reader.drop': '松手导入到书架',
    }

    const en = {
      'tab.title': 'Read',
      'button.label': 'Read',
      'button.tooltip': 'Open a local ebook',
      'button.docLabel': 'Docs',
      'button.docTooltip': 'Open a local document',
      'guide.title': 'Local Reader',
      'guide.description': 'Read TXT / EPUB in the Sidebar; document and spreadsheet covers built in',
      'disguise.tab': 'Analysis',
      'disguise.toggle': 'Document disguise',
      'disguise.read': 'Reader',
      'disguise.doc': 'Document',
      'disguise.on': 'Document disguise on · B back to reader · Esc shows the sheet',
      'disguise.off': 'Back to the reader view',
      'disguise.boss': 'Spreadsheet cover',
      'disguise.bossKey': 'Esc / Ctrl+Shift+X',
      'disguise.hint': 'B toggles the document disguise; Esc or Ctrl+Shift+X shows the sheet instantly.',
      'doc.head': 'INTERNAL · CONFIDENTIAL',
      'doc.watermark': 'INTERNAL',
      'doc.footer': 'Business Analysis Center',
      'doc.page': 'Page {current} of {total}',
      'doc.words': '{count} words',
      'doc.readonly': 'Read-only preview',
      'doc.subtitle': 'Internal · October 2026',
      'doc.tableCaption': 'Table {no}　Regional channel visit details',
      'doc.tableNote': 'Note: figures summarize the Q3 regional visits for internal discussion.',
      'doc.col.region': 'Region',
      'doc.col.channel': 'Channel',
      'doc.col.stores': 'Stores',
      'doc.col.orders': 'Orders',
      'doc.col.mom': 'MoM',
      'doc.col.share': 'Share',
      'doc.tab.file': 'File',
      'doc.tab.home': 'Home',
      'doc.tab.insert': 'Insert',
      'doc.tab.review': 'Review',
      'doc.tab.view': 'View',
      'doc.toc': 'Document outline',
      'sheet.title': '2026 Q3 Sales Analysis - Internal.xlsx',
      'sheet.saved': 'Saved',
      'sheet.close': 'Close the spreadsheet cover',
      'home.openDoc': 'Open a local document',
      'home.hintDoc': 'TXT, EPUB or Markdown, opened as a document',
      'home.emptyDoc': 'No recent documents',
      'home.emptyHintDoc': 'Import one and it will reopen at your last position',
      'home.shelfDoc': 'Recent documents',
      'home.importedDoc': 'Added to recent documents: {name}',
      'home.docMeta': '{pages} pages · {words} words · last read {time}',
      'home.open': 'Open a local ebook',
      'home.hint': 'TXT, EPUB or Markdown — you can also drop a file onto this panel',
      'home.choose': 'Choose a file',
      'home.shelf': 'Shelf',
      'home.empty': 'The shelf is empty',
      'home.emptyHint': 'Import a TXT or EPUB and it will reopen at your last position',
      'home.continue': 'Continue',
      'home.resumeAt': 'Chapter {chapter} · {percent}%',
      'home.importing': 'Reading {name}…',
      'home.imported': 'Added to shelf: {name}',
      'home.importFailed': 'Import failed: {message}',
      'home.emptyFile': 'No readable text in this file',
      'home.tooLarge': 'This file is over {size} MB — try a smaller copy',
      'home.remove': 'Remove',
      'home.removeConfirm': 'Confirm',
      'home.removed': 'Removed “{name}”',
      'home.chapters': '{count} chapters',
      'home.words': '{count} words',
      'home.lastRead': 'last read {time}',
      'home.unread': 'not started',
      'home.retry': 'Retry',
      'home.loadFailed': 'Could not read the shelf: {message}',
      'reader.loading': 'Opening…',
      'reader.openFailed': 'Could not open this book: {message}',
      'reader.back': 'Back to shelf',
      'reader.toc': 'Contents',
      'reader.settings': 'Reading settings',
      'reader.prev': 'Previous chapter',
      'reader.next': 'Next chapter',
      'reader.prevPage': 'Previous page',
      'reader.nextPage': 'Next page',
      'reader.page': 'Page {current} / {total}',
      'reader.chapter': 'Chapter {current} / {total}',
      'reader.resumed': 'Resumed at chapter {chapter}',
      'reader.start': 'Text',
      'reader.section': 'Section {n}',
      'reader.empty': 'This book has no readable content',
      'reader.crash': 'The reader hit a problem',
      'reader.epubUnsupported': 'This environment cannot unpack EPUB files',
      'reader.epubInvalid': 'This is not a valid EPUB file',
      'toc.title': 'Contents',
      'toc.search': 'Filter chapters',
      'toc.empty': 'No matching chapters',
      'settings.theme': 'Background',
      'settings.theme.auto': 'Auto',
      'settings.theme.paper': 'Paper',
      'settings.theme.sepia': 'Sepia',
      'settings.theme.night': 'Night',
      'settings.font': 'Typeface',
      'settings.font.song': 'Serif',
      'settings.font.hei': 'Sans',
      'settings.font.kai': 'Kai',
      'settings.font.system': 'System',
      'settings.size': 'Size',
      'settings.line': 'Leading',
      'settings.line.compact': 'Tight',
      'settings.line.normal': 'Normal',
      'settings.line.loose': 'Loose',
      'settings.hint': 'Auto follows the DSH light/dark theme; applies to the reading pane and saves automatically',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      'reader.drop': 'Drop to import',
    }

    // ---------------------------------------------------------------
    // Text
    // ---------------------------------------------------------------
    const localeRef = { current: undefined }
    const translate = (key, vars) => {
      const locale = localeRef.current
      if (locale && typeof locale.bind === 'function' && !translate.bound) translate.bound = locale.bind(NS)
      let text = translate.bound ? translate.bound(key) : undefined
      if (text == null) text = zh[key] ?? key
      if (vars) {
        text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] == null ? match : String(vars[name])))
      }
      return text
    }

    function useLocaleRevision() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const locale = localeRef.current
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => bump((value) => value + 1))
      }, [])
    }

    function useTranslate() {
      useLocaleRevision()
      return translate
    }

    // ---------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------
    const ICON_PATHS = {
      book: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5z', 'M8 7.5h8'],
      'book-open': [
        'M12 6.5C10.5 5 8 4 4.5 4v14c3.5 0 6 1 7.5 2.5 1.5-1.5 4-2.5 7.5-2.5V4C16 4 13.5 5 12 6.5z',
        'M12 6.5v14',
      ],
      'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
      'chevron-left': ['M15 5l-7 7 7 7'],
      'chevron-right': ['M9 5l7 7-7 7'],
      list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
      plus: ['M12 5v14', 'M5 12h14'],
      x: ['M6 6l12 12', 'M18 6L6 18'],
      trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 13h9l1-13', 'M10 11v6', 'M14 11v6'],
      retry: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
      'file-text': ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
      grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
    }

    function Icon({ name, size = 16, className }) {
      const props = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        'aria-hidden': 'true',
      }
      if (name === 'type') {
        return h(
          'svg',
          props,
          h(
            'text',
            {
              x: 12,
              y: 17,
              textAnchor: 'middle',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fill: 'currentColor',
              stroke: 'none',
            },
            'Aa',
          ),
        )
      }
      const paths = ICON_PATHS[name] ?? ICON_PATHS.book
      return h('svg', props, paths.map((d, index) => h('path', { key: index, d })))
    }

    /** The guide card / foot-button mark: a small original book glyph. */
    function Mark({ size = 18 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 3.5, y: 3.5, width: 25, height: 25, rx: 7.5, fill: 'currentColor', opacity: 0.14 }),
        h('path', {
          d: 'M9.5 8.5h8.2a3.4 3.4 0 0 1 3.4 3.4v12.2l-4.6-2.8-1.3.8V12a1.3 1.3 0 0 0-1.3-1.3H9.5z',
          fill: 'currentColor',
        }),
        h('path', { d: 'M10.5 17h4.2M10.5 20h3', stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.3, strokeLinecap: 'round' }),
      )
    }

    // ---------------------------------------------------------------
    // Host API
    // ---------------------------------------------------------------
    async function api(path, init) {
      const request = { cache: 'no-store', ...init }
      if (request.body != null && !request.headers) {
        request.headers = { 'content-type': 'application/json' }
      }
      const response = await fetch(API + path, request)
      const text = await response.text()
      let data = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = null
        }
      }
      if (!response.ok || data?.ok === false) {
        const message = data?.error?.message || `HTTP ${response.status}`
        throw new Error(message)
      }
      return data
    }

    // ---------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    function displayName(name) {
      return String(name || '').replace(/\.(txt|md|markdown|epub)$/i, '')
    }

    function formatLabel(format) {
      return String(format || 'txt').toUpperCase()
    }

    function formatNumber(value) {
      const number = Number(value) || 0
      try {
        return number.toLocaleString('zh-CN')
      } catch {
        return String(number)
      }
    }

    // ---------------------------------------------------------------
    // Cover: fake document names, report numbers, window presentation
    // ---------------------------------------------------------------
    function hash32(text) {
      let hash = 2166136261
      const value = String(text)
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    function fakeDocName(name) {
      if (!name) return FAKE_DOCS[0]
      return FAKE_DOCS[hash32(name) % FAKE_DOCS.length]
    }

    function docNameOnly(name) {
      return String(name || '').replace(/\.docx$/i, '')
    }

    function secNo(index) {
      return `${Math.floor(index / 10) + 1}.${(index % 10) + 1}`
    }

    function cleanTitle(title) {
      let text = String(title || '')
        .replace(/^第\s*[0-9０-９零〇一二三四五六七八九十百千万两]{1,12}\s*[章节回卷篇集部幕话]\s*/, '')
        .replace(/^Chapter\s*\d+[\s:：.]*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!text) text = translate('reader.start')
      return text
    }

    function pagesOf(chars) {
      return Math.max(16, Math.min(520, Math.round((Number(chars) || 1) / 26000)))
    }

    function fakeWordCount(pages) {
      return pages * 640
    }

    function seeded(seed) {
      let state = (seed >>> 0) || 1
      return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 4294967296
      }
    }

    function isQuoteText(text) {
      const value = String(text || '').trim()
      if (!value) return false
      if (/^[“"「『]/.test(value)) return true
      const quotes = (value.match(/[“”]/g) || []).length
      return quotes >= 2 && quotes >= value.length * 0.03
    }

    const DOC_REGIONS = ['华东', '华南', '华北', '西南', '华中', '东北']
    const DOC_CHANNELS = ['线下专柜', '电商自营', '经销商', '直播带货', '跨境出口']

    /** Deterministic rows for one inserted "visit details" table. */
    function buildDocTable(bookId, chapterIndex, tableIndex) {
      const random = seeded(hash32(`${bookId}|${chapterIndex}|${tableIndex}`))
      const pool = DOC_REGIONS.slice()
      for (let index = pool.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1))
        const value = pool[index]
        pool[index] = pool[swap]
        pool[swap] = value
      }
      const rows = pool.map((region) => ({
        region,
        channel: DOC_CHANNELS[Math.floor(random() * DOC_CHANNELS.length)],
        stores: 8 + Math.floor(random() * 62),
        orders: 2 + Math.floor(random() * 34),
        mom: Number((random() * 42 - 11).toFixed(1)),
        share: 18 + Math.floor(random() * 70),
      }))
      return { rows }
    }

    // The frame-wide spreadsheet cover: stable data, generated once.
    const BOSS_REGIONS = ['华东', '华南', '华北', '西南', '华中', '东北', '西北']
    const BOSS_CHANNELS = ['线下专柜', '电商自营', '经销商', '直播带货', '跨境出口']
    const BOSS_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    function buildBossRows() {
      const random = seeded(20261003)
      const rows = []
      for (let index = 0; index < 26; index += 1) {
        const base = 380000 + Math.floor(random() * 1900000)
        const q1 = base
        const q2 = Math.round(base * (0.92 + random() * 0.3))
        const q3 = Math.round(base * (0.95 + random() * 0.35))
        rows.push({
          region: BOSS_REGIONS[index % BOSS_REGIONS.length],
          channel: BOSS_CHANNELS[index % BOSS_CHANNELS.length],
          q1,
          q2,
          q3,
          yoy: (q3 / q1 - 1) * 100,
          mom: (q3 / q2 - 1) * 100,
          gp: 32 + random() * 22,
        })
      }
      return rows
    }
    const BOSS_ROWS = buildBossRows()

    // ---------------------------------------------------------------
    // Window presentation: fake document title + favicon while covered
    // ---------------------------------------------------------------
    const presentation = { active: false, title: '', link: null, icon: null, created: false }

    function setFavicon(color, letter) {
      let link = presentation.link
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.append(link)
        presentation.link = link
        presentation.created = true
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="${color}"/><text x="16" y="23" font-size="19" font-family="Georgia,serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`
      link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    }

    function capturePresentation() {
      presentation.title = document.title
      const link = document.querySelector("link[rel='icon']")
      presentation.link = link || null
      presentation.icon = link ? link.getAttribute('href') : null
      presentation.created = !link
      presentation.active = true
    }

    function restorePresentation() {
      if (!presentation.active) return
      document.title = presentation.title
      if (presentation.created) {
        presentation.link?.remove()
      } else if (presentation.link && presentation.icon != null) {
        presentation.link.setAttribute('href', presentation.icon)
      }
      presentation.active = false
    }

    function updatePresentation() {
      const covered = modeState.boss || (modeState.document && modeState.bookName)
      if (!covered) {
        restorePresentation()
        return
      }
      if (!presentation.active) capturePresentation()
      if (modeState.boss) {
        document.title = `${BOSS_SHEET_TITLE} - Excel`
        setFavicon('#217346', 'X')
      } else {
        document.title = `${fakeDocName(modeState.bookName)} - WPS Office`
        setFavicon('#2b579a', 'W')
      }
    }


    function timeAgo(t, timestamp) {
      if (!timestamp) return t('home.unread')
      const delta = Date.now() - timestamp
      if (delta < 60 * 1000) return t('time.justNow')
      if (delta < 60 * 60 * 1000) return t('time.minutes', { n: Math.floor(delta / 60000) })
      if (delta < 24 * 60 * 60 * 1000) return t('time.hours', { n: Math.floor(delta / 3600000) })
      if (delta < 30 * 24 * 60 * 60 * 1000) return t('time.days', { n: Math.floor(delta / 86400000) })
      const date = new Date(timestamp)
      return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
    }

    function makeId(file) {
      const seed = `${file.name}|${file.size}|${file.lastModified || 0}`
      let hash = 2166136261
      for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return `b${(hash >>> 0).toString(36)}`
    }

    function readSettings() {
      try {
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
        if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
        const known = ['auto', 'paper', 'sepia', 'night']
        const theme = known.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme
        // Settings written before the auto theme existed always carried the old
        // paper default. Move those to auto once so the reader follows a DSH
        // theme switch without asking the reader to open settings again.
        const legacy = !Number.isFinite(raw.version) || raw.version < 2
        return {
          version: 2,
          theme: legacy && theme === 'paper' ? 'auto' : theme,
          font: ['song', 'hei', 'kai', 'system'].includes(raw.font) ? raw.font : DEFAULT_SETTINGS.font,
          fontSize: Number.isFinite(raw.fontSize) ? clamp(Math.round(raw.fontSize), 12, 30) : DEFAULT_SETTINGS.fontSize,
          lineHeight: Number.isFinite(raw.lineHeight) ? clamp(raw.lineHeight, 1.4, 2.4) : DEFAULT_SETTINGS.lineHeight,
          disguise: typeof raw.disguise === 'boolean' ? raw.disguise : DEFAULT_SETTINGS.disguise,
        }
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    }

    // The persisted choice decides the very first tab title, before React mounts.
    try {
      modeState.document = readSettings().disguise
    } catch {
      modeState.document = true
    }

    function fontStack(name) {
      if (name === 'hei') return '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'
      if (name === 'kai') return '"KaiTi", "Kaiti SC", "STKaiti", "Noto Serif CJK SC", serif'
      if (name === 'system') return 'system-ui, -apple-system, "Segoe UI", sans-serif'
      return '"Songti SC", "SimSun", "Noto Serif CJK SC", serif'
    }

    // ---------------------------------------------------------------
    // Text decoding + chapter parsing
    // ---------------------------------------------------------------
    const CHAPTER_PATTERNS = [
      /^(第\s*[0-9０-９零〇一二三四五六七八九十百千万两]{1,12}\s*[章节回卷篇集部幕话][^\n]{0,40})$/,
      /^(序章|序言|楔子|引子|前言|尾声|后记|终章|大结局|番外)[\s:：·、]?([^\n]{0,40})$/,
      /^(Chapter\s+\d{1,4})[\s:：.]?([^\n]{0,40})$/i,
      /^(正文\s*第\s*[0-9零一二三四五六七八九十百千万两]{1,12}\s*[章节回][^\n]{0,40})$/,
    ]

    function matchChapterTitle(line) {
      const text = line.trim()
      if (!text || text.length > 40) return null
      if (text.includes('。')) return null
      for (const pattern of CHAPTER_PATTERNS) {
        if (pattern.test(text)) return text.replace(/\s+/g, ' ')
      }
      return null
    }

    function decodeBuffer(buffer) {
      const bytes = new Uint8Array(buffer)
      if (bytes.length === 0) return { text: '', encoding: 'unknown' }
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return { text: new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, ''), encoding: 'UTF-8' }
      }
      if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: new TextDecoder('utf-16le').decode(buffer).replace(/^\uFEFF/, ''), encoding: 'UTF-16LE' }
      }
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: new TextDecoder('utf-16be').decode(buffer).replace(/^\uFEFF/, ''), encoding: 'UTF-16BE' }
      }
      try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' }
      } catch {
        // Not valid UTF-8; try the Chinese code pages below.
      }
      for (const encoding of ['gb18030', 'gbk', 'big5']) {
        try {
          const text = new TextDecoder(encoding).decode(buffer)
          const bad = (text.match(/\uFFFD/g) || []).length
          if (bad / Math.max(1, text.length) < 0.01) return { text, encoding: encoding.toUpperCase() }
        } catch {
          // Unsupported decoder; keep trying.
        }
      }
      return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'UTF-8' }
    }

    function foldParagraphs(paragraphs, size) {
      const chunks = []
      let buffer = []
      let count = 0
      for (const paragraph of paragraphs) {
        buffer.push(paragraph)
        count += paragraph.length
        if (count >= size) {
          chunks.push(buffer)
          buffer = []
          count = 0
        }
      }
      if (buffer.length) chunks.push(buffer)
      return chunks
    }

    function finalizeChapters(list, fallback) {
      const chapters = []
      for (const item of list) {
        const blocks = item.blocks && item.blocks.length ? item.blocks : (item.paras || []).map((value) => ({ t: 'p', v: value }))
        if (!blocks.length) continue
        chapters.push({
          title: item.title || `${fallback} ${chapters.length + 1}`,
          ...(item.implicit ? { implicit: true } : {}),
          blocks,
        })
      }
      const charCount = chapters.reduce(
        (total, chapter) => total + chapter.blocks.reduce((sum, block) => sum + block.v.length, 0),
        0,
      )
      return { chapters, charCount }
    }

    function textChapters(text) {
      const lines = text.split(/\r\n|\r|\n/)
      const raw = []
      let current = null
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const title = matchChapterTitle(trimmed)
        if (title) {
          current = { title, paras: [] }
          raw.push(current)
        } else {
          if (!current) {
            current = { title: translate('reader.start'), paras: [], implicit: true }
            raw.push(current)
          }
          current.paras.push(trimmed)
        }
      }

      let list = raw.filter((chapter) => chapter.paras.length > 0)
      if (list.length === 0) {
        const all = lines.map((line) => line.trim()).filter(Boolean)
        if (all.length === 0) throw new Error(translate('home.emptyFile'))
        list = foldParagraphs(all, 6000).map((paras, index) => ({
          title: translate('reader.section', { n: index + 1 }),
          paras,
        }))
      } else if (list.length === 1) {
        list = foldParagraphs(list[0].paras, 6000).map((paras, index) => ({
          title: translate('reader.section', { n: index + 1 }),
          paras,
        }))
      }

      return finalizeChapters(list, translate('reader.start'))
    }

    function markdownChapters(text) {
      const lines = text.split(/\r\n|\r|\n/)
      const raw = []
      let current = null
      let fenced = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (/^```/.test(trimmed)) {
          fenced = !fenced
          continue
        }
        const heading = !fenced && trimmed.match(/^(#{1,3})\s+(.+)$/)
        if (heading) {
          current = { title: heading[2].trim(), blocks: [] }
          raw.push(current)
          continue
        }
        if (!trimmed) continue
        if (!current) {
          current = { title: translate('reader.start'), blocks: [], implicit: true }
          raw.push(current)
        }
        if (fenced) current.blocks.push({ t: 'pre', v: line })
        else if (/^>\s?/.test(trimmed)) current.blocks.push({ t: 'q', v: trimmed.replace(/^>\s?/, '') })
        else if (/^[-*+]\s+/.test(trimmed)) current.blocks.push({ t: 'p', v: `· ${trimmed.replace(/^[-*+]\s+/, '')}` })
        else current.blocks.push({ t: 'p', v: trimmed })
      }

      let list = raw.filter((chapter) => chapter.blocks && chapter.blocks.length)
      if (list.length === 0) throw new Error(translate('home.emptyFile'))
      if (list.length === 1) {
        const paragraphs = list[0].blocks.filter((block) => block.t === 'p').map((block) => block.v)
        if (paragraphs.length > 0) {
          list = foldParagraphs(paragraphs, 6000).map((paras, index) => ({
            title: translate('reader.section', { n: index + 1 }),
            blocks: paras.map((value) => ({ t: 'p', v: value })),
          }))
        }
      }
      return finalizeChapters(list, 'Section')
    }

    // ---------------------------------------------------------------
    // EPUB (ZIP + OPF + spine)
    // ---------------------------------------------------------------
    async function inflateRaw(bytes) {
      if (typeof DecompressionStream !== 'function') throw new Error(translate('reader.epubUnsupported'))
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }

    async function openZip(buffer) {
      const bytes = new Uint8Array(buffer)
      const view = new DataView(buffer)
      let end = -1
      for (let cursor = bytes.length - 22; cursor >= Math.max(0, bytes.length - 66000); cursor -= 1) {
        if (view.getUint32(cursor, true) === 0x06054b50) {
          end = cursor
          break
        }
      }
      if (end < 0) throw new Error(translate('reader.epubInvalid'))
      const count = view.getUint16(end + 10, true)
      const offset = view.getUint32(end + 16, true)
      const entries = new Map()
      let cursor = offset
      for (let index = 0; index < count; index += 1) {
        if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) break
        const method = view.getUint16(cursor + 10, true)
        const compressedSize = view.getUint32(cursor + 20, true)
        const nameLength = view.getUint16(cursor + 28, true)
        const extraLength = view.getUint16(cursor + 30, true)
        const commentLength = view.getUint16(cursor + 32, true)
        const localOffset = view.getUint32(cursor + 42, true)
        const name = new TextDecoder('utf-8').decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
        entries.set(name, { method, compressedSize, localOffset })
        cursor += 46 + nameLength + extraLength + commentLength
      }
      if (entries.size === 0) throw new Error(translate('reader.epubInvalid'))

      async function read(name) {
        const entry = entries.get(name)
        if (!entry) return null
        const local = entry.localOffset
        if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return null
        const nameLength = view.getUint16(local + 26, true)
        const extraLength = view.getUint16(local + 28, true)
        const start = local + 30 + nameLength + extraLength
        const data = bytes.subarray(start, start + entry.compressedSize)
        if (entry.method === 0) return data
        if (entry.method === 8) return inflateRaw(data)
        throw new Error(translate('reader.epubInvalid'))
      }

      return { read }
    }

    function resolveHref(base, href) {
      if (!href) return ''
      const cleaned = href.split('#')[0]
      if (!cleaned) return ''
      let decoded = cleaned
      try {
        decoded = decodeURIComponent(cleaned)
      } catch {
        decoded = cleaned
      }
      const segments = `${base}${decoded}`.split('/')
      const stack = []
      for (const segment of segments) {
        if (!segment || segment === '.') continue
        if (segment === '..') stack.pop()
        else stack.push(segment)
      }
      return stack.join('/')
    }

    function elementsByLocalName(root, name) {
      const output = []
      if (!root) return output
      const all = root.getElementsByTagName('*')
      for (let index = 0; index < all.length; index += 1) {
        const node = all[index]
        const local = (node.localName || node.nodeName || '').toLowerCase()
        if (local === name) output.push(node)
      }
      return output
    }

    function firstByLocalName(root, name) {
      return elementsByLocalName(root, name)[0] || null
    }

    function blocksFromHtml(doc) {
      const body = doc.body || doc.documentElement
      if (!body) return []
      const nodes = Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre'))
      const blocks = []
      for (const node of nodes) {
        if (node.querySelector('p,blockquote,pre,h1,h2,h3,h4,h5,h6')) continue
        const tag = node.tagName.toLowerCase()
        const raw = node.textContent || ''
        if (tag === 'pre') {
          const value = raw.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
          if (value.trim()) blocks.push({ t: 'pre', v: value })
          continue
        }
        const value = raw.replace(/\s+/g, ' ').trim()
        if (!value) continue
        if (/^h[1-6]$/.test(tag)) blocks.push({ t: 'h', v: value })
        else if (tag === 'blockquote') blocks.push({ t: 'q', v: value })
        else blocks.push({ t: 'p', v: value })
      }
      if (blocks.length === 0) {
        const value = (body.textContent || '').replace(/\s+/g, ' ').trim()
        if (value) blocks.push({ t: 'p', v: value })
      }
      return blocks
    }

    function parseXml(text, type) {
      const doc = new DOMParser().parseFromString(text, type)
      if (doc.querySelector('parsererror')) throw new Error(translate('reader.epubInvalid'))
      return doc
    }

    function decodeXmlBytes(bytes) {
      if (!bytes) return ''
      return decodeBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).text
    }

    async function parseEpub(buffer, fileName) {
      const zip = await openZip(buffer)
      const containerBytes = await zip.read('META-INF/container.xml')
      if (!containerBytes) throw new Error(translate('reader.epubInvalid'))
      const container = parseXml(decodeXmlBytes(containerBytes), 'application/xml')
      const rootfile = elementsByLocalName(container, 'rootfile')[0]
      const opfPath = rootfile?.getAttribute('full-path')
      if (!opfPath) throw new Error(translate('reader.epubInvalid'))
      const opfBytes = await zip.read(opfPath)
      if (!opfBytes) throw new Error(translate('reader.epubInvalid'))
      const opf = parseXml(decodeXmlBytes(opfBytes), 'application/xml')
      const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

      const manifest = new Map()
      for (const item of elementsByLocalName(opf, 'item')) {
        const id = item.getAttribute('id')
        if (!id) continue
        manifest.set(id, {
          href: item.getAttribute('href') || '',
          type: item.getAttribute('media-type') || '',
          properties: item.getAttribute('properties') || '',
        })
      }
      const spine = elementsByLocalName(opf, 'itemref')
        .map((item) => item.getAttribute('idref'))
        .filter(Boolean)

      const tocTitles = new Map()
      const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'))
      if (navItem) {
        try {
          const navPath = resolveHref(opfDir, navItem.href)
          const navBytes = await zip.read(navPath)
          if (navBytes) {
            const navDoc = new DOMParser().parseFromString(decodeXmlBytes(navBytes), 'text/html')
            const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/') + 1) : ''
            const anchors = navDoc.querySelectorAll('nav a[href], a[href]')
            for (const anchor of anchors) {
              const title = (anchor.textContent || '').replace(/\s+/g, ' ').trim()
              const target = resolveHref(navDir, anchor.getAttribute('href'))
              if (title && target && !tocTitles.has(target)) tocTitles.set(target, title)
            }
          }
        } catch {
          // A broken navigation document should not cost the whole book.
        }
      }
      if (tocTitles.size === 0) {
        const ncxItem = [...manifest.values()].find((item) => item.type === 'application/x-dtbncx+xml')
        if (ncxItem) {
          try {
            const ncxPath = resolveHref(opfDir, ncxItem.href)
            const ncxBytes = await zip.read(ncxPath)
            if (ncxBytes) {
              const ncx = parseXml(decodeXmlBytes(ncxBytes), 'application/xml')
              const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/') + 1) : ''
              for (const point of elementsByLocalName(ncx, 'navpoint')) {
                const label = firstByLocalName(point, 'text')?.textContent?.replace(/\s+/g, ' ').trim()
                const source = firstByLocalName(point, 'content')?.getAttribute('src')
                const target = resolveHref(ncxDir, source || '')
                if (label && target && !tocTitles.has(target)) tocTitles.set(target, label)
              }
            }
          } catch {
            // Same as above: chapter titles fall back to headings.
          }
        }
      }

      const seen = new Set()
      const chapters = []
      let charCount = 0
      const bookTitle = displayName(fileName || '')
      for (const idref of spine) {
        const item = manifest.get(idref)
        if (!item || !item.href) continue
        const path = resolveHref(opfDir, item.href)
        if (!path || seen.has(path)) continue
        seen.add(path)
        if (item.type && !/html|xml/.test(item.type)) continue
        const bytes = await zip.read(path)
        if (!bytes) continue
        const doc = new DOMParser().parseFromString(decodeXmlBytes(bytes), 'text/html')
        const blocks = blocksFromHtml(doc)
        if (blocks.length === 0) continue
        const headingText = blocks.find((block) => block.t === 'h')?.v || ''
        const title = tocTitles.get(path) || headingText ||
          (doc.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim() ||
          (bookTitle ? `${bookTitle} ${chapters.length + 1}` : `${translate('reader.section', { n: chapters.length + 1 })}`)
        if (blocks[0] && blocks[0].t === 'h' && blocks[0].v.trim() === title.trim()) blocks.shift()
        if (blocks.length === 0) continue
        const chapter = { title, blocks }
        chapters.push(chapter)
        charCount += blocks.reduce((sum, block) => sum + block.v.length, 0)
      }

      if (chapters.length === 0) throw new Error(translate('home.emptyFile'))
      return { format: 'epub', encoding: 'UTF-8', chapters, charCount }
    }

    async function parseEbookFile(file) {
      const extension = (file.name.split('.').pop() || '').toLowerCase()
      if (extension === 'epub') {
        return parseEpub(await file.arrayBuffer(), file.name)
      }
      const buffer = await file.arrayBuffer()
      const { text, encoding } = decodeBuffer(buffer)
      if (!text || !text.trim()) throw new Error(translate('home.emptyFile'))
      if (extension === 'md' || extension === 'markdown') {
        return { format: 'md', encoding, ...markdownChapters(text) }
      }
      return { format: 'txt', encoding, ...textChapters(text) }
    }

    // ---------------------------------------------------------------
    // Chrome pieces
    // ---------------------------------------------------------------
    function Header({ t, view, title, disguise, onHome, onToc, onSettings, onDisguise, onImport, tocOpen, settingsOpen }) {
      const homeTitle = t('home.shelf')
      return h(
        'header',
        { className: 'nr-head' },
        view === 'reader'
          ? h(
              'button',
              {
                type: 'button',
                className: 'nr-iconbtn',
                onClick: onHome,
                title: t('reader.back'),
                'aria-label': t('reader.back'),
              },
              h(Icon, { name: 'arrow-left' }),
            )
          : h('span', { className: 'nr-brand' }, h(Icon, { name: 'book-open', size: 14 })),
        h('div', { className: 'nr-title', title: view === 'reader' ? title : homeTitle }, view === 'reader' ? title : homeTitle),
        h('span', { className: 'nr-grow' }),
        view === 'home'
          ? h(
              React.Fragment,
              null,
              h(
                'button',
                {
                  type: 'button',
                  className: `nr-iconbtn${disguise ? ' on' : ''}`,
                  onClick: onDisguise,
                  title: `${t('disguise.toggle')} (B)`,
                  'aria-label': t('disguise.toggle'),
                },
                h(Icon, { name: 'file-text' }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'nr-iconbtn',
                  onClick: onImport,
                  title: t('home.open'),
                  'aria-label': t('home.open'),
                },
                h(Icon, { name: 'plus' }),
              ),
            )
          : h(
              React.Fragment,
              null,
              h(
                'button',
                {
                  type: 'button',
                  className: `nr-iconbtn${disguise ? ' on' : ''}`,
                  onClick: onDisguise,
                  title: `${t('disguise.toggle')} (B)`,
                  'aria-label': t('disguise.toggle'),
                },
                h(Icon, { name: 'file-text' }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `nr-iconbtn${tocOpen ? ' on' : ''}`,
                  onClick: onToc,
                  title: t('reader.toc'),
                  'aria-label': t('reader.toc'),
                  'aria-expanded': tocOpen ? 'true' : 'false',
                },
                h(Icon, { name: 'list' }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `nr-iconbtn${settingsOpen ? ' on' : ''}`,
                  onClick: onSettings,
                  title: t('reader.settings'),
                  'aria-label': t('reader.settings'),
                  'aria-expanded': settingsOpen ? 'true' : 'false',
                },
                h(Icon, { name: 'type' }),
              ),
            ),
      )
    }

    /** The fake WPS title bar + menu row shown while the document disguise is on. */
    function DocHeader({ t, docName, onHome, onToc, onSettings, onRead, onBoss, onNotice }) {
      const tabs = [
        ['file', t('doc.tab.file')],
        ['home', t('doc.tab.home')],
        ['insert', t('doc.tab.insert')],
        ['review', t('doc.tab.review')],
        ['view', t('doc.tab.view')],
      ]
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'nr-docbar' },
          h(
            'button',
            {
              type: 'button',
              className: 'nr-iconbtn nr-docbar-back',
              onClick: onHome,
              title: t('reader.back'),
              'aria-label': t('reader.back'),
            },
            h(Icon, { name: 'arrow-left', size: 14 }),
          ),
          h('span', { className: 'nr-docname', title: docName || '' }, docName || t('doc.head')),
          h('span', { className: 'nr-docsaved' }, t('sheet.saved')),
          h('span', { className: 'nr-grow' }),
          h(
            'button',
            {
              type: 'button',
              className: 'nr-iconbtn nr-docbar-icon',
              onClick: onToc,
              title: t('doc.toc'),
              'aria-label': t('doc.toc'),
            },
            h(Icon, { name: 'list', size: 15 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'nr-iconbtn nr-docbar-icon',
              onClick: onSettings,
              title: t('reader.settings'),
              'aria-label': t('reader.settings'),
            },
            h(Icon, { name: 'type', size: 15 }),
          ),
        ),
        h(
          'div',
          { className: 'nr-doctabs' },
          tabs.map(([key, label]) =>
            h(
              'span',
              {
                key,
                className: `nr-doctab${key === 'home' ? ' on' : ''}${key === 'view' ? ' nr-doctab-view' : ''}`,
                onClick: key === 'view' ? onBoss : key === 'home' ? undefined : onNotice,
                title: key === 'view' ? t('disguise.bossKey') : undefined,
              },
              label,
            ),
          ),
          h('span', { className: 'nr-grow' }),
          h(
            'button',
            {
              type: 'button',
              className: 'nr-iconbtn nr-doctab-read',
              onClick: onRead,
              title: `${t('disguise.read')} (B)`,
              'aria-label': t('disguise.read'),
            },
            h(Icon, { name: 'book', size: 14 }),
          ),
        ),
      )
    }

    /** One report-looking data table inside the disguised chapter. */
    function DocTable({ t, table, no }) {
      return h(
        'div',
        { className: 'nr-doc-table' },
        h('div', { className: 'nr-doc-cap' }, t('doc.tableCaption', { no })),
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, t('doc.col.region')),
              h('th', null, t('doc.col.channel')),
              h('th', { className: 'num' }, t('doc.col.stores')),
              h('th', { className: 'num' }, t('doc.col.orders')),
              h('th', { className: 'num' }, t('doc.col.mom')),
              h('th', null, t('doc.col.share')),
            ),
          ),
          h(
            'tbody',
            null,
            table.rows.map((row, index) =>
              h(
                'tr',
                { key: index },
                h('td', null, row.region),
                h('td', null, row.channel),
                h('td', { className: 'num' }, row.stores),
                h('td', { className: 'num' }, row.orders),
                h('td', { className: `num ${row.mom >= 0 ? 'up' : 'down'}` }, `${row.mom > 0 ? '+' : ''}${row.mom.toFixed(1)}%`),
                h('td', null, h('div', { className: 'nr-doc-bar' }, h('i', { style: { width: `${row.share}%` } }))),
              ),
            ),
          ),
        ),
        h('div', { className: 'nr-doc-note' }, t('doc.tableNote')),
      )
    }

    /** Chapter blocks with report tables woven in at fixed intervals. */
    function buildDocItems(book, chapterIndex) {
      const chapter = book.chapters[chapterIndex]
      if (!chapter) return []
      const items = []
      let tableNo = 0
      chapter.blocks.forEach((block, index) => {
        const quote = block.t === 'q' || (block.t === 'p' && isQuoteText(block.v))
        items.push({ key: `b${index}`, kind: block.t, text: block.v, quote })
        if (index % 8 === 3 && tableNo < 6) {
          tableNo += 1
          items.push({
            key: `t${index}`,
            kind: 'table',
            table: buildDocTable(book.meta.id, chapterIndex, tableNo),
            no: `${secNo(chapterIndex)}-${tableNo}`,
          })
        }
      })
      return items
    }

    /** The frame-wide spreadsheet that covers the whole app on Esc / Ctrl+Shift+X. */
    function BossOverlay() {
      const t = useTranslate()
      const mode = useMode()
      const overlayRef = React.useRef(null)

      React.useEffect(() => {
        if (!mode.boss) return undefined
        const node = overlayRef.current
        try {
          node?.focus({ preventScroll: true })
        } catch {
          node?.focus()
        }
        return undefined
      }, [mode.boss])

      if (!mode.boss) return null

      const close = () => setMode({ boss: false })
      const groups = [
        ['剪贴板', ['粘贴', '剪切', '复制']],
        ['字体', ['宋体', '11', 'B', 'I', 'U']],
        ['对齐方式', ['左', '中', '右']],
        ['数字', ['¥', '%', '0.00']],
        ['样式', ['条件格式', '套用格式']],
        ['编辑', ['求和', '排序', '筛选']],
      ]
      const fields = ['区域', '渠道', 'Q1 销售额', 'Q2 销售额', 'Q3 销售额', '同比', '环比', '毛利率']

      return h(
        'div',
        {
          className: 'nr-boss',
          ref: overlayRef,
          tabIndex: -1,
          role: 'presentation',
          'aria-label': BOSS_SHEET_TITLE,
          onKeyDown: (event) => {
            if (event.key === 'Escape' || event.key === 'Enter') {
              event.preventDefault()
              close()
            } else {
              event.stopPropagation()
            }
          },
        },
        h(
          'div',
          { className: 'nr-boss-titlebar' },
          h('span', { className: 'nr-boss-logo' }, 'X'),
          h('span', { className: 'nr-boss-file' }, BOSS_SHEET_TITLE),
          h('span', { className: 'nr-boss-saved' }, t('sheet.saved')),
          h('span', { className: 'nr-boss-grow' }),
          h('span', { className: 'nr-boss-win' }, '—'),
          h('span', { className: 'nr-boss-win' }, '□'),
          h(
            'button',
            {
              type: 'button',
              className: 'nr-boss-close',
              onClick: close,
              title: t('sheet.close'),
              'aria-label': t('sheet.close'),
              tabIndex: -1,
            },
            '×',
          ),
        ),
        h(
          'div',
          { className: 'nr-boss-tabs' },
          ['文件', '开始', '插入', '页面布局', '公式', '数据', '审阅', '视图'].map((label, index) =>
            h('span', { key: label, className: `nr-boss-tab${index === 1 ? ' on' : ''}` }, label),
          ),
        ),
        h(
          'div',
          { className: 'nr-boss-ribbon' },
          groups.map(([label, tools]) =>
            h(
              'div',
              { className: 'nr-boss-group', key: label },
              h('div', { className: 'nr-boss-tools' }, tools.map((tool) => h('span', { className: 'nr-boss-tool', key: tool }, tool))),
              h('span', { className: 'nr-boss-group-label' }, label),
            ),
          ),
        ),
        h(
          'div',
          { className: 'nr-boss-formula' },
          h('span', { className: 'nr-boss-namebox' }, 'E7'),
          h('span', { className: 'nr-boss-fx' }, 'fx'),
          h('span', { className: 'nr-boss-formula-text' }, '=SUM(E2:E27)/COUNT(E2:E27)'),
        ),
        h(
          'div',
          { className: 'nr-boss-grid' },
          h(
            'table',
            null,
            h(
              'thead',
              null,
              h(
                'tr',
                { className: 'letters' },
                h('th', { className: 'corner' }),
                BOSS_LETTERS.slice(0, 8).map((letter) => h('th', { key: letter, className: 'letter' }, letter)),
              ),
              h(
                'tr',
                { className: 'fields' },
                h('th', { className: 'corner' }),
                fields.map((field) => h('th', { key: field }, field)),
              ),
            ),
            h(
              'tbody',
              null,
              BOSS_ROWS.map((row, index) =>
                h(
                  'tr',
                  { key: index },
                  h('th', { className: 'rownum' }, index + 1),
                  h('td', null, row.region),
                  h('td', null, row.channel),
                  h('td', { className: 'num' }, formatNumber(row.q1)),
                  h('td', { className: 'num' }, formatNumber(row.q2)),
                  h('td', { className: `num${index === 6 ? ' nr-boss-sel' : ''}` }, formatNumber(row.q3)),
                  h('td', { className: `num ${row.yoy >= 0 ? 'up' : 'down'}` }, `${row.yoy >= 0 ? '+' : ''}${row.yoy.toFixed(1)}%`),
                  h('td', { className: `num ${row.mom >= 0 ? 'up' : 'down'}` }, `${row.mom >= 0 ? '+' : ''}${row.mom.toFixed(1)}%`),
                  h('td', { className: 'num' }, `${row.gp.toFixed(1)}%`),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'nr-boss-sheet-tabs' },
          ['汇总表', '明细1', '明细2', '同比分析'].map((label, index) =>
            h('span', { key: label, className: `nr-boss-sheet${index === 0 ? ' on' : ''}` }, label),
          ),
          h('span', { className: 'nr-boss-grow' }),
          h('span', { className: 'nr-boss-zoom' }, '100%'),
        ),
        h(
          'div',
          { className: 'nr-boss-status' },
          h('span', null, '就绪'),
          h('span', null, '平均值: 1,842,377'),
          h('span', null, '计数: 486'),
          h('span', null, '求和: 89,634,112'),
          h('span', { className: 'nr-boss-grow' }),
          h('span', null, '100%'),
        ),
      )
    }

    /** The tab chip: fake document title only while a book is being read. */
    function TabTitle() {
      useLocaleRevision()
      const mode = useMode()
      const label = mode.document && mode.bookName ? translate('disguise.tab') : translate('tab.title')
      return h('span', { className: 'nr-tab-title' }, label)
    }

    function progressText(t, book) {
      const progress = book.progress
      if (!progress) return t('home.unread')
      const percent = Math.round(clamp(progress.percent || 0, 0, 1) * 100)
      if (percent >= 100) return '100%'
      return t('home.resumeAt', { chapter: (progress.chapter || 0) + 1, percent })
    }

    function bookMetaLine(t, book) {
      const parts = [
        t('home.chapters', { count: book.chapterCount || 0 }),
        t('home.words', { count: formatNumber(book.charCount || 0) }),
        book.progress ? t('home.lastRead', { time: timeAgo(t, book.progress.at) }) : t('home.unread'),
      ]
      return parts.join(' · ')
    }

    function BookRow({ t, book, confirm, onOpen, onRemove, onConfirm }) {
      const percent = Math.round(clamp(book.progress?.percent || 0, 0, 1) * 100)
      return h(
        'div',
        {
          className: 'nr-row',
          role: 'button',
          tabIndex: 0,
          onClick: () => onOpen(book),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(book)
            }
          },
        },
        h('span', { className: 'nr-format' }, formatLabel(book.format)),
        h(
          'span',
          { className: 'nr-row-main' },
          h('span', { className: 'nr-row-name', title: book.name }, displayName(book.name)),
          h('span', { className: 'nr-row-meta' }, bookMetaLine(t, book)),
        ),
        percent > 0 ? h('span', { className: 'nr-row-pct' }, `${percent}%`) : null,
        h(
          'button',
          {
            type: 'button',
            className: `nr-row-del${confirm ? ' confirm' : ''}`,
            title: confirm ? t('home.removeConfirm') : t('home.remove'),
            'aria-label': confirm ? t('home.removeConfirm') : t('home.remove'),
            onClick: (event) => {
              event.stopPropagation()
              if (confirm) onRemove(book)
              else onConfirm(book.id)
            },
          },
          confirm ? t('home.removeConfirm') : h(Icon, { name: 'trash', size: 13 }),
        ),
      )
    }

    function Home({ t, library, onChoose, onOpen, onRemove, onConfirm, onRetry, confirmId }) {
      const books = library.books || []
      const continueBook =
        books.find((book) => book.id === library.lastOpened) ||
        [...books].sort((left, right) => (right.progress?.at || 0) - (left.progress?.at || 0))[0] ||
        null

      if (library.status === 'loading') {
        return h('div', { className: 'nr-home' }, h('div', { className: 'nr-empty' }, h('span', { className: 'nr-spin' }), t('reader.loading')))
      }

      if (library.status === 'error') {
        return h(
          'div',
          { className: 'nr-home' },
          h(
            'div',
            { className: 'nr-empty' },
            h('div', null, t('home.loadFailed', { message: library.error || '' })),
            h(
              'button',
              { type: 'button', className: 'nr-primary', onClick: onRetry },
              h(Icon, { name: 'retry', size: 14 }),
              t('home.retry'),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: 'nr-home' },
        h(
          'button',
          { type: 'button', className: 'nr-hero', onClick: onChoose },
          h('span', { className: 'nr-hero-icon' }, h(Icon, { name: 'book-open', size: 22 })),
          h('span', { className: 'nr-hero-title' }, t('home.open')),
          h('span', { className: 'nr-hero-hint' }, t('home.hint')),
          h('span', { className: 'nr-primary' }, t('home.choose')),
        ),
        continueBook
          ? h(
              'button',
              { type: 'button', className: 'nr-continue', onClick: () => onOpen(continueBook) },
              h('span', { className: 'nr-continue-badge' }, formatLabel(continueBook.format)),
              h(
                'span',
                { className: 'nr-continue-body' },
                h('span', { className: 'nr-continue-name', title: continueBook.name }, displayName(continueBook.name)),
                h('span', { className: 'nr-continue-meta' }, progressText(t, continueBook)),
                h(
                  'span',
                  { className: 'nr-bar' },
                  h('i', { style: { width: `${Math.round(clamp(continueBook.progress?.percent || 0, 0, 1) * 100)}%` } }),
                ),
              ),
              h('span', { className: 'nr-continue-go' }, t('home.continue')),
            )
          : null,
        books.length
          ? h(
              React.Fragment,
              null,
              h(
                'div',
                { className: 'nr-section' },
                h('span', null, t('home.shelf')),
                h('span', { className: 'nr-count' }, books.length),
              ),
              h(
                'div',
                { className: 'nr-list' },
                books.map((book) =>
                  h(BookRow, {
                    key: book.id,
                    t,
                    book,
                    confirm: confirmId === book.id,
                    onOpen,
                    onRemove,
                    onConfirm,
                  }),
                ),
              ),
            )
          : h(
              'div',
              { className: 'nr-empty' },
              h('div', { className: 'nr-empty-title' }, t('home.empty')),
              h('div', { className: 'nr-empty-hint' }, t('home.emptyHint')),
            ),
      )
    }

    function Reader({
      t,
      book,
      chapter,
      settings,
      disguise,
      page,
      pageCount,
      stride,
      columnWidth,
      overallPercent,
      docPage,
      docPages,
      atStart,
      atEnd,
      bodyRef,
      contentRef,
      onPrevPage,
      onNextPage,
    }) {
      const current = book.chapters[chapter]
      const docItems = React.useMemo(() => (disguise ? buildDocItems(book, chapter) : null), [disguise, book, chapter])
      if (!current) return null
      const docHead = docNameOnly(fakeDocName(book.meta.name))
      const title = current.implicit
        ? null
        : disguise
          ? `${secNo(chapter)} ${cleanTitle(current.title)}`
          : current.title
      return h(
        'div',
        {
          className: `nr-reader${disguise ? ' nr-doc' : ''}`,
          'data-theme': settings.theme,
          style: {
            '--nr-fs': `${settings.fontSize}px`,
            '--nr-lh': String(settings.lineHeight),
            '--nr-ff': fontStack(settings.font),
          },
        },
        disguise ? null : h('div', { className: 'nr-progress' }, h('i', { style: { width: `${overallPercent.toFixed(2)}%` } })),
        h(
          'div',
          { className: 'nr-pager' },
          h(
            'div',
            { className: `nr-page-shell${disguise ? ' nr-doc-shell' : ''}` },
            disguise
              ? h(
                  'div',
                  { className: 'nr-doc-head' },
                  h('span', null, docHead),
                  h('span', null, t('doc.head')),
                )
              : null,
            disguise
              ? h(
                  'div',
                  { className: 'nr-doc-wm', 'aria-hidden': 'true' },
                  h('span', null, t('doc.watermark')),
                )
              : null,
            h(
              'div',
              { className: 'nr-page-body', ref: bodyRef, tabIndex: 0 },
              h(
                'div',
                {
                  className: 'nr-page-track',
                  style: { transform: `translate3d(-${page * stride}px, 0, 0)` },
                },
                h(
                  'article',
                  {
                    className: 'nr-page-content',
                    ref: contentRef,
                    style: { '--nr-page-w': `${columnWidth || 600}px`, '--nr-page-gap': `${PAGE_GAP}px` },
                  },
                  disguise && current.implicit && chapter === 0
                    ? h(
                        'div',
                        { className: 'nr-doc-report-title' },
                        h('h2', null, docHead),
                        h('div', { className: 'nr-doc-sub' }, t('doc.subtitle')),
                      )
                    : null,
                  title ? h('h2', { className: `nr-ch-title${disguise ? ' nr-doc-title' : ''}` }, title) : null,
                  disguise
                    ? docItems.map((item) =>
                        item.kind === 'table'
                          ? h(DocTable, { key: item.key, t, table: item.table, no: item.no })
                          : item.kind === 'h'
                            ? h('h3', { key: item.key, className: 'nr-h' }, item.text)
                            : item.kind === 'q' || item.quote
                              ? h('blockquote', { key: item.key, className: 'nr-q' }, item.text)
                              : item.kind === 'pre'
                                ? h('pre', { key: item.key, className: 'nr-pre' }, item.text)
                                : h('p', { key: item.key, className: 'nr-p' }, item.text),
                      )
                    : current.blocks.map((block, index) =>
                        block.t === 'h'
                          ? h('h3', { key: index, className: 'nr-h' }, block.v)
                          : block.t === 'q'
                            ? h('blockquote', { key: index, className: 'nr-q' }, block.v)
                            : block.t === 'pre'
                              ? h('pre', { key: index, className: 'nr-pre' }, block.v)
                              : h('p', { key: index, className: 'nr-p' }, block.v),
                      ),
                ),
              ),
            ),
            disguise
              ? h(
                  'div',
                  { className: 'nr-doc-foot' },
                  h('span', null, t('doc.page', { current: docPage, total: docPages })),
                  h('span', null, t('doc.footer')),
                )
              : null,
          ),
        ),
        h(
          'footer',
          { className: 'nr-foot' },
          h(
            'button',
            {
              type: 'button',
              className: 'nr-nav',
              onClick: onPrevPage,
              disabled: atStart,
              title: t('reader.prevPage'),
              'aria-label': t('reader.prevPage'),
            },
            h(Icon, { name: 'chevron-left', size: 15 }),
          ),
          h(
            'span',
            { className: 'nr-foot-mid' },
            h(
              'span',
              { className: 'nr-foot-chapter' },
              disguise
                ? t('doc.page', { current: docPage, total: docPages })
                : t('reader.page', { current: page + 1, total: pageCount }),
            ),
            h('span', { className: 'nr-foot-sep' }, '·'),
            h(
              'span',
              { className: 'nr-foot-pct' },
              disguise
                ? t('doc.words', { count: formatNumber(fakeWordCount(docPages)) })
                : `${Math.round(overallPercent)}%`,
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'nr-nav',
              onClick: onNextPage,
              disabled: atEnd,
              title: t('reader.nextPage'),
              'aria-label': t('reader.nextPage'),
            },
            h(Icon, { name: 'chevron-right', size: 15 }),
          ),
        ),
      )
    }

    function Toc({ t, chapters, active, disguise, onPick, onClose }) {
      const [query, setQuery] = React.useState('')
      const listRef = React.useRef(null)
      const rows = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        const source = chapters.map((chapter, index) => ({ chapter, index }))
        if (!needle) return source
        return source.filter(({ chapter }) => (chapter.title || '').toLowerCase().includes(needle))
      }, [chapters, query])

      React.useEffect(() => {
        const activeNode = listRef.current?.querySelector('.nr-toc-item.active')
        activeNode?.scrollIntoView({ block: 'center' })
      }, [])

      return h(
        'div',
        { className: 'nr-drawer', onClick: onClose },
        h(
          'div',
          { className: 'nr-drawer-panel', onClick: (event) => event.stopPropagation() },
          h(
            'div',
            { className: 'nr-drawer-head' },
            h('span', null, disguise ? t('doc.toc') : t('toc.title')),
            h(
              'button',
              { type: 'button', className: 'nr-iconbtn', onClick: onClose, title: t('toc.title'), 'aria-label': t('toc.title') },
              h(Icon, { name: 'x', size: 15 }),
            ),
          ),
          h('input', {
            className: 'nr-search',
            placeholder: t('toc.search'),
            value: query,
            onChange: (event) => setQuery(event.target.value),
            autoFocus: true,
          }),
          h(
            'div',
            { className: 'nr-toc-list', ref: listRef },
            rows.length
              ? rows.map(({ chapter, index }) =>
                  h(
                    'div',
                    {
                      key: index,
                      className: `nr-toc-item${index === active ? ' active' : ''}`,
                      onClick: () => onPick(index),
                      title: chapter.title,
                    },
                    h('span', { className: 'nr-toc-no' }, index + 1),
                    h(
                      'span',
                      { className: 'nr-toc-name' },
                      disguise && !chapter.implicit ? `${secNo(index)} ${cleanTitle(chapter.title)}` : chapter.title,
                    ),
                  ),
                )
              : h('div', { className: 'nr-empty' }, t('toc.empty')),
          ),
        ),
      )
    }

    function Settings({ t, settings, disguise, onChange, onDisguise, onBoss, onClose }) {
      const themes = [
        { value: 'auto', label: t('settings.theme.auto') },
        { value: 'paper', label: t('settings.theme.paper') },
        { value: 'sepia', label: t('settings.theme.sepia') },
        { value: 'night', label: t('settings.theme.night') },
      ]
      const lines = [
        { value: 1.6, label: t('settings.line.compact') },
        { value: 1.95, label: t('settings.line.normal') },
        { value: 2.3, label: t('settings.line.loose') },
      ]
      const fonts = [
        { value: 'song', label: t('settings.font.song') },
        { value: 'hei', label: t('settings.font.hei') },
        { value: 'kai', label: t('settings.font.kai') },
        { value: 'system', label: t('settings.font.system') },
      ]
      return h(
        'div',
        { className: 'nr-scrim', onClick: onClose },
        h(
          'div',
          { className: 'nr-pop', onClick: (event) => event.stopPropagation() },
          h('div', { className: 'nr-pop-title' }, t('reader.settings')),
          h(
            'div',
            { className: 'nr-pop-row' },
            h('span', { className: 'nr-pop-label' }, t('disguise.toggle')),
            h(
              'div',
              { className: 'nr-seg' },
              h(
                'button',
                { type: 'button', className: disguise ? '' : 'on', onClick: () => onDisguise(false) },
                t('disguise.read'),
              ),
              h(
                'button',
                { type: 'button', className: disguise ? 'on' : '', onClick: () => onDisguise(true) },
                t('disguise.doc'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'nr-pop-row' },
            h('span', { className: 'nr-pop-label' }, t('disguise.boss')),
            h(
              'button',
              { type: 'button', className: 'nr-mini', onClick: onBoss },
              t('disguise.bossKey'),
            ),
          ),
          h('div', { className: 'nr-pop-hint' }, t('disguise.hint')),
          h(
            'div',
            { className: 'nr-pop-row' },
            h('span', { className: 'nr-pop-label' }, t('settings.theme')),
            h(
              'div',
              { className: 'nr-seg' },
              themes.map((theme) =>
                h(
                  'button',
                  {
                    key: theme.value,
                    type: 'button',
                    className: settings.theme === theme.value ? 'on' : '',
                    onClick: () => onChange({ theme: theme.value }),
                  },
                  theme.label,
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'nr-pop-row' },
            h('span', { className: 'nr-pop-label' }, t('settings.font')),
            h(
              'select',
              { className: 'nr-select', value: settings.font, onChange: (event) => onChange({ font: event.target.value }) },
              fonts.map((font) => h('option', { key: font.value, value: font.value }, font.label)),
            ),
          ),
          h(
            'div',
            { className: 'nr-pop-row' },
            h('span', { className: 'nr-pop-label' }, t('settings.size')),
            h(
              'div',
              { className: 'nr-stepper' },
              h(
                'button',
                { type: 'button', onClick: () => onChange({ fontSize: clamp(settings.fontSize - 1, 12, 30) }), 'aria-label': '-' },
                '−',
              ),
              h('span', null, settings.fontSize),
              h(
                'button',
                { type: 'button', onClick: () => onChange({ fontSize: clamp(settings.fontSize + 1, 12, 30) }), 'aria-label': '+' },
                '+',
              ),
            ),
          ),
          h(
            'div',
            { className: 'nr-pop-row' },
            h('span', { className: 'nr-pop-label' }, t('settings.line')),
            h(
              'div',
              { className: 'nr-seg' },
              lines.map((line) =>
                h(
                  'button',
                  {
                    key: line.value,
                    type: 'button',
                    className: Math.abs(settings.lineHeight - line.value) < 0.01 ? 'on' : '',
                    onClick: () => onChange({ lineHeight: line.value }),
                  },
                  line.label,
                ),
              ),
            ),
          ),
          h('div', { className: 'nr-pop-hint' }, t('settings.hint')),
        ),
      )
    }

    // ---------------------------------------------------------------
    // Root
    // ---------------------------------------------------------------
    function Root() {
      const t = useTranslate()
      const [settings, setSettings] = React.useState(readSettings)
      const [library, setLibrary] = React.useState({ status: 'loading', books: [], lastOpened: null, error: null })
      const [book, setBook] = React.useState(null)
      const [chapter, setChapter] = React.useState(0)
      const [page, setPage] = React.useState(0)
      const [pageCount, setPageCount] = React.useState(1)
      const [metrics, setMetrics] = React.useState({ width: 0, stride: 0 })
      const [view, setView] = React.useState('home')
      const [busy, setBusy] = React.useState(null)
      const [toast, setToast] = React.useState(null)
      const [dragging, setDragging] = React.useState(false)
      const [tocOpen, setTocOpen] = React.useState(false)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [confirmId, setConfirmId] = React.useState(null)
      const bodyRef = React.useRef(null)
      const contentRef = React.useRef(null)
      const restoreRef = React.useRef(null)
      const pendingPageRef = React.useRef(null)
      const saveTimerRef = React.useRef(null)
      const fileInputRef = React.useRef(null)
      const openingRef = React.useRef(false)
      const importingRef = React.useRef(false)
      const pageRef = React.useRef(0)
      const pageCountRef = React.useRef(1)
      const latestRef = React.useRef({ book: null, chapter: 0, page: 0, pageCount: 1, view: 'home' })
      pageRef.current = page
      pageCountRef.current = pageCount
      latestRef.current = { book, chapter, page, pageCount, view }

      function showToast(message) {
        setToast({ message, at: Date.now() })
      }

      React.useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 3000)
        return () => clearTimeout(timer)
      }, [toast])

      React.useEffect(() => {
        if (!confirmId) return undefined
        const timer = setTimeout(() => setConfirmId(null), 3500)
        return () => clearTimeout(timer)
      }, [confirmId])

      // Keep the shared cover state in step with the persisted preference and
      // the book on screen; the tab chip and foot button read the same state.
      React.useEffect(() => {
        modeState.document = settings.disguise
        notifyMode()
      }, [settings.disguise])

      React.useEffect(() => {
        setMode({ bookName: book ? book.meta.name : null })
      }, [book])

      React.useEffect(
        () => () => {
          setMode({ bookName: null, boss: false })
        },
        [],
      )


      async function reloadLibrary() {
        try {
          const data = await api('/library')
          setLibrary({ status: 'ready', books: data.books || [], lastOpened: data.lastOpened || null, error: null })
        } catch (error) {
          setLibrary((previous) => ({ ...previous, status: 'error', error: error.message }))
        }
      }

      async function openBook(meta, options = {}) {
        if (!meta || openingRef.current) return
        // The book on screen may be mid-chapter; its last position must not be
        // lost just because another book is about to replace it.
        flushProgress()
        openingRef.current = true
        setBusy(t('reader.loading'))
        try {
          const data = await api(`/books/${encodeURIComponent(meta.id)}`)
          const chapters = Array.isArray(data.chapters) ? data.chapters : []
          if (chapters.length === 0) throw new Error(t('reader.empty'))
          const chapterChars = chapters.map((item) =>
            (item.blocks || []).reduce((sum, block) => sum + (block.v || '').length, 0),
          )
          const offsets = []
          let total = 0
          for (const count of chapterChars) {
            offsets.push(total)
            total += count
          }
          const progress = meta.progress || null
          const start = progress ? clamp(Math.round(progress.chapter || 0), 0, chapters.length - 1) : 0
          pendingPageRef.current = null
          restoreRef.current = { ratio: progress && start === progress.chapter ? clamp(progress.ratio || 0, 0, 1) : 0 }
          setBook({ meta: { ...meta, chapterCount: chapters.length }, chapters, chapterChars, offsets, totalChars: total || 1 })
          setChapter(start)
          setPage(0)
          setView('reader')
          setTocOpen(false)
          setSettingsOpen(false)
          if (progress && (start > 0 || (progress.ratio || 0) > 0.02)) {
            showToast(t('reader.resumed', { chapter: start + 1 }))
          }
          api('/library/open', { method: 'POST', body: JSON.stringify({ id: meta.id }) })
            .then(() => setLibrary((previous) => ({ ...previous, lastOpened: meta.id })))
            .catch(() => {})
        } catch (error) {
          showToast(t('reader.openFailed', { message: error.message }))
        } finally {
          openingRef.current = false
          setBusy(null)
        }
      }

      React.useEffect(() => {
        let alive = true
        ;(async () => {
          try {
            const data = await api('/library')
            if (!alive) return
            setLibrary({ status: 'ready', books: data.books || [], lastOpened: data.lastOpened || null, error: null })
            const last = (data.books || []).find((item) => item.id === data.lastOpened)
            if (last && alive) await openBook(last)
          } catch (error) {
            if (!alive) return
            setLibrary({ status: 'error', books: [], lastOpened: null, error: error.message })
          }
        })()
        return () => {
          alive = false
        }
        // The shelf is read once when the tab mounts; later mutations refresh it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      function computePosition() {
        const current = latestRef.current
        if (!current.book || current.view !== 'reader') return null
        const pages = Math.max(1, current.pageCount)
        const ratio = pages > 1 ? clamp(current.page / (pages - 1), 0, 1) : 0
        const chars = current.book.chapterChars[current.chapter] || 0
        const before = current.book.offsets[current.chapter] || 0
        const total = current.book.totalChars || 1
        const percent = clamp((before + chars * ratio) / total, 0, 1)
        return { id: current.book.meta.id, chapter: current.chapter, ratio, percent }
      }

      function sendProgress(position) {
        if (!position) return
        fetch(`${API}/books/${encodeURIComponent(position.id)}/progress`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(position),
          keepalive: true,
        }).catch(() => {})
      }

      function flushProgress() {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
          saveTimerRef.current = null
        }
        sendProgress(computePosition())
      }

      function scheduleSave() {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null
          sendProgress(computePosition())
        }, 200)
      }

      function goHome() {
        flushProgress()
        setView('home')
        setBook(null)
        setPage(0)
        setPageCount(1)
        pendingPageRef.current = null
        restoreRef.current = null
        setTocOpen(false)
        setSettingsOpen(false)
        setConfirmId(null)
        reloadLibrary()
      }

      function goChapter(next, ratio = 0) {
        if (!book) return
        const target = clamp(Math.round(next), 0, book.chapters.length - 1)
        if (target === chapter) {
          setPage(clamp(Math.round(ratio * Math.max(0, pageCount - 1)), 0, Math.max(0, pageCount - 1)))
          scheduleSave()
          setTocOpen(false)
          return
        }
        flushProgress()
        pendingPageRef.current = null
        restoreRef.current = { ratio }
        setPage(0)
        setChapter(target)
        setTocOpen(false)
        // The new chapter's page count is only known after layout; record the
        // new place once the measurement has settled.
        setTimeout(() => scheduleSave(), 360)
      }

      function turnPage(delta) {
        if (!book) return
        const target = page + delta
        if (target >= 0 && target < pageCount) {
          setPage(target)
          scheduleSave()
          return
        }
        if (delta > 0 && chapter < book.chapters.length - 1) {
          flushProgress()
          pendingPageRef.current = { kind: 'first' }
          restoreRef.current = null
          setPage(0)
          setChapter(chapter + 1)
          setTimeout(() => scheduleSave(), 360)
          return
        }
        if (delta < 0 && chapter > 0) {
          flushProgress()
          pendingPageRef.current = { kind: 'last' }
          restoreRef.current = null
          setPage(0)
          setChapter(chapter - 1)
          setTimeout(() => scheduleSave(), 360)
        }
      }

      function updateSettings(patch) {
        const next = { ...settings, ...patch, version: 2 }
        setSettings(next)
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
        } catch {
          // Settings are a convenience; the reader still works without them.
        }
      }

      function toggleDisguise(next) {
        const value = typeof next === 'boolean' ? next : !settings.disguise
        updateSettings({ disguise: value })
        setMode({ document: value })
        showToast(value ? t('disguise.on') : t('disguise.off'))
      }

      function openBoss() {
        setMode({ boss: true })
      }

      function chooseFile() {
        fileInputRef.current?.click()
      }

      async function importFiles(fileList) {
        const files = Array.from(fileList || [])
        if (files.length === 0 || importingRef.current) return
        importingRef.current = true
        let last = null
        try {
          for (const file of files) {
            if (file.size > MAX_IMPORT_BYTES) {
              showToast(t('home.tooLarge', { size: Math.round(MAX_IMPORT_BYTES / 1024 / 1024) }))
              continue
            }
            setBusy(t('home.importing', { name: file.name }))
            try {
              const parsed = await parseEbookFile(file)
              const payload = {
                id: makeId(file),
                name: file.name,
                format: parsed.format,
                encoding: parsed.encoding,
                size: file.size,
                chapters: parsed.chapters,
              }
              const result = await api('/books', { method: 'POST', body: JSON.stringify(payload) })
              last = result.book
              showToast(t('home.imported', { name: file.name }))
            } catch (error) {
              showToast(t('home.importFailed', { message: error.message }))
            }
          }
          if (last) {
            const data = await api('/library')
            setLibrary({ status: 'ready', books: data.books || [], lastOpened: data.lastOpened || null, error: null })
            const meta = (data.books || []).find((item) => item.id === last.id) || last
            await openBook(meta)
          }
        } catch (error) {
          showToast(t('home.importFailed', { message: error.message }))
        } finally {
          importingRef.current = false
          setBusy(null)
        }
      }

      async function removeBook(meta) {
        try {
          await api(`/books/${encodeURIComponent(meta.id)}`, { method: 'DELETE' })
          setConfirmId(null)
          showToast(t('home.removed', { name: displayName(meta.name) }))
          if (book?.meta.id === meta.id) {
            setBook(null)
            setView('home')
          }
          await reloadLibrary()
        } catch (error) {
          showToast(t('home.importFailed', { message: error.message }))
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          if (settingsOpen) {
            event.preventDefault()
            setSettingsOpen(false)
            return
          }
          if (tocOpen) {
            event.preventDefault()
            setTocOpen(false)
            return
          }
        }
        if (view !== 'reader') return
        const target = event.target
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
        ) {
          return
        }
        const actions = {
          PageDown: () => turnPage(1),
          PageUp: () => turnPage(-1),
          ArrowDown: () => turnPage(1),
          ArrowUp: () => turnPage(-1),
          ArrowRight: () => turnPage(1),
          ArrowLeft: () => turnPage(-1),
          ' ': () => turnPage(1),
          Home: () => {
            setPage(0)
            scheduleSave()
          },
          End: () => {
            setPage(Math.max(0, pageCount - 1))
            scheduleSave()
          },
          '[': () => updateSettings({ fontSize: clamp(settings.fontSize - 1, 12, 30) }),
          ']': () => updateSettings({ fontSize: clamp(settings.fontSize + 1, 12, 30) }),
          b: () => toggleDisguise(),
          B: () => toggleDisguise(),
        }
        const action = actions[event.key]
        if (!action) return
        event.preventDefault()
        action()
      }

      function onDragOver(event) {
        if (event.dataTransfer?.types?.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }
      }

      function onDragLeave(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }

      function onDrop(event) {
        if (!event.dataTransfer?.files?.length) return
        event.preventDefault()
        setDragging(false)
        importFiles(event.dataTransfer.files)
      }

      React.useEffect(() => {
        const onHidden = () => {
          if (document.visibilityState === 'hidden') flushProgress()
        }
        document.addEventListener('visibilitychange', onHidden)
        window.addEventListener('beforeunload', flushProgress)
        return () => {
          document.removeEventListener('visibilitychange', onHidden)
          window.removeEventListener('beforeunload', flushProgress)
          flushProgress()
        }
        // The cleanup is the point: it flushes the last position on unmount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // Lay the chapter out in viewport-sized columns, then translate one
      // column per page. Page breaks and reflow are the browser's job: the
      // reader only counts the columns and restores the saved ratio.
      React.useLayoutEffect(() => {
        if (view !== 'reader' || !book) return undefined
        const body = bodyRef.current
        const content = contentRef.current
        if (!body || !content) return undefined

        const measure = () => {
          const width = body.clientWidth
          const height = body.clientHeight
          if (width <= 0 || height <= 0) return
          content.style.setProperty('--nr-page-w', `${width}px`)
          const total = content.scrollWidth
          const stride = width + PAGE_GAP
          const pages = Math.max(1, Math.round((total + PAGE_GAP) / stride))
          const previousPages = pageCountRef.current
          const previousRatio = previousPages > 1 ? pageRef.current / (previousPages - 1) : 0
          const intent = pendingPageRef.current || restoreRef.current
          pendingPageRef.current = null
          restoreRef.current = null
          let next = Math.round(previousRatio * (pages - 1))
          if (intent && intent.kind === 'first') next = 0
          else if (intent && intent.kind === 'last') next = pages - 1
          else if (intent && intent.kind === 'page') next = intent.value
          else if (intent && typeof intent.ratio === 'number') next = Math.round(intent.ratio * (pages - 1))
          setMetrics({ width, stride })
          setPageCount(pages)
          setPage(clamp(next, 0, pages - 1))
        }

        measure()
        const observer =
          typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => {
                const previousPages = pageCountRef.current
                pendingPageRef.current = {
                  ratio: previousPages > 1 ? pageRef.current / (previousPages - 1) : 0,
                }
                measure()
              })
            : null
        observer?.observe(body)
        return () => observer?.disconnect()
        // Font, line height and disguise change the body geometry too.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [view, book, chapter, settings.fontSize, settings.lineHeight, settings.font, settings.disguise])

      // The wheel turns pages instead of scrolling the column strip.
      React.useEffect(() => {
        if (view !== 'reader' || !book) return undefined
        const element = bodyRef.current
        if (!element) return undefined
        let last = 0
        const onWheel = (event) => {
          if (event.ctrlKey || event.metaKey) return
          if (Math.abs(event.deltaY) < 4) return
          event.preventDefault()
          const now = Date.now()
          if (now - last < 200) return
          last = now
          turnPage(event.deltaY > 0 ? 1 : -1)
        }
        element.addEventListener('wheel', onWheel, { passive: false })
        return () => element.removeEventListener('wheel', onWheel)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [view, book, chapter, page, pageCount])

      const chapterChars = book ? book.chapterChars[chapter] || 0 : 0
      const chapterBefore = book ? book.offsets[chapter] || 0 : 0
      const pageRatio = pageCount > 1 ? page / (pageCount - 1) : 0
      const overallPercent = book
        ? clamp(((chapterBefore + chapterChars * pageRatio) / (book.totalChars || 1)) * 100, 0, 100)
        : 0
      const charsPerPage = Math.max(200, chapterChars / Math.max(1, pageCount))
      const docPages = book ? Math.max(1, Math.round((book.totalChars || 1) / charsPerPage)) : 1
      const docPage = book ? clamp(Math.round(chapterBefore / charsPerPage) + page + 1, 1, docPages) : 1
      const atStart = !book || (chapter === 0 && page === 0)
      const atEnd = !book || (chapter === book.chapters.length - 1 && page === Math.max(0, pageCount - 1))

      return h(
        'div',
        {
          className: 'nr-root',
          onKeyDown,
          onDragOver,
          onDragLeave,
          onDrop,
          'data-library-status': library.status,
          'data-theme': settings.theme,
        },
        view === 'reader' && settings.disguise && book
          ? h(DocHeader, {
              t,
              docName: fakeDocName(book.meta.name),
              onHome: goHome,
              onToc: () => {
                setTocOpen((open) => !open)
                setSettingsOpen(false)
              },
              onSettings: () => {
                setSettingsOpen((open) => !open)
                setTocOpen(false)
              },
              onRead: () => toggleDisguise(false),
              onBoss: openBoss,
              onNotice: () => showToast(t('doc.readonly')),
            })
          : h(Header, {
              t,
              view,
              title: book ? displayName(book.meta.name) : '',
              disguise: settings.disguise,
              onHome: goHome,
              onToc: () => {
                setTocOpen((open) => !open)
                setSettingsOpen(false)
              },
              onSettings: () => {
                setSettingsOpen((open) => !open)
                setTocOpen(false)
              },
              onDisguise: () => toggleDisguise(),
              onImport: chooseFile,
              tocOpen,
              settingsOpen,
            }),
        view === 'home'
          ? h(Home, {
              t,
              library,
              onChoose: chooseFile,
              onOpen: (meta) => openBook(meta),
              onRemove: removeBook,
              onConfirm: (id) => setConfirmId(id),
              onRetry: reloadLibrary,
              confirmId,
            })
          : h(Reader, {
              t,
              book,
              chapter,
              settings,
              disguise: settings.disguise,
              page,
              pageCount,
              stride: metrics.stride,
              columnWidth: metrics.width,
              overallPercent,
              docPage,
              docPages,
              atStart,
              atEnd,
              bodyRef,
              contentRef,
              onPrevPage: () => turnPage(-1),
              onNextPage: () => turnPage(1),
            }),
        tocOpen && book
          ? h(Toc, {
              t,
              chapters: book.chapters,
              active: chapter,
              disguise: settings.disguise,
              onPick: (index) => goChapter(index, 0),
              onClose: () => setTocOpen(false),
            })
          : null,
        settingsOpen
          ? h(Settings, {
              t,
              settings,
              disguise: settings.disguise,
              onChange: updateSettings,
              onDisguise: toggleDisguise,
              onBoss: openBoss,
              onClose: () => setSettingsOpen(false),
            })
          : null,
        busy ? h('div', { className: 'nr-busy', role: 'status' }, h('span', { className: 'nr-spin' }), busy) : null,
        toast ? h('div', { className: 'nr-toast', role: 'status' }, toast.message) : null,
        dragging ? h('div', { className: 'nr-drop' }, h(Icon, { name: 'book-open', size: 24 }), t('reader.drop')) : null,
        h('input', {
          ref: fileInputRef,
          type: 'file',
          accept: '.txt,.md,.markdown,.epub,text/plain,text/markdown,application/epub+zip',
          multiple: true,
          style: { display: 'none' },
          onChange: (event) => {
            // Copy first: resetting the input clears the live FileList.
            const files = Array.from(event.target.files || [])
            event.target.value = ''
            importFiles(files)
          },
        }),
      )
    }

    class TabBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('[novel-reader] reader crashed', error)
      }

      render() {
        if (this.state.error) {
          return h(
            'div',
            { className: 'nr-crash' },
            h('div', null, translate('reader.crash')),
            h(
              'button',
              { type: 'button', className: 'nr-primary', onClick: () => this.setState({ error: null }) },
              translate('home.retry'),
            ),
          )
        }
        return this.props.children
      }
    }

    function TabBody() {
      return h(TabBoundary, null, h(Root))
    }

    /** The plugin context, so the foot button reaches the Sidebar controller. */
    let pluginCtx

    function openReader(ctx) {
      const sidebar = ctx?.get('sidebarRight')
      try {
        sidebar?.openTab(KIND, {})
      } catch (error) {
        console.error('[novel-reader] failed to open the reader tab', error?.message ?? String(error))
      }
    }

    function FooterButton(props) {
      const t = useTranslate()
      const mode = useMode()
      const wide = props?.wide !== false
      const disguised = mode.document && mode.bookName
      const label = disguised ? t('button.docLabel') : t('button.label')
      const tooltip = disguised ? t('button.docTooltip') : t('button.tooltip')
      return h(
        'button',
        {
          type: 'button',
          className: 'nr-foot-action',
          title: tooltip,
          'aria-label': tooltip,
          onClick: () => openReader(pluginCtx),
        },
        h(Mark, { size: 16 }),
        wide ? h('span', { className: 'nr-foot-label' }, label) : null,
      )
    }

    // ---------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------
    const CSS = `
.nr-root{height:100%;display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;user-select:none;-webkit-font-smoothing:antialiased;}
.nr-root *{box-sizing:border-box;}
.nr-head{flex:0 0 42px;height:42px;display:flex;align-items:center;gap:4px;padding:0 6px 0 8px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));}
.nr-brand{flex:0 0 24px;width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,#4f7cf7,#2f5bd8);color:#fff;display:flex;align-items:center;justify-content:center;}
.nr-title{font-size:12.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:2px;}
.nr-grow{flex:1;min-width:0;}
.nr-iconbtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);width:28px;height:28px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto;padding:0;font:inherit;}
.nr-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.nr-iconbtn.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);}
.nr-iconbtn:focus-visible,.nr-primary:focus-visible,.nr-nav:focus-visible,.nr-row-del:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}

.nr-home{flex:1;min-height:0;overflow-y:auto;padding:14px max(12px,calc((100% - 520px)/2)) 28px;display:flex;flex-direction:column;gap:12px;}
.nr-home::-webkit-scrollbar{width:8px;}
.nr-home::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:8px;border:2px solid transparent;background-clip:content-box;}
.nr-hero{appearance:none;width:100%;border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:12px;padding:18px 14px 14px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font:inherit;text-align:center;transition:border-color .15s,background .15s;}
.nr-hero:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);}
.nr-hero-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary);margin-bottom:2px;}
.nr-hero-title{font-size:13px;font-weight:600;}
.nr-hero-hint{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);max-width:260px;}
.nr-primary{appearance:none;border:1px solid transparent;background:var(--dsw-alias-brand-primary);color:#fff;border-radius:8px;padding:6px 14px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;margin-top:6px;}
.nr-primary:hover{filter:brightness(1.06);}

.nr-continue{appearance:none;width:100%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:12px;padding:11px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;font:inherit;text-align:left;transition:border-color .15s;}
.nr-continue:hover{border-color:var(--dsw-alias-brand-primary);}
.nr-continue-badge{flex:0 0 auto;width:34px;height:46px;border-radius:6px;background:linear-gradient(160deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent),color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent));color:var(--dsw-alias-brand-primary);font-size:9px;font-weight:700;letter-spacing:.4px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);}
.nr-continue-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.nr-continue-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nr-continue-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.nr-bar{display:block;height:3px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin-top:2px;}
.nr-bar i{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary);}
.nr-continue-go{flex:0 0 auto;font-size:11.5px;font-weight:600;color:var(--dsw-alias-brand-primary);padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);}

.nr-section{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 2px 0;letter-spacing:.02em;}
.nr-count{font-variant-numeric:tabular-nums;}
.nr-list{display:flex;flex-direction:column;gap:1px;margin:0 -4px;}
.nr-row{display:flex;align-items:center;gap:9px;padding:8px 8px;border-radius:8px;cursor:pointer;min-width:0;}
.nr-row:hover{background:var(--dsw-alias-bg-layer-1);}
.nr-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}
.nr-format{flex:0 0 auto;width:34px;height:34px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:700;letter-spacing:.3px;display:flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1);}
.nr-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.nr-row-name{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nr-row-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}
.nr-row-pct{flex:0 0 auto;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.nr-row-del{flex:0 0 auto;appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;padding:0;font:inherit;}
.nr-row:hover .nr-row-del,.nr-row:focus-within .nr-row-del{opacity:1;}
.nr-row-del:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);}
.nr-row-del.confirm{opacity:1;width:auto;padding:0 6px;font-size:10.5px;color:var(--dsw-alias-state-error-primary);}

.nr-empty{padding:28px 14px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7;display:flex;flex-direction:column;align-items:center;gap:8px;}
.nr-empty-title{font-size:13px;color:var(--dsw-alias-label-primary);font-weight:500;}
.nr-empty-hint{max-width:240px;}

.nr-reader{flex:1;min-height:0;display:flex;flex-direction:column;position:relative;container-type:inline-size;
  --nr-bg:#eef0f4;--nr-paper:#ffffff;--nr-text:#2b2f36;--nr-muted:#6b7280;--nr-rule:#e7e9ee;}
.nr-reader[data-theme=sepia]{--nr-bg:#ded5c2;--nr-paper:#f7f0df;--nr-text:#3c3327;--nr-muted:#7c7161;--nr-rule:#e6dac3;}
.nr-reader[data-theme=night]{--nr-bg:#15171b;--nr-paper:#22252c;--nr-text:#c9cdd4;--nr-muted:#8b929d;--nr-rule:#31353d;}
.nr-progress{flex:0 0 2px;height:2px;background:color-mix(in srgb,var(--nr-text) 10%,transparent);position:relative;z-index:2;}
.nr-progress i{display:block;height:100%;width:0;background:var(--dsw-alias-brand-primary);transition:width .18s ease-out;}
.nr-pager{flex:1;min-height:0;position:relative;overflow:hidden;display:flex;justify-content:center;padding:12px;background:var(--nr-bg);}
.nr-page-shell{position:relative;display:flex;flex-direction:column;width:100%;max-width:820px;min-height:0;padding:22px 20px;background:var(--nr-paper);color:var(--nr-text);border:1px solid transparent;border-radius:10px;box-shadow:0 1px 2px rgba(16,24,40,.05),0 8px 20px rgba(16,24,40,.05);overflow:hidden;user-select:text;}
.nr-reader[data-theme=night] .nr-page-shell{border-color:var(--nr-rule);box-shadow:0 1px 3px rgba(0,0,0,.4);}
.nr-page-body{position:relative;flex:1;min-height:0;overflow:hidden;outline:none;}
.nr-page-track{position:absolute;inset:0;}
.nr-page-content{width:100%;height:100%;column-width:var(--nr-page-w,600px);column-gap:var(--nr-page-gap,40px);column-fill:auto;}
.nr-page-content p{orphans:2;widows:2;}
.nr-page-content .nr-ch-title,.nr-page-content .nr-h,.nr-page-content .nr-doc-report-title,.nr-page-content .nr-doc-table{break-inside:avoid;}
.nr-page-content .nr-ch-title,.nr-page-content .nr-h,.nr-page-content .nr-doc-report-title{break-after:avoid;}
.nr-ch-title{font-family:var(--nr-ff);font-size:calc(var(--nr-fs) * 1.28);line-height:1.5;font-weight:700;margin:0 0 1.2em;padding-bottom:.5em;border-bottom:1px solid var(--nr-rule);letter-spacing:.02em;}
.nr-p{font-family:var(--nr-ff);font-size:var(--nr-fs);line-height:var(--nr-lh);text-indent:2em;text-align:justify;margin:0 0 .8em;word-break:break-word;overflow-wrap:anywhere;}
.nr-h{font-family:var(--nr-ff);font-size:calc(var(--nr-fs) * 1.08);line-height:1.6;font-weight:700;margin:1.5em 0 .7em;text-align:center;letter-spacing:.02em;}
.nr-q{font-family:var(--nr-ff);font-size:calc(var(--nr-fs) * .95);line-height:var(--nr-lh);margin:.4em 0 .9em;padding:.2em 0 .2em .9em;border-left:2px solid var(--nr-rule);color:var(--nr-muted);user-select:text;}
.nr-pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:calc(var(--nr-fs) * .8);line-height:1.6;background:color-mix(in srgb,var(--nr-text) 5%,transparent);border-radius:6px;padding:8px 10px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 .9em;user-select:text;}
.nr-foot{flex:0 0 38px;height:38px;display:flex;align-items:center;gap:6px;padding:0 6px;border-top:1px solid color-mix(in srgb,var(--nr-text) 12%,transparent);background:var(--nr-bg);color:var(--nr-muted);}
.nr-nav{appearance:none;border:0;background:transparent;color:var(--nr-muted);width:26px;height:26px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font:inherit;flex:0 0 auto;}
.nr-nav:hover:not(:disabled){background:color-mix(in srgb,var(--nr-text) 8%,transparent);color:var(--nr-text);}
.nr-nav:disabled{opacity:.28;cursor:default;}
.nr-foot-mid{flex:1;min-width:0;text-align:center;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;display:flex;justify-content:center;gap:5px;}
.nr-foot-pct{color:var(--nr-text);}
.nr-foot-sep{opacity:.4;}

/* ---------------- 文档伪装 ---------------- */
.nr-docbar{flex:0 0 32px;height:32px;display:flex;align-items:center;gap:6px;padding:0 6px;background:#f6f7f9;border-bottom:1px solid #e3e6ea;color:#3f4652;font-family:"Microsoft YaHei","Segoe UI",sans-serif;}
.nr-docbar-back{width:24px;height:24px;border-radius:4px;}
.nr-docname{font-size:11.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2b313a;}
.nr-docsaved{flex:0 0 auto;font-size:9.5px;color:#9aa1ab;border:1px solid #e1e5ea;border-radius:3px;padding:0 4px;line-height:15px;background:#fff;}
.nr-docbar-icon{width:24px;height:24px;color:#6b7280;}
.nr-doctabs{flex:0 0 26px;height:26px;display:flex;align-items:center;gap:0;padding:0 4px 0 6px;background:#fff;border-bottom:1px solid #e3e6ea;overflow:hidden;}
.nr-doctab{font:11px/1 "Microsoft YaHei","Segoe UI",sans-serif;color:#6b7280;padding:0 8px;height:26px;display:inline-flex;align-items:center;cursor:default;border-bottom:2px solid transparent;white-space:nowrap;}
.nr-doctab.on{color:#2b579a;border-bottom-color:#2b579a;font-weight:600;}
.nr-doctab-view{cursor:pointer;}
.nr-doctab-view:hover{color:#2b579a;}
.nr-doctab-read{width:24px;height:24px;color:#6b7280;}
.nr-docbar .nr-iconbtn:hover,.nr-doctabs .nr-iconbtn:hover{background:#eef1f5;color:#2b313a;}

.nr-doc{--doc-bg:#eceef2;--doc-paper:#fff;--doc-text:#2c3138;--doc-muted:#8a919b;--doc-line:#e2e5ea;background:var(--doc-bg);}
.nr-doc .nr-pager{background:var(--doc-bg);}
.nr-doc .nr-page-shell{max-width:794px;padding:38px 26px 46px;background:var(--doc-paper);color:var(--doc-text);border:1px solid #e1e5ea;border-radius:2px;box-shadow:0 1px 2px rgba(16,24,40,.08),0 10px 26px rgba(16,24,40,.08);}
.nr-doc .nr-page-body{position:relative;z-index:1;}
.nr-doc .nr-ch-title{font-size:calc(var(--nr-fs) * 1.12);line-height:1.5;font-weight:700;border-bottom:1px solid var(--doc-line);padding-bottom:.45em;margin:0 0 1.1em;letter-spacing:.01em;color:#1f2937;}
.nr-doc-report-title{margin:0 0 1.4em;padding-bottom:1.1em;border-bottom:2px solid #2b579a;}
.nr-doc-report-title h2{font-size:calc(var(--nr-fs) * 1.42);line-height:1.4;margin:0 0 .4em;font-weight:700;letter-spacing:.01em;color:#1f2937;}
.nr-doc-sub{font-size:11px;color:var(--doc-muted);letter-spacing:.08em;}
.nr-doc-head{position:absolute;left:26px;right:26px;top:12px;z-index:2;display:flex;justify-content:space-between;gap:10px;font:10px/1.4 "Microsoft YaHei","Segoe UI",sans-serif;color:#9aa1ab;padding-bottom:6px;border-bottom:1px solid #e7eaee;}
.nr-doc-head span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nr-doc-foot{position:absolute;left:26px;right:26px;bottom:12px;z-index:2;display:flex;justify-content:space-between;gap:10px;font:10px/1.4 "Microsoft YaHei","Segoe UI",sans-serif;color:#9aa1ab;padding-top:6px;border-top:1px solid #e7eaee;}
.nr-doc-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;overflow:hidden;}
.nr-doc-wm span{transform:rotate(-28deg);font:700 46px/1.35 "Microsoft YaHei",sans-serif;letter-spacing:.12em;color:rgba(31,45,61,.05);white-space:pre-line;text-align:center;}
.nr-doc .nr-p{font-size:var(--nr-fs);line-height:calc(var(--nr-lh) - .1);text-indent:2em;text-align:justify;margin:0 0 .75em;color:var(--doc-text);}
.nr-doc .nr-h{font-size:calc(var(--nr-fs) * 1.02);text-align:left;margin:1.2em 0 .5em;color:#1f2937;border:0;padding:0;}
.nr-doc .nr-q{font-size:calc(var(--nr-fs) * .95);line-height:calc(var(--nr-lh) - .15);border-left:3px solid #c6d4e5;padding:2px 0 2px 12px;text-indent:0;color:#3d4551;background:none;margin:0 0 .9em;}
.nr-doc .nr-pre{font-size:calc(var(--nr-fs) * .78);background:#f6f8fa;border:1px solid #e7eaee;}
.nr-doc .nr-foot{background:#f6f7f9;border-top:1px solid #e1e5ea;color:#7d8590;font-family:"Microsoft YaHei","Segoe UI",sans-serif;}
.nr-doc .nr-nav{color:#8a919b;}
.nr-doc .nr-nav:hover:not(:disabled){background:#e9edf2;color:#2b313a;}
.nr-doc .nr-foot-pct{color:#5f6772;}

.nr-doc-table{margin:18px 0 16px;position:relative;z-index:1;}
.nr-doc-cap{font:600 11px/1.5 "Microsoft YaHei",sans-serif;color:#6b7280;margin-bottom:6px;}
.nr-doc-table table{width:100%;border-collapse:collapse;table-layout:fixed;font:10.5px/1.5 "Microsoft YaHei","Segoe UI",sans-serif;color:#30363d;}
.nr-doc-table th,.nr-doc-table td{border:1px solid #dbe0e7;padding:4px 6px;text-indent:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nr-doc-table th{background:#f2f5f9;font-weight:600;color:#4a5563;font-size:10px;}
.nr-doc-table .num{text-align:right;font-variant-numeric:tabular-nums;}
.nr-doc-table .up{color:#b23b3b;}
.nr-doc-table .down{color:#217346;}
.nr-doc-table .nr-doc-bar{height:5px;border-radius:2px;background:#e3e9f1;overflow:hidden;}
.nr-doc-table .nr-doc-bar i{display:block;height:100%;background:#9db6d8;}
.nr-doc-note{font-size:9.5px;line-height:1.5;color:#9aa1ab;margin-top:4px;}

/* ---------------- 跟随 DSH 主题 ---------------- */
/* auto reads the live DSH aliases instead of a fixed palette, so a theme
   switch in DSH recolors the reader immediately without a re-render. */
.nr-reader[data-theme=auto]{
  --nr-bg:var(--dsw-alias-bg-base);
  --nr-paper:var(--dsw-alias-bg-layer-1);
  --nr-text:var(--dsw-alias-label-primary);
  --nr-muted:var(--dsw-alias-label-secondary);
  --nr-rule:var(--dsw-alias-border-l1);}
.nr-reader[data-theme=auto] .nr-page-shell{border-color:var(--dsw-alias-border-l1);box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 20px rgba(0,0,0,.08);}
.nr-root[data-theme=auto] .nr-doc{
  --doc-bg:var(--dsw-alias-bg-base);
  --doc-paper:var(--dsw-alias-bg-layer-1);
  --doc-text:var(--dsw-alias-label-primary);
  --doc-muted:var(--dsw-alias-label-secondary);
  --doc-line:var(--dsw-alias-border-l1);}
.nr-root[data-theme=auto] .nr-doc .nr-page-shell{border-color:var(--dsw-alias-border-l1);box-shadow:0 1px 2px rgba(0,0,0,.08),0 10px 26px rgba(0,0,0,.12);}
.nr-root[data-theme=auto] .nr-docbar{background:var(--dsw-alias-bg-layer-2);border-bottom-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-docname{color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-docsaved{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-docbar-icon,.nr-root[data-theme=auto] .nr-doctab-read{color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-doctabs{background:var(--dsw-alias-bg-layer-1);border-bottom-color:var(--dsw-alias-border-l1);}
.nr-root[data-theme=auto] .nr-doctab{color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-doctab.on{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);}
.nr-root[data-theme=auto] .nr-doctab-view:hover{color:var(--dsw-alias-brand-primary);}
.nr-root[data-theme=auto] .nr-docbar .nr-iconbtn:hover,.nr-root[data-theme=auto] .nr-doctabs .nr-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-doc .nr-ch-title,
.nr-root[data-theme=auto] .nr-doc-report-title h2,
.nr-root[data-theme=auto] .nr-doc .nr-h{color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-doc-report-title{border-bottom-color:var(--dsw-alias-brand-primary);}
.nr-root[data-theme=auto] .nr-doc-head,
.nr-root[data-theme=auto] .nr-doc-foot{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l1);}
.nr-root[data-theme=auto] .nr-doc-wm span{color:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);}
.nr-root[data-theme=auto] .nr-doc .nr-p{color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-doc .nr-q{color:var(--dsw-alias-label-secondary);border-left-color:var(--dsw-alias-border-l2);}
.nr-root[data-theme=auto] .nr-doc .nr-pre{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);}
.nr-root[data-theme=auto] .nr-doc .nr-foot{background:var(--dsw-alias-bg-base);border-top-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-doc .nr-nav{color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-doc .nr-nav:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-doc .nr-foot-pct{color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-doc-cap{color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-doc-table table{color:var(--dsw-alias-label-primary);}
.nr-root[data-theme=auto] .nr-doc-table th,.nr-root[data-theme=auto] .nr-doc-table td{border-color:var(--dsw-alias-border-l1);}
.nr-root[data-theme=auto] .nr-doc-table th{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}
.nr-root[data-theme=auto] .nr-doc-table .up{color:var(--dsw-alias-state-error-primary);}
.nr-root[data-theme=auto] .nr-doc-table .down{color:var(--dsw-alias-state-success-primary);}
.nr-root[data-theme=auto] .nr-doc-table .nr-doc-bar{background:var(--dsw-alias-bg-layer-2);}
.nr-root[data-theme=auto] .nr-doc-table .nr-doc-bar i{background:var(--dsw-alias-brand-primary);}
.nr-root[data-theme=auto] .nr-doc-note{color:var(--dsw-alias-label-secondary);}
.nr-mini{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:3px 8px;font:inherit;font-size:10.5px;cursor:pointer;white-space:nowrap;}
.nr-mini:hover{border-color:var(--dsw-alias-brand-primary);}
.nr-tab-title{font-weight:inherit;}

@container (max-width:420px){.nr-doctab{padding:0 6px;}.nr-docbar .nr-docsaved{display:none;}.nr-doc .nr-page-shell{padding:34px 16px 42px;}.nr-doc-head,.nr-doc-foot{left:16px;right:16px;}.nr-doc-table th,.nr-doc-table td{padding:3px 4px;font-size:9.5px;}.nr-doc-wm span{font-size:36px;}}

.nr-drawer{position:absolute;inset:0;z-index:20;background:rgba(15,23,42,.28);backdrop-filter:blur(1px);display:flex;animation:nr-fade .14s ease-out;}
.nr-drawer-panel{width:min(84%,320px);height:100%;background:var(--dsw-alias-bg-overlay);border-right:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;min-height:0;box-shadow:12px 0 32px rgba(15,23,42,.18);animation:nr-slide .18s ease-out;}
.nr-drawer-head{flex:0 0 42px;height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 12px;font-size:12.5px;font-weight:600;border-bottom:1px solid var(--dsw-alias-border-l1);}
.nr-search{appearance:none;margin:8px 10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font:inherit;font-size:12px;outline:none;flex:0 0 auto;}
.nr-search:focus{border-color:var(--dsw-alias-brand-primary);}
.nr-toc-list{flex:1;min-height:0;overflow-y:auto;padding:2px 6px 16px;}
.nr-toc-item{display:flex;align-items:baseline;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);border-left:2px solid transparent;}
.nr-toc-item:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.nr-toc-item.active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);font-weight:600;border-left-color:var(--dsw-alias-brand-primary);}
.nr-toc-no{flex:0 0 26px;font-size:10px;opacity:.6;font-variant-numeric:tabular-nums;text-align:right;}
.nr-toc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

.nr-scrim{position:absolute;inset:0;z-index:21;background:rgba(15,23,42,.12);animation:nr-fade .12s ease-out;}
.nr-pop{position:absolute;right:8px;bottom:46px;width:236px;max-height:calc(100% - 56px);overflow-y:auto;overscroll-behavior:contain;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 12px 36px rgba(15,23,42,.18);padding:12px;display:flex;flex-direction:column;gap:10px;animation:nr-rise .16s ease-out;}
.nr-pop-title{font-size:12px;font-weight:600;}
.nr-pop-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.nr-pop-label{font-size:11.5px;color:var(--dsw-alias-label-secondary);flex:0 0 auto;}
.nr-seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2);border-radius:7px;padding:2px;gap:1px;}
.nr-seg button{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:4px 8px;border-radius:5px;cursor:pointer;white-space:nowrap;}
.nr-seg button.on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(16,24,40,.1);}
.nr-select{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 8px;font:inherit;font-size:11px;outline:none;max-width:96px;}
.nr-stepper{display:inline-flex;align-items:center;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:7px;padding:2px;}
.nr-stepper button{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);width:22px;height:22px;border-radius:5px;cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:0;}
.nr-stepper button:hover{background:var(--dsw-alias-bg-base);}
.nr-stepper span{min-width:26px;text-align:center;font-size:11px;font-variant-numeric:tabular-nums;}
.nr-pop-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.5;}

.nr-busy{position:absolute;top:50px;left:50%;transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:8px;max-width:calc(100% - 32px);padding:6px 12px;border-radius:999px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-size:11.5px;box-shadow:0 6px 18px rgba(15,23,42,.22);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nr-spin{width:12px;height:12px;border-radius:50%;border:1.6px solid currentColor;border-top-color:transparent;display:inline-block;animation:nr-spin .7s linear infinite;flex:0 0 auto;}
.nr-toast{position:absolute;left:12px;right:12px;bottom:48px;z-index:31;padding:8px 12px;border-radius:9px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-size:11.5px;line-height:1.5;text-align:center;box-shadow:0 8px 22px rgba(15,23,42,.24);animation:nr-rise .16s ease-out;}
.nr-drop{position:absolute;inset:10px;z-index:40;border:2px dashed var(--dsw-alias-brand-primary);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-base));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-brand-primary);font-size:13px;font-weight:600;backdrop-filter:blur(2px);}
/* ---------------- 老板键：全屏表格伪装 ---------------- */
.nr-boss{position:fixed;inset:0;z-index:2147483000;background:#f3f4f6;color:#333;display:flex;flex-direction:column;overflow:hidden;font-family:"Microsoft YaHei","Segoe UI",sans-serif;outline:none;user-select:none;overscroll-behavior:contain;}
.nr-boss *{box-sizing:border-box;}
.nr-boss-grow{flex:1;min-width:0;}
.nr-boss-titlebar{flex:0 0 32px;height:32px;background:#217346;color:#fff;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;}
.nr-boss-logo{width:18px;height:18px;border-radius:2px;background:#fff;color:#217346;font:700 13px/18px Georgia,serif;text-align:center;flex:0 0 auto;}
.nr-boss-file{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nr-boss-saved{font-size:10px;color:rgba(255,255,255,.75);flex:0 0 auto;}
.nr-boss-win{width:24px;text-align:center;color:rgba(255,255,255,.8);font-size:12px;}
.nr-boss-close{appearance:none;border:0;background:transparent;color:#fff;width:28px;height:24px;font-size:15px;line-height:1;cursor:pointer;border-radius:2px;padding:0;}
.nr-boss-close:hover{background:#c42b1c;}
.nr-boss-tabs{flex:0 0 28px;height:28px;display:flex;align-items:center;gap:0;background:#fff;border-bottom:1px solid #d6dbe1;padding:0 8px;font-size:12px;color:#5a6169;overflow:hidden;}
.nr-boss-tab{padding:0 12px;height:28px;display:inline-flex;align-items:center;border-bottom:2px solid transparent;white-space:nowrap;}
.nr-boss-tab.on{color:#217346;border-bottom-color:#217346;font-weight:600;}
.nr-boss-ribbon{flex:0 0 62px;height:62px;background:#fff;border-bottom:1px solid #d6dbe1;display:flex;align-items:stretch;padding:0 10px;overflow:hidden;}
.nr-boss-group{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0 12px;border-right:1px solid #eef1f4;min-width:0;}
.nr-boss-tools{display:flex;gap:4px;flex-wrap:nowrap;}
.nr-boss-tool{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:24px;padding:0 5px;border:1px solid transparent;border-radius:3px;font-size:11px;color:#41474f;background:#f6f8fa;white-space:nowrap;}
.nr-boss-tool:first-child{background:#e8f3ec;border-color:#cfe3d6;}
.nr-boss-group-label{font-size:9.5px;color:#9aa1ab;}
.nr-boss-formula{flex:0 0 28px;height:28px;display:flex;align-items:center;border-bottom:1px solid #d6dbe1;background:#fff;font-size:11.5px;color:#333;}
.nr-boss-namebox{width:64px;height:28px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e1e5ea;color:#41474f;}
.nr-boss-fx{width:34px;height:28px;display:flex;align-items:center;justify-content:center;color:#217346;font-style:italic;border-right:1px solid #e1e5ea;}
.nr-boss-formula-text{padding:0 10px;color:#41474f;font-family:Consolas,"Courier New",monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nr-boss-grid{flex:1;min-height:0;overflow:auto;margin:8px 10px 0;border:1px solid #d6dbe1;background:#fff;}
.nr-boss-grid table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;font-size:11px;}
.nr-boss-grid th,.nr-boss-grid td{border-right:1px solid #e7eaee;border-bottom:1px solid #e7eaee;padding:4px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:24px;}
.nr-boss-grid thead th{position:sticky;top:0;z-index:2;background:#f0f2f5;font-weight:600;color:#41474f;}
.nr-boss-grid thead tr.fields th{top:22px;font-size:10.5px;}
.nr-boss-grid th.letter{text-align:center;font-weight:400;color:#8a919b;font-size:10px;height:22px;background:#f5f6f8;}
.nr-boss-grid th.corner{width:38px;background:#f0f2f5;}
.nr-boss-grid th.rownum{width:38px;text-align:center;font-weight:400;color:#9aa1ab;background:#f7f8fa;position:sticky;left:0;z-index:1;}
.nr-boss-grid td.num{text-align:right;font-variant-numeric:tabular-nums;}
.nr-boss-grid td.up{color:#c0392b;}
.nr-boss-grid td.down{color:#217346;}
.nr-boss-grid tbody tr:nth-child(even) td{background:#fbfcfd;}
.nr-boss-grid td.nr-boss-sel{outline:2px solid #217346;outline-offset:-2px;background:#eef7f1 !important;position:relative;}
.nr-boss-grid td.nr-boss-sel::after{content:'';position:absolute;right:0;bottom:0;width:5px;height:5px;background:#217346;}
.nr-boss-sheet-tabs{flex:0 0 28px;height:28px;display:flex;align-items:center;background:#f0f2f5;border-top:1px solid #d6dbe1;padding:0 8px;font-size:11px;color:#5a6169;}
.nr-boss-sheet{height:28px;display:inline-flex;align-items:center;padding:0 12px;border-right:1px solid #d6dbe1;}
.nr-boss-sheet.on{background:#fff;color:#217346;font-weight:600;}
.nr-boss-zoom{padding-right:6px;color:#8a919b;font-size:10.5px;}
.nr-boss-status{flex:0 0 24px;height:24px;background:#217346;color:#fff;display:flex;align-items:center;gap:16px;padding:0 12px;font-size:10.5px;overflow:hidden;white-space:nowrap;}

.nr-crash{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px;}

.nr-foot-action{appearance:none;border:0;background:none;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;width:100%;text-align:left;}
.nr-foot-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.nr-foot-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.nr-foot-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

@container (min-width:520px){.nr-page-shell{padding:28px 34px;}.nr-doc .nr-page-shell{padding:42px 34px 50px;}.nr-doc-head,.nr-doc-foot{left:34px;right:34px;}.nr-ch-title{font-size:calc(var(--nr-fs) * 1.4);}}
@container (max-width:330px){.nr-page-shell{padding:16px 14px;}.nr-continue-go{display:none;}.nr-pop{right:6px;width:222px;}}
@keyframes nr-spin{to{transform:rotate(360deg)}}
@keyframes nr-fade{from{opacity:0}to{opacity:1}}
@keyframes nr-slide{from{transform:translateX(-12px);opacity:.5}to{transform:none;opacity:1}}
@keyframes nr-rise{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.nr-drawer-panel,.nr-pop,.nr-toast,.nr-drawer,.nr-scrim{animation:none;}}
`

    // ---------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------
    return {
      // Only injected services are readable through this Client's `ctx.get`;
      // the Sidebar controller and its tab-type registry are declared here so
      // this plugin parks instead of guessing when they are absent.
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        pluginCtx = ctx
        const locale = ctx.get('locale')
        localeRef.current = locale
        if (locale) {
          ctx.effect(() => locale.register(NS, 'zh', zh), 'novel-reader: zh dictionary')
          ctx.effect(() => locale.register(NS, 'en', en), 'novel-reader: en dictionary')
        }

        // One owned stylesheet element: inserting it and removing it from the
        // page is the whole lifecycle.
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.novelReader = 'styles'
          tag.textContent = CSS
          document.head.append(tag)
          return () => tag.remove()
        }, 'novel-reader: styles')

        const tabs = ctx.get('sidebarRightTabs')
        if (tabs?.register) {
          ctx.effect(
            () =>
              tabs.register({
                id: TAB_ID,
                kind: KIND,
                multiple: false,
                title: () => translate('tab.title'),
                guide: [
                  {
                    id: 'novel-reader',
                    order: 40,
                    title: () => translate('guide.title'),
                    description: () => translate('guide.description'),
                    icon: Mark,
                  },
                ],
              }),
            'novel-reader: tab type',
          )
        }

        // The pane body: every tab of this kind renders the reader.
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, TabBody),
        )
        // The chip title itself: the fake document name while covered.
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, TabTitle),
        )
        // A one-click entry beside Settings in the sidebar foot.
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'novel-reader', order: 12, label: () => translate('button.label') },
            FooterButton,
          ),
        )
        // The frame-wide spreadsheet cover, above every column.
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'novel-reader-boss', order: 1000, label: 'novel-reader' },
            BossOverlay,
          ),
        )

        // The cover keys: Ctrl+Shift+X anywhere, Esc inside the reader.
        ctx.effect(() => {
          const listener = (event) => {
            const combo = (event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'x' || event.key === 'X')
            if (modeState.boss) {
              if (combo || event.key === 'Escape' || event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                setMode({ boss: false })
              } else {
                // Keep the app's own shortcuts from firing behind the cover,
                // and keep Tab focus inside the fake sheet.
                event.preventDefault()
                event.stopPropagation()
              }
              return
            }
            if (combo) {
              event.preventDefault()
              event.stopPropagation()
              setMode({ boss: true })
              return
            }
            const target = event.target
            const inReader =
              target && typeof target.closest === 'function' && target.closest('.nr-root') != null
            if (event.key === 'Escape' && inReader && !document.querySelector('.nr-drawer, .nr-pop')) {
              event.preventDefault()
              event.stopPropagation()
              setMode({ boss: true })
            }
          }
          window.addEventListener('keydown', listener, true)
          return () => window.removeEventListener('keydown', listener, true)
        }, 'novel-reader: boss keys')

        // The fake document title + favicon follow the shared cover state.
        ctx.effect(() => {
          const listener = () => updatePresentation()
          modeListeners.add(listener)
          updatePresentation()
          return () => {
            modeListeners.delete(listener)
            modeState.boss = false
            restorePresentation()
          }
        }, 'novel-reader: window presentation')
      },
    }
  },
})
