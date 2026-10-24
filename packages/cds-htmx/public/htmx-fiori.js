document.addEventListener('htmx:error', e => console.error('htmx error', e.detail))

// ---------- the event stream is opened only while the page shown asks for it ----------
// Every page carries `#hf-live` (data-hf-live=1 when the entity has Common.SideEffects). Pages without such
// side effects hold no connection (browsers allow only ~6 per origin on HTTP/1.1, and each one costs the server a socket).
function hfSyncStream() {
  const wanted = document.getElementById('hf-live')?.dataset.hfLive === '1'
  const open = document.getElementById('sse')
  if (!wanted && open) open.remove() // the extension closes the EventSource when the element is cleaned up
  if (wanted && !open) {
    let url
    try { url = JSON.parse(document.getElementById('hf-sse')?.textContent || 'null')?.url } catch { /* no stream info */ }
    if (!url) return
    const el = document.createElement('div')
    el.id = 'sse'
    el.setAttribute('hx-sse:connect', url)
    el.setAttribute('hx-swap', 'none')
    ;(document.querySelector('.hf-root') || document.body).append(el)
    htmx.process(el)
  }
}
document.addEventListener('DOMContentLoaded', hfSyncStream)
document.addEventListener('hf:ready', hfSyncStream) // the shell (a page the plugin does not own) loads these scripts after DOMContentLoaded
document.addEventListener('htmx:after:swap', hfSyncStream)

document.addEventListener('click', e => {
  const toggle = e.target.closest('[data-hf-toggle-header]')
  if (toggle) {
    const page = toggle.closest('.hf-page')
    const collapsed = page.classList.toggle('hf-page--collapsed')
    toggle.setAttribute('aria-label', collapsed ? 'Expand Header' : 'Collapse Header')
    toggle.querySelector('i').className = collapsed ? 'sap-icon--slim-arrow-down' : 'sap-icon--slim-arrow-up'
    return
  }
  const pin = e.target.closest('[data-hf-pin-header]')
  if (pin) {
    const pinned = pin.closest('.hf-page').classList.toggle('hf-page--pinned')
    pin.querySelector('i').className = pinned ? 'sap-icon--pushpin-on' : 'sap-icon--pushpin-off'
    return
  }
  const tab = e.target.closest('.hf-anchor-bar__tab')
  if (tab) {
    for (const t of tab.parentElement.children) t.classList.toggle('is-selected', t === tab)
  }
})

// "Select all" checkbox in a table header toggles every row checkbox of that table
document.addEventListener('change', e => {
  const box = e.target
  if (!box.classList?.contains('hf-checkbox') || !box.closest('thead')) return
  for (const row of box.closest('table').querySelectorAll('tbody .hf-checkbox')) row.checked = box.checked
})

// ---------- confirmation dialog (instead of window.confirm) ----------
// Elements keep their `hx-confirm="<text>"`; htmx asks via `htmx:confirm` and we answer with a UI
// dialog. `{count}` in the text is replaced by the number of ticked rows (List Report Delete).
// Optional data attributes: data-hf-confirm-title / -ok / -cancel, data-hf-confirm-critical.
/** Closes a modal overlay (dialog or message box) the way FE does: it fades and shrinks away (`.is-closing`, see the CSS) and is
 *  removed when that animation ends; without animation (`sap.htmx.animations: none`, reduced motion) it goes at once. */
function hfDismiss(overlay) {
  if (!overlay?.isConnected || overlay.classList.contains('is-closing')) return
  overlay.classList.add('is-closing')
  const box = overlay.firstElementChild
  const seconds = box ? parseFloat(getComputedStyle(box).animationDuration) || 0 : 0
  if (!seconds) return overlay.remove()
  const done = () => overlay.remove()
  box.addEventListener('animationend', done, { once: true })
  setTimeout(done, seconds * 1000 + 150) // in case the animation never ends (a hidden tab)
}

function hfConfirmDialog({ title, text, ok, cancel, critical }) {
  return new Promise(resolve => {
    document.querySelectorAll('.hf-overlay.is-closing').forEach(o => o.remove()) // a dialog still on its way out makes way for this one
    const overlay = document.createElement('div')
    overlay.className = 'hf-overlay'
    overlay.innerHTML = `
      <div class="fd-message-box fd-message-box--active hf-message-box" role="alertdialog" aria-modal="true" aria-labelledby="hf-confirm-title" aria-describedby="hf-confirm-text" tabindex="-1">
        <div class="fd-message-box__content">
          <header class="fd-bar fd-bar--header fd-message-box__header"><div class="fd-bar__left"><div class="fd-bar__element"><h1 class="fd-title fd-title--h5" id="hf-confirm-title"></h1></div></div></header>
          <section class="fd-message-box__body" id="hf-confirm-text"></section>
          <footer class="fd-bar fd-bar--footer fd-message-box__footer"><div class="fd-bar__right">
            <div class="fd-bar__element"><button type="button" class="fd-button fd-button--emphasized fd-message-box__decisive-button" data-hf-ok></button></div>
            <div class="fd-bar__element"><button type="button" class="fd-button fd-button--transparent fd-message-box__decisive-button" data-hf-cancel></button></div>
          </div></footer>
        </div>
      </div>`
    overlay.querySelector('#hf-confirm-title').textContent = title
    overlay.querySelector('#hf-confirm-text').textContent = text
    const okButton = overlay.querySelector('[data-hf-ok]')
    okButton.textContent = ok
    if (critical) { // FE asks about what cannot be taken back in a warning message box: the icon and a colored line under the title
      overlay.firstElementChild.classList.add('hf-message-box--warning')
      overlay.querySelector('#hf-confirm-title').before(Object.assign(document.createElement('i'), { className: 'sap-icon--message-warning hf-message-box__icon', ariaHidden: 'true' }))
    }
    overlay.querySelector('[data-hf-cancel]').textContent = cancel
    const previous = document.activeElement
    const close = result => {
      document.removeEventListener('keydown', onKey, true)
      hfDismiss(overlay)
      previous?.focus?.()
      resolve(result)
    }
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false) }
    }
    overlay.addEventListener('click', e => {
      if (e.target.closest('[data-hf-ok]')) close(true)
      else if (e.target.closest('[data-hf-cancel]') || e.target === overlay) close(false)
    })
    document.addEventListener('keydown', onKey, true)
    ;(document.getElementById('dialogs') || document.body).appendChild(overlay)
    okButton.focus()
  })
}

