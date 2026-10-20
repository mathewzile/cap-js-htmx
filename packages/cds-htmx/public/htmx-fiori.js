document.addEventListener('htmx:error', e => console.error('htmx error', e.detail))

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

// ---------- List Report selection: Delete is enabled while rows are ticked ----------
function hfSyncSelection(table) {
  const any = !!table.querySelector('tbody .hf-checkbox:checked')
  for (const button of document.querySelectorAll('[data-hf-needs-selection]')) button.disabled = !any
}
document.addEventListener('change', e => {
  const box = e.target
  if (!box.classList?.contains('hf-checkbox')) return
  const table = box.closest('table')
  if (table) hfSyncSelection(table)
})
document.addEventListener('htmx:after:swap', () => {
  for (const table of document.querySelectorAll('table.hf-table')) hfSyncSelection(table)
})

// ---------- toast: shown for a few seconds, then removed ----------
let hfToastTimer
document.addEventListener('htmx:after:swap', () => {
  const toast = document.querySelector('#toast .fd-message-toast')
  if (!toast) return
  clearTimeout(hfToastTimer)
  hfToastTimer = setTimeout(() => toast.remove(), 3000)
})
