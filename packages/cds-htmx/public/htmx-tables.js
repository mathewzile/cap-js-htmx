// Table and filter tooling the page does by itself (design: the same toolbar as Fiori elements):
//  - View Settings (columns shown, sort) for the List Report and every table section
//  - Export of the List Report (server CSV for the current filters) and of a section (CSV of what is shown)
//  - a search box in section tables
//  - Adapt Filters (which filter fields are shown) and saved views (the "Standard" menu)
// Settings and saved views are kept in this browser's localStorage, per entity set / table.
;(() => {
  const texts = (() => { try { return JSON.parse(document.getElementById('hf-texts')?.textContent || '{}') } catch { return {} } })()
  const T = key => texts[key] ?? key

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem('hf:' + key)) } catch { return null } },
    set(key, value) { try { localStorage.setItem('hf:' + key, JSON.stringify(value)) } catch { /* private mode: settings last for the page only */ } },
    remove(key) { try { localStorage.removeItem('hf:' + key) } catch { /* ignore */ } }
  }

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v
      else if (k === 'text') node.textContent = v
      else if (v === true) node.setAttribute(k, '')
      else if (v !== false && v != null) node.setAttribute(k, v)
    }
    for (const child of children.flat()) if (child != null) node.append(child)
    return node
  }

  /** A modal dialog (same look as the value help): header, body, footer buttons. */
  function openDialog({ title, body, buttons, tabs }) {
    document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(o => o.remove())
    const footer = el('footer', { class: 'hf-dialog__footer' })
    const dialog = el('div', { class: 'hf-dialog', role: 'dialog', 'aria-modal': 'true' },
      el('header', { class: 'hf-dialog__header' }, el('h2', { class: 'fd-title fd-title--h5', text: title })),
      tabs ? el('div', { class: 'hf-dialog__tabs', role: 'tablist' }) : null,
      el('div', { class: 'hf-dialog__body' }, body),
      footer)
    const overlay = el('div', { class: 'hf-overlay', 'data-hf-dialog': true }, dialog)
    const close = () => overlay.remove()
    for (const b of buttons) {
      const button = el('button', { type: 'button', class: `fd-button ${b.emphasized ? 'fd-button--emphasized' : 'fd-button--transparent'}`, text: b.label })
      button.addEventListener('click', () => { if (b.action?.() !== false) close() })
      footer.append(button)
    }
    ;(document.getElementById('dialogs') || document.body).append(overlay)
    overlay.querySelector('input, button.fd-button--emphasized')?.focus()
    return { overlay, dialog, close }
  }

  /** Tabs inside a dialog body: [{label, content}] -> switchable panels. */
  function tabbed(panels) {
    const bar = el('div', { class: 'hf-dialog__tabs', role: 'tablist' })
    const body = el('div', { class: 'hf-dialog__panels' })
    panels.forEach((panel, i) => {
      const tab = el('button', { type: 'button', class: `hf-dialog__tab${i === 0 ? ' is-selected' : ''}`, role: 'tab', text: panel.label })
      panel.content.hidden = i !== 0
      tab.addEventListener('click', () => {
        bar.querySelectorAll('.hf-dialog__tab').forEach(t => t.classList.toggle('is-selected', t === tab))
        panels.forEach(p => { p.content.hidden = p !== panel })
      })
      bar.append(tab)
      body.append(panel.content)
    })
    return el('div', {}, bar, body)
  }

  // ---------------------------------------------------------------- column visibility (view settings)
  const colIndex = cell => { const m = /(?:^|\s)hf-col-(\d+)(?:\s|$)/.exec(cell.className); return m ? Number(m[1]) : null }
  const tableOf = container => container.querySelector('table.hf-table')
  const hiddenCols = container => store.get('view:' + container.dataset.hfView)?.hidden ?? []

  function applyView(container) {
    const hidden = new Set(hiddenCols(container))
    for (const cell of container.querySelectorAll('th, td')) {
      const i = colIndex(cell)
      if (i != null) cell.hidden = hidden.has(i)
    }
  }
  const applyViews = () => document.querySelectorAll('[data-hf-view]').forEach(applyView)

  function visibleColumns(container) {
    const hidden = new Set(hiddenCols(container))
    return [...tableOf(container).querySelectorAll('thead th.hf-th')].map(colIndex).filter(i => i != null && !hidden.has(i))
  }

  function openViewSettings(container) {
    const table = tableOf(container)
    const hidden = new Set(hiddenCols(container))
    const headers = [...table.querySelectorAll('thead th.hf-th')].filter(th => colIndex(th) != null)
    const checks = headers.map(th => {
      const box = el('input', { type: 'checkbox', checked: !hidden.has(colIndex(th)), 'data-col': colIndex(th) })
      return el('label', { class: 'hf-dialog__row' }, box, el('span', { text: th.querySelector('.hf-th__text')?.textContent.trim() || '' }))
    })
    const panels = [{ label: T('Columns'), content: el('div', {}, checks) }]

    // Sort: only the List Report sorts on the server
    const lr = container.closest('.hf-page--lr')
    const sortable = [...table.querySelectorAll('thead th[data-hf-sort]')]
    let sortSelect, sortDir
    if (lr && sortable.length) {
      const current = table.querySelector('thead th[aria-sort]')
      sortSelect = el('select', { class: 'fd-select' }, el('option', { value: '', text: T('NoSort') }),
        sortable.map(th => el('option', { value: th.dataset.hfSort, text: th.dataset.hfLabel || th.textContent.trim(), selected: th === current })))
      sortDir = el('select', { class: 'fd-select' },
        el('option', { value: 'asc', text: T('Ascending') }), el('option', { value: 'desc', text: T('Descending'), selected: current?.getAttribute('aria-sort') === 'descending' }))
      panels.push({ label: T('Sort'), content: el('div', { class: 'hf-dialog__form' }, el('label', { text: T('SortBy') }), sortSelect, sortDir) })
    }
    openDialog({
      title: T('ViewSettings'),
      body: tabbed(panels),
      buttons: [
        { label: T('OK'), emphasized: true, action() {
          const off = checks.map(label => label.querySelector('input')).filter(box => !box.checked).map(box => Number(box.dataset.col))
          store.set('view:' + container.dataset.hfView, { hidden: off })
          applyView(container)
          if (sortSelect && sortSelect.value && sortSelect.value !== (table.querySelector('thead th[aria-sort]')?.dataset.hfSort ?? '')) sortList(lr, `${sortSelect.value}${sortDir.value === 'desc' ? ' desc' : ''}`)
          else if (sortSelect && sortSelect.value && sortDir.value !== (table.querySelector('thead th[aria-sort]')?.getAttribute('aria-sort') === 'descending' ? 'desc' : 'asc')) sortList(lr, `${sortSelect.value}${sortDir.value === 'desc' ? ' desc' : ''}`)
        } },
        { label: T('Reset'), action() { store.remove('view:' + container.dataset.hfView); applyView(container) } },
        { label: T('Cancel') }
      ]
    })
  }

  /** The List Report's own `$table` request (same URL the column headers use), with the filter form's values. */
  function sortList(lr, orderBy) {
    const sample = lr.querySelector('thead a.hf-th__sort')
    const form = lr.querySelector('form.hf-filter-bar')
    if (!form || !sample) return
    const base = new URL(sample.getAttribute('hx-get'), location.href).pathname // `.../$table` (the header link's own href is `#`)
    const params = filterParams(form)
    params.set('$orderby', orderBy)
    htmx.ajax('GET', `${base}?${params}`, { target: '#lr-table-body', swap: 'innerHTML' })
  }

  const filterParams = form => {
    const params = new URLSearchParams()
    for (const [k, v] of new FormData(form)) if (v !== '' && !(k === 'f.EditingStatus' && v === 'ALL')) params.append(k, v)
    return params
  }

  // ---------------------------------------------------------------- export
  function download(name, mime, content) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = el('a', { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const csvCell = text => {
    let value = String(text ?? '').trim()
    if (/^[=+\-@]/.test(value) && Number.isNaN(Number(value))) value = "'" + value // Excel formulas
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }

  function exportSection(button) {
    const container = button.closest('[data-hf-view]')
    const table = tableOf(container)
    const columns = [...table.querySelectorAll('thead th.hf-th')].filter(th => !th.hidden)
    const index = columns.map(colIndex)
    const lines = [columns.map(th => csvCell(th.querySelector('.hf-th__text')?.textContent)).join(',')]
    for (const row of table.querySelectorAll('tbody tr:not([hidden]):not(.hf-table__nodata)')) {
      lines.push(index.map(i => {
        const cell = row.querySelector(`.hf-col-${i}`)
        return csvCell(cell?.querySelector('input, select, textarea')?.value ?? cell?.textContent)
      }).join(','))
    }
    download(`${button.dataset.hfFilename || 'export'}.csv`, 'text/csv;charset=utf-8', '﻿' + lines.join('\r\n') + '\r\n')
  }

  function exportList(button) {
    const lr = button.closest('.hf-page--lr')
    const form = lr.querySelector('form.hf-filter-bar')
    const params = form ? filterParams(form) : new URLSearchParams()
    const sorted = lr.querySelector('thead th[aria-sort]')
    if (sorted) params.set('$orderby', `${sorted.dataset.hfSort}${sorted.getAttribute('aria-sort') === 'descending' ? ' desc' : ''}`)
    params.set('cols', visibleColumns(lr.querySelector('[data-hf-view]')).join(','))
    const a = el('a', { href: `${button.dataset.hfExport}?${params}`, download: '' })
    document.body.append(a)
    a.click()
    a.remove()
  }

  // ---------------------------------------------------------------- section search
  document.addEventListener('input', e => {
    const box = e.target.closest?.('[data-hf-table-search]')
    if (!box) return
    const query = box.value.trim().toLowerCase()
    const table = tableOf(box.closest('[data-hf-view]'))
    for (const row of table.querySelectorAll('tbody tr:not(.hf-table__nodata)')) {
      const text = [...row.querySelectorAll('td')].map(td => td.querySelector('input, select, textarea')?.value ?? td.textContent).join(' ').toLowerCase()
      row.hidden = !!query && !text.includes(query)
    }
  })

  // ---------------------------------------------------------------- adapt filters
  const filtersKey = set => 'filters:' + set
  const filterItems = form => [...form.querySelectorAll('.hf-filter[data-hf-filter]')]

  function applyFilters() {
    for (const lr of document.querySelectorAll('.hf-page--lr')) {
      const hidden = new Set(store.get(filtersKey(lr.dataset.hfSet)) ?? [])
      for (const item of filterItems(lr)) {
        const off = hidden.has(item.dataset.hfFilter)
        item.hidden = off
        // a field that is not shown must not filter
        item.querySelectorAll('input, select').forEach(control => { control.disabled = off })
      }
    }
  }

  function openAdaptFilters(lr) {
    const set = lr.dataset.hfSet
    const hidden = new Set(store.get(filtersKey(set)) ?? [])
    const rows = filterItems(lr).map(item => el('label', { class: 'hf-dialog__row' },
      el('input', { type: 'checkbox', checked: !hidden.has(item.dataset.hfFilter), 'data-path': item.dataset.hfFilter }),
      el('span', { text: item.dataset.hfLabel })))
    openDialog({
      title: T('AdaptFilters'),
      body: el('div', {}, el('h3', { class: 'fd-title fd-title--h5', text: T('FilterValuesAndVisibility') }), rows),
      buttons: [
        { label: T('OK'), emphasized: true, action() {
          store.set(filtersKey(set), rows.map(r => r.querySelector('input')).filter(b => !b.checked).map(b => b.dataset.path))
          applyFilters()
        } },
        { label: T('Reset'), action() { store.remove(filtersKey(set)); applyFilters() } },
        { label: T('Cancel') }
      ]
    })
  }

  // ---------------------------------------------------------------- saved views ("Standard" menu)
  const viewsKey = set => 'variants:' + set

  function currentViewState(lr) {
    const form = lr.querySelector('form.hf-filter-bar')
    const values = {}
    for (const [k, v] of new FormData(form)) values[k] = v
    return {
      values,
      hiddenFilters: store.get(filtersKey(lr.dataset.hfSet)) ?? [],
      hiddenCols: hiddenCols(lr.querySelector('[data-hf-view]'))
    }
  }

  function applyViewState(lr, state) {
    const form = lr.querySelector('form.hf-filter-bar')
    const container = lr.querySelector('[data-hf-view]')
    store.set(filtersKey(lr.dataset.hfSet), state?.hiddenFilters ?? [])
    store.set('view:' + container.dataset.hfView, { hidden: state?.hiddenCols ?? [] })
    for (const control of form.querySelectorAll('input[name], select[name]')) {
      if (control.type === 'submit') continue
      control.value = state?.values?.[control.name] ?? (control.name === 'f.EditingStatus' ? 'ALL' : '')
    }
    applyFilters()
    applyView(container)
    form.requestSubmit()
  }

  function renderVariants(menu) {
    const lr = menu.closest('.hf-page--lr')
    if (!lr) return
    const set = lr.dataset.hfSet
    const saved = store.get(viewsKey(set)) ?? []
    const list = menu.querySelector('[data-hf-variant-list]')
    const title = menu.querySelector('[data-hf-variant-title]')
    const active = menu.dataset.hfActive ?? ''
    title.textContent = active || menu.dataset.hfDefault
    list.replaceChildren()
    const item = (name, state, removable) => {
      const li = el('li', { class: 'hf-variant' })
      const pick = el('button', { type: 'button', class: 'hf-popover__item', text: name, 'aria-current': name === (active || menu.dataset.hfDefault) ? 'true' : false })
      pick.addEventListener('click', () => { menu.dataset.hfActive = state ? name : ''; applyViewState(lr, state); renderVariants(menu); hfClosePopovers() })
      li.append(pick)
      if (removable) {
        const remove = el('button', { type: 'button', class: 'hf-variant__remove', 'aria-label': T('Delete'), title: T('Delete') }, el('i', { class: 'sap-icon--decline', 'aria-hidden': 'true' }))
        remove.addEventListener('click', e => {
          e.stopPropagation()
          store.set(viewsKey(set), saved.filter(v => v.name !== name))
          if (menu.dataset.hfActive === name) menu.dataset.hfActive = ''
          renderVariants(menu)
        })
        li.append(remove)
      }
      return li
    }
    list.append(item(menu.dataset.hfDefault, null, false), ...saved.map(v => item(v.name, v.state, true)))
    const saveAs = el('li', { class: 'hf-variant hf-variant--save' }, el('button', { type: 'button', class: 'hf-popover__item', text: T('SaveAs') + '…' }))
    saveAs.querySelector('button').addEventListener('click', () => {
      hfClosePopovers()
      const input = el('input', { type: 'text', class: 'fd-input', 'aria-label': T('VariantName'), placeholder: T('VariantName') })
      openDialog({
        title: T('SaveAs'), body: el('div', { class: 'hf-dialog__form' }, el('label', { text: T('VariantName') }), input),
        buttons: [
          { label: T('OK'), emphasized: true, action() {
            const name = input.value.trim()
            if (!name) { input.focus(); return false }
            store.set(viewsKey(set), [...saved.filter(v => v.name !== name), { name, state: currentViewState(lr) }])
            menu.dataset.hfActive = name
            renderVariants(menu)
          } },
          { label: T('Cancel') }
        ]
      })
    })
    list.append(saveAs)
  }

  // ---------------------------------------------------------------- wiring
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-hf-action]')
    if (!button) return
    const container = button.closest('[data-hf-view]')
    switch (button.dataset.hfAction) {
      case 'settings': if (container) openViewSettings(container); break
      case 'export': exportList(button); break
      case 'export-dom': exportSection(button); break
      case 'adapt-filters': openAdaptFilters(button.closest('.hf-page--lr')); break
    }
  })

  // The value help dialog fills filter fields too (their inputs are named f.<path>)
  document.addEventListener('click', e => {
    const row = e.target.closest('.hf-vh-row')
    const target = row?.closest('[data-hf-target]')?.dataset.hfTarget
    if (!row || !target?.startsWith('f.')) return
    e.stopImmediatePropagation()
    const input = document.querySelector(`form.hf-filter-bar [name="${CSS.escape(target)}"]`)
    document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(o => o.remove())
    if (input) { input.value = row.dataset.value; input.focus() }
  }, true)

  const applyAll = () => {
    applyViews()
    applyFilters()
    document.querySelectorAll('#hf-variants').forEach(renderVariants)
  }
  document.addEventListener('DOMContentLoaded', applyAll)
  // A table body swap (sort, Go, More) brings new cells that need the saved column settings again
  document.addEventListener('htmx:after:swap', applyAll)
})()