document.addEventListener('htmx:confirm', async e => {
  const elt = e.target
  const text = e.detail?.ctx?.confirm
  if (!text) return
  e.preventDefault() // we answer, not window.confirm
  if (elt.dataset.hfConfirmPopover != null) {
    if (hfDraftUntouched()) return e.detail.issueRequest()
    const yes = await hfConfirmPopover(elt, { text, ok: elt.dataset.hfConfirmOk || elt.textContent.trim() })
    return yes ? e.detail.issueRequest() : e.detail.dropRequest()
  }
  const ticked = elt.dataset.hfConfirmCount != null ? [...document.querySelectorAll(elt.dataset.hfConfirmCount)] : []
  const count = ticked.length
  // FE names the object when one is selected ("Delete object Jane Eyre?"), else asks about "the selected objects"
  const first = count === 1 && elt.dataset.hfConfirmOne
    ? ticked[0].closest('tr')?.querySelector('td:not(.fd-table__cell--checkbox)')?.textContent.replace(/\s+/g, ' ').trim()
    : ''
  const confirmed = await hfConfirmDialog({
    title: elt.dataset.hfConfirmTitle || elt.textContent.trim(),
    text: first ? elt.dataset.hfConfirmOne.replace('{0}', first) : text.replace('{count}', count),
    ok: elt.dataset.hfConfirmOk || elt.textContent.trim(),
    cancel: elt.dataset.hfConfirmCancel || 'Cancel',
    critical: elt.dataset.hfConfirmCritical != null
  })
  if (confirmed) e.detail.issueRequest()
  else e.detail.dropRequest()
})

// ---------- popovers (draft indicator) ----------
function hfClosePopovers(except) {
  for (const body of document.querySelectorAll('.hf-popover.is-open')) {
    if (body === except) continue
    body.classList.remove('is-open')
    body.querySelector('[data-hf-popover-toggle]')?.setAttribute('aria-expanded', 'false')
  }
}

document.addEventListener('click', e => {
  const toggle = e.target.closest('[data-hf-popover-toggle]')
  const popover = toggle?.closest('.hf-popover')
  hfClosePopovers(popover)
  if (!popover) return
  const open = popover.classList.toggle('is-open')
  toggle.setAttribute('aria-expanded', String(open))
})
document.addEventListener('keydown', e => { if (e.key === 'Escape') hfClosePopovers() })
document.addEventListener('htmx:after:swap', () => hfClosePopovers())

// ---------- row selection: Delete buttons are enabled while rows of their table are ticked ----------
// A button names the container it works on (data-hf-needs-selection="#section"), so the List Report and the
// Object Page sections each have their own.
function hfSyncSelection() {
  for (const button of document.querySelectorAll('[data-hf-needs-selection]')) {
    const scope = document.querySelector(button.dataset.hfNeedsSelection) || document
    button.disabled = !scope.querySelector('tbody .hf-checkbox:checked')
  }
  // the table title counts what is ticked
  for (const toolbar of document.querySelectorAll('.hf-table-toolbar')) {
    const scope = toolbar.closest('.hf-table-card, .hf-section--table')
    const ticked = scope ? scope.querySelectorAll('tbody .hf-checkbox:checked').length : 0
    toolbar.classList.toggle('has-selection', ticked > 0)
    const out = toolbar.querySelector('[data-hf-selected-count]')
    if (out) {
      out.dataset.n = ticked
      out.dataset.c = toolbar.querySelector('[id$="-count"]')?.textContent.replace(/[()s]/g, '') ?? ''
    }
  }
}
document.addEventListener('change', e => {
  const box = e.target
  if (!box.classList?.contains('hf-checkbox')) return
  hfSyncSelection()
})
document.addEventListener('htmx:after:swap', hfSyncSelection)

// ---------- toast: shown for a few seconds, then removed ----------
let hfToastTimer
document.addEventListener('htmx:after:swap', () => {
  const toast = document.querySelector('#toast .fd-message-toast')
  if (!toast) return
  clearTimeout(hfToastTimer)
  hfToastTimer = setTimeout(() => toast.remove(), 3000)
})

// ---------- messages: field value states + the footer's "Message Details" (FE's message popover) ----------
// The list lives here. The server feeds it: persisted draft messages as data-hf-messages on #op-page when
// a page loads, and `HX-Trigger: {"hf:messages": {set, clear, reset}}` after edits and failed saves.
const hfMessages = { page: null, list: [] }

// the page being worked on: the only Object Page, or in a flexible column layout the one in the right-most column (its ids carry a prefix there)
const hfOpPage = () => [...document.querySelectorAll('[id$="op-page"]')].pop() ?? null

const hfFieldControl = wrapper => wrapper.querySelector('input:not([type=hidden]), textarea, select')

