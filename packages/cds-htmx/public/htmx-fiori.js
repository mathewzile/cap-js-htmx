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
function hfConfirmDialog({ title, text, ok, cancel, critical }) {
  return new Promise(resolve => {
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
    if (critical) okButton.classList.add('fd-button--negative')
    overlay.querySelector('[data-hf-cancel]').textContent = cancel
    const previous = document.activeElement
    const close = result => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
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
  const count = elt.dataset.hfConfirmCount != null
    ? document.querySelectorAll(elt.dataset.hfConfirmCount).length
    : 0
  const confirmed = await hfConfirmDialog({
    title: elt.dataset.hfConfirmTitle || elt.textContent.trim(),
    text: text.replace('{count}', count),
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
  const headers = e.detail.ctx.request.headers
  if (document.getElementById('fcl') && !headers['X-Hf-Fcl']) headers['X-Hf-Fcl'] = '1'
})

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
  document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(o => o.remove())
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
