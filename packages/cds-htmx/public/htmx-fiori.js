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