function hfRenderMessages() {
  const page = hfOpPage()
  if (!page) return
  const byPath = new Map()
  for (const m of hfMessages.list) if (m.path && (!byPath.has(m.path) || m.severity === 'error')) byPath.set(m.path, m)
  for (const wrapper of page.querySelectorAll('[data-hf-field]')) {
    const m = byPath.get(wrapper.dataset.hfField)
    const control = hfFieldControl(wrapper)
    wrapper.classList.toggle('hf-field--error', m?.severity === 'error')
    wrapper.classList.toggle('hf-field--warning', m?.severity === 'warning')
    control?.classList.toggle('is-error', m?.severity === 'error')
    control?.classList.toggle('is-warning', m?.severity === 'warning')
    if (control) m ? control.setAttribute('aria-invalid', m.severity === 'error') : control.removeAttribute('aria-invalid')
    const bubble = wrapper.querySelector('.hf-field__message')
    if (bubble) bubble.textContent = m?.text ?? ''
  }
  const holder = page.querySelector('.hf-footer__messages')
  if (!holder) return
  const list = [...hfMessages.list].sort((a, b) => (b.severity === 'error') - (a.severity === 'error'))
  if (!list.length) { holder.replaceChildren(); return }
  const errors = list.filter(m => m.severity === 'error').length
  const level = errors ? 'error' : list[0].severity === 'warning' ? 'warning' : 'info'
  const icon = { error: 'error', warning: 'alert', info: 'message-information', success: 'message-success' }
  const open = holder.querySelector('.hf-popover.is-open') != null
  holder.innerHTML = `
    <div class="hf-popover hf-popover--up${open ? ' is-open' : ''}">
      <button type="button" class="hf-msg-button hf-msg-button--${level}" data-hf-popover-toggle aria-haspopup="true" aria-expanded="${open}" aria-label="Messages">
        <i class="sap-icon--${icon[level]}" aria-hidden="true"></i><span class="hf-msg-button__count"></span>
      </button>
      <div class="fd-popover__body hf-msg-popover">
        <header class="hf-msg-popover__header"><strong data-hf-title></strong></header>
        <ul class="hf-msg-popover__list"></ul>
      </div>
    </div>`
  holder.querySelector('.hf-msg-button__count').textContent = String(list.length)
  holder.querySelector('[data-hf-title]').textContent = holder.dataset.title || 'Message Details'
  const ul = holder.querySelector('ul')
  for (const m of list) {
    const li = document.createElement('li')
    li.innerHTML = `<button type="button" class="hf-msg-item"><i class="sap-icon--${icon[m.severity] || 'message-information'} hf-msg-item__icon hf-msg-item__icon--${m.severity}" aria-hidden="true"></i><span><span class="hf-msg-item__text"></span><span class="hf-msg-item__label"></span></span></button>`
    li.querySelector('.hf-msg-item__text').textContent = m.text
    li.querySelector('.hf-msg-item__label').textContent = m.label || ''
    li.querySelector('button').addEventListener('click', () => {
      hfClosePopovers()
      const wrapper = m.path && hfOpPage()?.querySelector(`[data-hf-field="${CSS.escape(m.path)}"]`)
      const control = wrapper && hfFieldControl(wrapper)
      control?.scrollIntoView({ block: 'center' })
      control?.focus()
    })
    ul.appendChild(li)
  }
}

function hfLoadMessages() {
  const page = hfOpPage()
  if (page === hfMessages.page) return hfRenderMessages() // same page, e.g. a field morphed: keep the list
  hfMessages.page = page
  try { hfMessages.list = page?.dataset.hfMessages ? JSON.parse(page.dataset.hfMessages) : [] } catch { hfMessages.list = [] }
  hfRenderMessages()
}

// the browser tab follows the object's title while it is edited
document.addEventListener('hf:title', e => { const title = e.detail?.value ?? e.detail; if (typeof title === 'string' && title) document.title = title })

document.addEventListener('hf:messages', e => {
  const { set = [], clear = [], reset = false } = e.detail?.value ?? e.detail ?? {}
  if (reset) hfMessages.list = []
  const gone = new Set([...clear, ...set.map(m => m.path)].filter(Boolean))
  hfMessages.list = hfMessages.list.filter(m => !gone.has(m.path)).concat(set)
  hfRenderMessages()
  if (hfSaveAt && Date.now() - hfSaveAt < 20000 && set.some(m => m.severity === 'error')) {
    hfSaveAt = 0 // FE opens the message popover after a Save that failed; the swap of the response closes popovers, so it is opened when that is done
    hfOpenMessages = true
    setTimeout(hfOpenMessagePopover, 500)
  }
})
document.addEventListener('htmx:after:swap', hfLoadMessages)
document.addEventListener('DOMContentLoaded', hfLoadMessages)
document.addEventListener('hf:ready', hfLoadMessages)

// ---------- row click: ignore clicks on the row's own controls ----------
// A bracketed `hx-trigger="click[...]"` filter makes htmx compile the expression with `new Function`, which a CSP
// without 'unsafe-eval' (e.g. SAP Work Zone) blocks -- so the filter lives here, as plain code.
document.addEventListener('htmx:config:request', e => {
  const { sourceElement, sourceEvent } = e.detail.ctx
  if (sourceElement.matches?.('tr.fd-table__row--activable') && sourceEvent?.type === 'click'
    && sourceEvent.target.closest?.('.fd-table__cell--checkbox, input, select, textarea, button, a')) e.preventDefault()
})

// ---------- flexible column layout (render/fcl.js) ----------
// The server swaps one column at a time and says in #fcl-marker which layout that column asks for. The layout is applied
// when the right-most column changes (a page opens or a column closes); edits inside a column leave the user's choice
// (full screen) alone.
const HF_FCL_FULLSCREEN = ['MidColumnFullScreen', 'EndColumnFullScreen']

function hfFclSync() {
  const fcl = document.getElementById('fcl')
  if (!fcl) return
  const present = [...fcl.querySelectorAll(':scope > .hf-fcl__col')].filter(col => !col.hidden && (col.hasChildNodes() || col.hasAttribute('hx-get')))
  const deepest = String(Math.max(0, ...present.map(col => Number(col.dataset.hfCol))))
  const marker = document.getElementById('fcl-marker')
  if (deepest !== fcl.dataset.hfDeepest) {
    const opened = Number(deepest) > Number(fcl.dataset.hfDeepest)
    const column = fcl.querySelector(`:scope > [data-hf-col="${deepest}"]`)
    // a column that opens grows from nothing: it is a new element, so it starts at zero width for one frame
    if (opened && column) { column.style.setProperty('--hf-w', '0%'); void column.offsetWidth; requestAnimationFrame(() => column.style.removeProperty('--hf-w')) }
    fcl.dataset.hfDeepest = deepest
    hfFclResetSize(fcl)
    if (marker?.dataset.hfLayout) fcl.dataset.hfLayout = marker.dataset.hfLayout
  }
  hfFclSeparators(fcl)
  const full = HF_FCL_FULLSCREEN.includes(fcl.dataset.hfLayout)
  for (const button of fcl.querySelectorAll('[data-hf-fcl-fullscreen]')) {
    const label = full ? button.dataset.hfExit : button.dataset.hfEnter
    button.setAttribute('aria-pressed', String(full))
    button.setAttribute('aria-label', label)
    button.title = label
    button.querySelector('i').className = full ? 'sap-icon--exit-full-screen' : 'sap-icon--full-screen'
  }
  // the List Report row of the object that is open
  const path = decodeURIComponent(location.pathname).replace(/,IsActiveEntity=(?:true|false)/g, '')
  for (const row of fcl.querySelectorAll('.hf-fcl__col[data-hf-col="0"] tr[hx-get]')) {
    const href = decodeURIComponent(row.getAttribute('hx-get')).replace(/,IsActiveEntity=(?:true|false)/g, '')
    row.classList.toggle('is-selected', deepest !== '0' && (path === href || path.endsWith(href) || path.includes(`${href}/`)))
  }
}
// the layout type decides the widths again (after a layout change, full screen or an arrow)
function hfFclResetSize(fcl) {
  fcl.removeAttribute('data-hf-custom')
  for (const n of [0, 1, 2]) fcl.style.removeProperty(`--hf-c${n}`)
}

// the arrow on a separator: the two layouts of a pair swap which column is wide
const HF_FCL_ARROWS = {
  TwoColumnsMidExpanded: { column: '1', icon: 'right', to: 'TwoColumnsBeginExpanded' },
  TwoColumnsBeginExpanded: { column: '1', icon: 'left', to: 'TwoColumnsMidExpanded' },
  ThreeColumnsEndExpanded: { column: '2', icon: 'right', to: 'ThreeColumnsMidExpanded' },
  ThreeColumnsMidExpanded: { column: '2', icon: 'left', to: 'ThreeColumnsEndExpanded' }
}

function hfFclSeparators(fcl) {
  let label = ''
  try { label = JSON.parse(document.getElementById('hf-texts')?.textContent || '{}').ResizeColumns || '' } catch { /* no texts */ }
  const arrow = HF_FCL_ARROWS[fcl.dataset.hfLayout]
  for (const sep of fcl.querySelectorAll('[data-hf-sep]')) {
    if (label) sep.setAttribute('aria-label', label)
    const button = sep.querySelector('[data-hf-fcl-arrow]')
    const mine = arrow && sep.closest('.hf-fcl__col')?.dataset.hfCol === arrow.column
    button.hidden = !mine
    if (mine) { button.querySelector('i').className = `sap-icon--slim-arrow-${arrow.icon}`; if (label) button.title = label }
  }
}

document.addEventListener('htmx:after:swap', hfFclSync)
document.addEventListener('DOMContentLoaded', hfFclSync)
document.addEventListener('hf:ready', hfFclSync)

// a request made while the layout is on screen is answered with the column to swap, not the whole layout
document.addEventListener('htmx:config:request', e => {
  const { request } = e.detail.ctx
  if (document.getElementById('fcl') && !request.headers['X-Hf-Fcl']) request.headers['X-Hf-Fcl'] = '1'
  // Edit, Save and Discard of the first page leave the page in the third column open (it follows, see hfFclFollowRoot)
  if (String(request.method).toUpperCase() === 'POST' && /\/\$(edit|save|discard)$/.test(request.action) && hfFclColumn(2)) request.headers['X-Hf-Fcl-Keep'] = '1'
})

const hfFclColumn = n => {
  const col = document.getElementById(`fcl-col-${n}`)
  return col && !col.hidden && col.hasChildNodes() ? col : null
}

// Drafts: one root (the first page, like in Fiori elements / CAP): Edit makes the whole object editable, the pages of the columns
// to its right (the sub-object page has no Edit of its own) show its draft; Save and Discard bring them back to the saved version.
// The third column asks for the version that matches the first page's mode, whatever happened (a refused Save changes nothing).
let hfFclFollowing = false
function hfFclFollowRoot() {
  const third = hfFclColumn(2)
  const root = hfFclColumn(1)
  const url = third?.dataset.hfUrl
  if (hfFclFollowing || !root || !url || !/IsActiveEntity=(true|false)/.test(url)) return
  const draft = !!root.querySelector('.hf-page--edit')
  const wanted = url.replace(/IsActiveEntity=(?:true|false)/g, `IsActiveEntity=${!draft}`)
  if (wanted === url) return
  hfFclFollowing = true
  htmx.ajax('GET', wanted, { target: '#app', swap: 'innerHTML', replace: wanted, headers: { 'X-Hf-Fcl': 'keep' } }).finally(() => { hfFclFollowing = false })
}
document.addEventListener('htmx:after:swap', () => setTimeout(hfFclFollowRoot, 0))

// resizing: dragging a separator (or the arrow keys on it) moves the border between two columns; neither gets narrower than 15%
const HF_FCL_MIN = 0.15
function hfFclResize(fcl, n, start, dx) {
  const left = Math.min(Math.max(start.widths[n - 1] + dx, HF_FCL_MIN * start.total), start.widths[n - 1] + start.widths[n] - HF_FCL_MIN * start.total)
  const widths = start.widths.map((w, i) => i === n - 1 ? left : i === n ? start.widths[n - 1] + start.widths[n] - left : w)
  widths.forEach((w, i) => fcl.style.setProperty(`--hf-c${i}`, `${(w / start.total * 100).toFixed(2)}%`))
  fcl.setAttribute('data-hf-custom', '')
}

function hfFclSizes(fcl) {
  return { widths: [...fcl.querySelectorAll(':scope > .hf-fcl__col')].map(col => col.getBoundingClientRect().width), total: fcl.getBoundingClientRect().width }
}

let hfFclDrag = null
document.addEventListener('pointerdown', e => {
  const sep = e.target.closest?.('[data-hf-sep]')
  if (!sep || e.button > 0 || e.target.closest('[data-hf-fcl-arrow]')) return
  const fcl = document.getElementById('fcl')
  hfFclDrag = { fcl, sep, n: Number(sep.closest('.hf-fcl__col').dataset.hfCol), x: e.clientX, ...hfFclSizes(fcl) }
  fcl.classList.add('hf-fcl--dragging')
  sep.classList.add('is-active')
  sep.setPointerCapture?.(e.pointerId)
  e.preventDefault()
})
document.addEventListener('pointermove', e => {
  if (hfFclDrag) hfFclResize(hfFclDrag.fcl, hfFclDrag.n, hfFclDrag, (e.clientX - hfFclDrag.x) * (getComputedStyle(hfFclDrag.fcl).direction === 'rtl' ? -1 : 1))
})
const hfFclDragEnd = () => {
  if (!hfFclDrag) return
  hfFclDrag.fcl.classList.remove('hf-fcl--dragging')
  hfFclDrag.sep.classList.remove('is-active')
  hfFclDrag = null
}
document.addEventListener('pointerup', hfFclDragEnd)
document.addEventListener('pointercancel', hfFclDragEnd)
document.addEventListener('keydown', e => {
  const sep = e.target.closest?.('[data-hf-sep]')
  if (!sep || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return
  const fcl = document.getElementById('fcl')
  const start = hfFclSizes(fcl)
  hfFclResize(fcl, Number(sep.closest('.hf-fcl__col').dataset.hfCol), start, (e.key === 'ArrowRight' ? 1 : -1) * start.total * 0.02)
  e.preventDefault()
})

document.addEventListener('click', e => {
  if (e.target.closest?.('[data-hf-fcl-arrow]')) {
    const layoutHolder = document.getElementById('fcl')
    const to = layoutHolder && HF_FCL_ARROWS[layoutHolder.dataset.hfLayout]?.to
    if (to) { hfFclResetSize(layoutHolder); layoutHolder.dataset.hfLayout = to; hfFclSync() }
    return
  }
  const button = e.target.closest?.('[data-hf-fcl-fullscreen]')
  const fcl = button && document.getElementById('fcl')
  if (!fcl) return
  const column = button.closest('.hf-fcl__col')?.dataset.hfCol
  const target = column === '2' ? 'EndColumnFullScreen' : 'MidColumnFullScreen'
  hfFclResetSize(fcl)
  if (fcl.dataset.hfLayout === target) fcl.dataset.hfLayout = fcl.dataset.hfRestore || document.getElementById('fcl-marker')?.dataset.hfLayout || 'TwoColumnsMidExpanded'
  else { fcl.dataset.hfRestore = fcl.dataset.hfLayout; fcl.dataset.hfLayout = target }
  hfFclSync()
})

// ---------- draft status in the footer ("Saving..." while a field PATCH is on its way) ----------
document.addEventListener('htmx:before:request', e => {
  const status = hfOpPage()?.querySelector('.hf-draft-status')
  if (status && e.target?.hasAttribute?.('hx-patch')) status.textContent = status.dataset.saving || ''
})

// ---------- modal dialogs (value help): Cancel / Escape close, a row writes its value into the field ----------
function hfCloseDialog() {
  document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(hfDismiss)
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-hf-dialog-close]')) return hfCloseDialog()
  const row = e.target.closest('.hf-vh-row')
  if (row) hfPickValue(row)
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.hf-overlay[data-hf-dialog]')) { e.preventDefault(); hfCloseDialog() }
  if (e.key === 'Enter' && e.target.classList?.contains('hf-vh-row')) hfPickValue(e.target)
  // F4 opens the value help of the focused field, like in Fiori elements
  if (e.key === 'F4') e.target.closest?.('.hf-input-group')?.querySelector('.hf-vh-open')?.click()
})

/** Writes the chosen key into the field the dialog was opened for and fires `change`: a draft PATCHes
 *  it right away, a direct-edit form just keeps it until Save. */
function hfPickValue(row) {
  const path = row.closest('[data-hf-path]')?.dataset.hfPath
  const input = path && document.querySelector(`[data-hf-field="${CSS.escape(path)}"] input[name="${CSS.escape(path)}"]`)
  hfCloseDialog()
  if (!input) return
  hfSetFieldValue(input, row.dataset.value)
  input.focus()
}

/** Sets an input from a pick (dialog row, suggestion) and commits it once. The browser would fire its own
 *  `change` again when the field is left (the value differs from the one at focus), which would send the same
 *  PATCH a second time, so that echo is swallowed. */
function hfSetFieldValue(input, value) {
  input.value = value
  input._hfCommitted = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
document.addEventListener('change', e => {
  const input = e.target
  if (e.isTrusted && input._hfCommitted !== undefined && input.value === input._hfCommitted) { e.stopImmediatePropagation(); input._hfCommitted = undefined }
}, true)

// ---------- value help field: type-ahead under the input ----------
const hfSuggestBox = input => input.closest('.hf-vh-field')?.querySelector('.hf-suggest')
function hfCloseSuggest(box) {
  if (!box) return
  box.hidden = true
  box.closest('.hf-vh-field')?.querySelector('[data-hf-vh-input]')?.setAttribute('aria-expanded', 'false')
}
let hfSuggestTimer
document.addEventListener('input', e => {
  const input = e.target.closest?.('[data-hf-vh-input]')
  if (!input) return
  clearTimeout(hfSuggestTimer)
  const box = hfSuggestBox(input)
  const text = input.value.trim()
  if (!text) return hfCloseSuggest(box)
  hfSuggestTimer = setTimeout(() => {
    const url = input.closest('.hf-vh-field').querySelector('.hf-vh-open').dataset.hfSuggestUrl
    htmx.ajax('GET', `${url}?mode=suggest&$search=${encodeURIComponent(text)}`, { target: box, swap: 'innerHTML', source: input })
  }, 250)
})
document.addEventListener('htmx:after:swap', e => {
  const box = e.target?.closest?.('.hf-suggest') || (e.detail?.ctx?.target?.classList?.contains('hf-suggest') ? e.detail.ctx.target : null)
  if (!box) return
  box.hidden = false
  box.closest('.hf-vh-field')?.querySelector('[data-hf-vh-input]')?.setAttribute('aria-expanded', 'true')
})
// clicking in the popup must not take the focus away from the input (that would close it before the click lands)
document.addEventListener('mousedown', e => { if (e.target.closest('.hf-suggest')) e.preventDefault() })
document.addEventListener('click', e => {
  const row = e.target.closest('.hf-suggest-row')
  if (row) {
    const input = row.closest('.hf-vh-field').querySelector('[data-hf-vh-input]')
    hfCloseSuggest(row.closest('.hf-suggest'))
    hfSetFieldValue(input, row.dataset.value)
    return
  }
  const all = e.target.closest('[data-hf-show-all]')
  if (all) {
    const field = all.closest('.hf-vh-field')
    const input = field.querySelector('[data-hf-vh-input]')
    hfCloseSuggest(all.closest('.hf-suggest'))
    htmx.ajax('GET', `${field.querySelector('.hf-vh-open').dataset.hfSuggestUrl}?$search=${encodeURIComponent(input.value.trim())}`, { target: '#dialogs', swap: 'innerHTML', source: input })
  }
})
document.addEventListener('focusout', e => {
  const input = e.target.closest?.('[data-hf-vh-input]')
  if (input) hfCloseSuggest(hfSuggestBox(input))
})
document.addEventListener('keydown', e => {
  const input = e.target.closest?.('[data-hf-vh-input]')
  const box = input && hfSuggestBox(input)
  if (!box || box.hidden) return
  const rows = [...box.querySelectorAll('.hf-suggest-row')]
  const current = rows.findIndex(r => r.classList.contains('is-active'))
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = e.key === 'ArrowDown' ? Math.min(current + 1, rows.length - 1) : Math.max(current - 1, 0)
    rows.forEach((r, i) => r.classList.toggle('is-active', i === next))
  } else if (e.key === 'Enter' && current >= 0) {
    e.preventDefault()
    hfCloseSuggest(box)
    hfSetFieldValue(input, rows[current].dataset.value)
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    hfCloseSuggest(box)
  }
}, true)

// "Show Filters" in the value help reveals one filter input per column
document.addEventListener('click', e => {
  const toggle = e.target.closest('[data-hf-vh-filters]')
  if (!toggle) return
  const filters = toggle.closest('form').querySelector('.hf-vh__filters')
  filters.hidden = !filters.hidden
  toggle.textContent = filters.hidden ? toggle.dataset.show : toggle.dataset.hide
  toggle.setAttribute('aria-expanded', String(!filters.hidden))
})

// a suggestion popup that would run off the right edge opens towards the left instead
document.addEventListener('htmx:after:swap', () => {
  for (const box of document.querySelectorAll('.hf-suggest:not([hidden])')) {
    box.style.left = ''; box.style.right = ''
    if (box.getBoundingClientRect().right > window.innerWidth - 8) { box.style.left = 'auto'; box.style.right = '0' }
  }
})

// a freshly opened dialog puts the cursor in its search field
document.addEventListener('htmx:after:swap', () => document.querySelector('.hf-overlay[data-hf-dialog] [data-hf-autofocus]')?.focus())

// ---------- edits are sent in order ----------
// A field is PATCHed when the user leaves it, which is also when they click Save or Discard. Without care the
// Save can overtake a slow PATCH and activate the draft without that edit (Fiori elements queues these too).
// PATCHes therefore run one after another, and every other write (and every page navigation) waits for the
// PATCHes that are still on their way.
let hfLastPatch = Promise.resolve()
document.addEventListener('htmx:config:request', e => {
  const ctx = e.detail?.ctx
  const request = ctx?.request
  if (!request) return
  const method = String(request.method || 'GET').toUpperCase()
  const navigates = ctx.target?.id === 'app'
  if (method !== 'PATCH' && method === 'GET' && !navigates) return
  const send = ctx.fetch ?? window.fetch.bind(window)
  ctx.fetch = (url, init) => {
    if (method === 'PATCH') {
      const done = hfLastPatch.then(() => send(url, init), () => send(url, init))
      hfLastPatch = done.then(() => {}, () => {})
      return done
    }
    return hfLastPatch.then(() => send(url, init))
  }
})

// ---------- date-time filters ----------
// A `datetime-local` input shows (and takes) the browser's local time; the server only knows instants. The server renders the value
// of a reloaded URL into `data-hf-utc` (UTC) and the filter request carries the UTC instant of what the user picked.
const hfLocalTime = iso => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const two = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`
}
function hfInitDateTimes() {
  for (const input of document.querySelectorAll('input[type=datetime-local][data-hf-utc]')) {
    if (input.dataset.hfUtc && !input.value) input.value = hfLocalTime(input.dataset.hfUtc)
  }
}
document.addEventListener('DOMContentLoaded', hfInitDateTimes)
document.addEventListener('hf:ready', hfInitDateTimes)
document.addEventListener('htmx:after:swap', hfInitDateTimes)
document.addEventListener('htmx:config:request', e => {
  const body = e.detail?.ctx?.request?.body
  if (!body?.has) return
  for (const input of document.querySelectorAll('form.hf-filter-bar input[type=datetime-local]')) {
    if (!body.has(input.name)) continue
    const date = new Date(input.value)
    body.set(input.name, input.value && !Number.isNaN(date.getTime()) ? date.toISOString() : '')
  }
})

// ---------- side effects wait for the field group to be left ----------
// Like Fiori elements, a change only has its side effects (Common.SideEffects, pushed over the event stream) when the focus leaves
// the field group (the form section) the field is in, not on every change: the PATCH says so (`X-Hf-Defer`) and this page flushes
// (`POST <object>/$effects`) once the group is left and the PATCH is done. The flush is queued behind the PATCHes (above).
let hfEffects = null // { group, url }
document.addEventListener('htmx:config:request', e => {
  const ctx = e.detail?.ctx
  if (String(ctx?.request?.method).toUpperCase() !== 'PATCH') return
  const group = ctx.sourceElement?.closest?.('[data-hf-fieldgroup]')
  const action = ctx.request.action
  if (!group || !/\/\$field\/[^/]+$/.test(action)) return
  ctx.request.headers['X-Hf-Defer'] = '1'
  hfEffects = { group, url: action.replace(/\/\$field\/[^/]+$/, '/$effects') }
})
function hfFlushEffects() {
  const pending = hfEffects
  if (!pending || pending.group.contains(document.activeElement)) return
  hfEffects = null
  htmx.ajax('POST', pending.url, { source: pending.group, target: pending.group, swap: 'none' })
}
document.addEventListener('focusout', () => setTimeout(hfFlushEffects, 0))
document.addEventListener('htmx:after:request', e => { if (String(e.detail?.ctx?.request?.method).toUpperCase() === 'PATCH') setTimeout(hfFlushEffects, 0) })

// ---------- busy state and failed requests ----------
// Like Fiori elements: a request that takes longer than a second (UI5's busy indicator delay) puts a busy overlay on what is
// being replaced -- the List Report's table card, or the whole page for a navigation. The delay is a CSS animation, so a quick
// response never shows anything. The overlay also keeps a second click from queuing another request.
const hfBusyCounts = new WeakMap()
function hfBusyHost(ctx) {
  const target = ctx?.target
  if (!target || !target.closest) return null
  return target.id === 'app' ? target : target.closest('.hf-table-card')
}
document.addEventListener('htmx:before:request', e => {
  const host = hfBusyHost(e.detail?.ctx)
  if (!host) return
  hfBusyCounts.set(host, (hfBusyCounts.get(host) || 0) + 1)
  host.classList.add('hf-busy')
  host.setAttribute('aria-busy', 'true')
})
document.addEventListener('htmx:finally:request', e => {
  const host = hfBusyHost(e.detail?.ctx)
  if (!host || !hfBusyCounts.has(host)) return
  const left = hfBusyCounts.get(host) - 1
  if (left > 0) return hfBusyCounts.set(host, left)
  hfBusyCounts.delete(host)
  host.classList.remove('hf-busy')
  host.removeAttribute('aria-busy')
})

// A request that cannot be answered (network down, timeout) or that the server fails (5xx) says so in a message strip; the
// page stays as it was (a 5xx body is not swapped in).
function hfRequestFailed() {
  let text = 'The request could not be completed. Please try again.'
  try { text = JSON.parse(document.getElementById('hf-texts')?.textContent || '{}').RequestFailed || text } catch { /* keep the default */ }
  const holder = document.getElementById('messages')
  if (!holder) return
  holder.replaceChildren()
  const strip = document.createElement('div')
  strip.className = 'fd-message-strip fd-message-strip--error'
  strip.setAttribute('role', 'alert')
  strip.innerHTML = '<div class="fd-message-strip__content"><div class="fd-message-strip__text"></div></div><button type="button" class="fd-message-strip__close" aria-label="Close"></button>'
  strip.querySelector('.fd-message-strip__text').textContent = text
  strip.querySelector('button').addEventListener('click', () => strip.remove())
  holder.append(strip)
}
document.addEventListener('htmx:error', hfRequestFailed)
document.addEventListener('htmx:after:request', e => {
  if ((e.detail?.ctx?.response?.status ?? 0) < 500) return
  e.preventDefault()
  hfRequestFailed()
})

// ---------- a field the server redraws shows the server's value ----------
// A morph updates the `value` attribute of an input, but an input somebody typed in keeps showing what was typed. When the value
// of a field changes elsewhere (the currency in the Price field and the Currency field are one property) the redrawn field has to
// show it, so what is not being typed in right now goes back to the attribute. "Being typed in" is text entered since the last change,
// not just having the focus: a Tab into the redrawn field is no reason to keep its old value.
document.addEventListener('input', e => { if (e.target?.dataset) e.target.dataset.hfTyping = '1' }, true)
document.addEventListener('change', e => { if (e.target?.dataset) delete e.target.dataset.hfTyping }, true)
document.addEventListener('htmx:after:settle', e => {
  const field = e.target
  if (!field?.matches?.('[data-hf-field]')) return
  for (const control of field.querySelectorAll('input, textarea, select')) {
    if (control.dataset.hfTyping || control.type === 'hidden') continue
    if (control.tagName === 'SELECT') {
      const wanted = [...control.options].find(option => option.defaultSelected)
      if (wanted && control.value !== wanted.value) control.value = wanted.value
    } else if (control.type === 'checkbox' || control.type === 'radio') {
      if (control.checked !== control.defaultChecked) control.checked = control.defaultChecked
    } else if (control.value !== control.defaultValue) {
      control.value = control.defaultValue
    }
  }
})

// ---------- Discard Draft: FE asks only when something was changed ----------
// A draft that was just made by Edit and not touched since is dropped at once (with the "Draft discarded" toast). Anything else, a draft
// somebody comes back to included, is asked about in a small popover over the button. "Untouched" is kept per draft in this browser
// session, and when in doubt the popover is shown.
// the draft is told by its own key, the first draft key in the route: the route itself changes while the columns of a page load
const hfDraftKey = () => /\(([^()]*IsActiveEntity=false[^()]*)\)/.exec(decodeURIComponent(location.pathname + location.hash))?.[1]
const hfFreshKey = () => 'hf:fresh:' + hfDraftKey()
let hfEditAt = 0
let hfSaveAt = 0
const hfForget = () => { try { if (hfDraftKey()) sessionStorage.removeItem(hfFreshKey()) } catch { /* private mode */ } }
document.addEventListener('click', e => {
  if (e.target.closest?.('[hx-post$="/$edit"]')) hfEditAt = Date.now()
  if (e.target.closest?.('[hx-post$="/$save"]')) hfSaveAt = Date.now()
  // everything but discarding that changes the draft: creating, deleting or pasting rows, actions
  const act = e.target.closest?.('[id$="op-page"] button')
  if (act && !act.matches('[data-hf-confirm-popover]') && (act.hasAttribute('hx-post') || act.hasAttribute('hx-delete') || act.dataset.hfAction === 'paste')) hfForget()
}, true)
document.addEventListener('change', e => { if (e.target.closest?.('[data-hf-field]')) hfForget() }, true)
document.addEventListener('htmx:after:settle', () => {
  if (hfEditAt && Date.now() - hfEditAt < 15000 && hfDraftKey()) {
    hfEditAt = 0
    try { sessionStorage.setItem(hfFreshKey(), '1') } catch { /* private mode */ }
  }
})
const hfDraftUntouched = () => { try { return !!hfDraftKey() && sessionStorage.getItem(hfFreshKey()) === '1' } catch { return false } }

/** FE's confirmation of a small question: a popover over the button with the question and one button. Resolves true when it is pressed. */
function hfConfirmPopover(anchor, { text, ok }) {
  return new Promise(resolve => {
    document.querySelectorAll('.hf-confirm-popover').forEach(p => p.remove())
    const pop = document.createElement('div')
    pop.className = 'hf-confirm-popover'
    pop.setAttribute('role', 'alertdialog')
    pop.innerHTML = '<p class="hf-confirm-popover__text"></p><button type="button" class="fd-button hf-confirm-popover__ok"></button>'
    pop.querySelector('p').textContent = text
    const button = pop.querySelector('button')
    button.textContent = ok
    document.body.appendChild(pop)
    const r = anchor.getBoundingClientRect()
    pop.style.bottom = `${window.innerHeight - r.top + 12}px`
    pop.style.right = `${Math.max(8, window.innerWidth - r.right - 6)}px`
    pop.style.setProperty('--hf-arrow', `${r.left + r.width / 2 - pop.getBoundingClientRect().left}px`)
    const done = result => {
      pop.remove()
      document.removeEventListener('mousedown', outside, true)
      document.removeEventListener('keydown', onKey, true)
      if (!result) anchor.focus?.()
      resolve(result)
    }
    const outside = e => { if (!pop.contains(e.target)) done(false) }
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false) } }
    document.addEventListener('mousedown', outside, true)
    document.addEventListener('keydown', onKey, true)
    button.addEventListener('click', () => done(true))
    button.focus()
  })
}

let hfOpenMessages = false
function hfOpenMessagePopover() {
  if (!hfOpenMessages) return
  hfOpenMessages = false
  const popover = document.querySelector('.hf-footer__messages .hf-popover')
  popover?.classList.add('is-open')
  popover?.querySelector('[data-hf-popover-toggle]')?.setAttribute('aria-expanded', 'true')
}
document.addEventListener('htmx:after:settle', hfOpenMessagePopover)
