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

  /** A modal dialog in the FE look: header (title, optional "Reset" at the right), optional tabs, body, footer
   *  (the first button is the emphasized one). `tabs` is [{label, content}]; without it `body` is the content.
   *  `reset.action(api)` runs on "Reset", which is enabled once anything in the dialog changed. */
  function openDialog({ title, body, tabs, buttons, reset }) {
    document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(o => o.remove())
    const resetButton = reset ? el('button', { type: 'button', class: 'hf-dialog__link', text: reset.label, disabled: true }) : null
    const footer = el('footer', { class: 'hf-dialog__footer' })
    let tabBar = null
    let content = body
    if (tabs) {
      tabBar = el('div', { class: 'hf-dialog__tabs', role: 'tablist' })
      content = el('div', { class: 'hf-dialog__panels' })
      tabs.forEach((tab, i) => {
        const button = el('button', { type: 'button', class: `hf-dialog__tab${i === 0 ? ' is-selected' : ''}`, role: 'tab', 'aria-selected': i === 0, text: tab.label })
        tab.content.classList.add('hf-dialog__panel')
        tab.content.hidden = i !== 0
        button.addEventListener('click', () => {
          tabBar.querySelectorAll('.hf-dialog__tab').forEach(t => { t.classList.toggle('is-selected', t === button); t.setAttribute('aria-selected', t === button) })
          tabs.forEach(t => { t.content.hidden = t !== tab })
        })
        tabBar.append(button)
        content.append(tab.content)
      })
    }
    const dialog = el('div', { class: 'hf-dialog', role: 'dialog', 'aria-modal': 'true' },
      el('header', { class: 'hf-dialog__header' }, el('h2', { text: title }), resetButton),
      tabBar,
      tabs ? content : el('div', { class: 'hf-dialog__body' }, body),
      footer)
    const overlay = el('div', { class: 'hf-overlay', 'data-hf-dialog': true }, dialog)
    const close = () => hfDismiss(overlay)
    const api = { overlay, dialog, close, markChanged: () => { if (resetButton) resetButton.disabled = false } }
    if (resetButton) {
      resetButton.addEventListener('click', () => { reset.action(api); resetButton.disabled = true })
      dialog.addEventListener('input', () => api.markChanged())
      dialog.addEventListener('change', () => api.markChanged())
    }
    buttons.forEach((b, i) => {
      const button = el('button', { type: 'button', class: `fd-button ${i === 0 ? 'fd-button--emphasized' : 'fd-button--transparent'}`, text: b.label })
      button.addEventListener('click', () => { if (b.action?.(api) !== false) close() })
      footer.append(button)
    })
    ;(document.getElementById('dialogs') || document.body).append(overlay)
    overlay.querySelector('input:not([type=checkbox]), .fd-button--emphasized')?.focus()
    return api
  }

  /** One row of a checkbox list (FE's selected rows are tinted and outlined). */
  function checkRow(text, checked, attrs = {}) {
    const box = el('input', { type: 'checkbox', class: 'hf-checkbox', checked, ...attrs })
    const row = el('li', { class: `hf-dialog__row${checked ? ' is-selected' : ''}` }, el('label', { class: 'hf-dialog__row-label' }, box, el('span', { class: 'hf-dialog__row-text', text })))
    box.addEventListener('change', () => row.classList.toggle('is-selected', box.checked))
    return { row, box }
  }

  // ---------------------------------------------------------------- column visibility (view settings)
  const colIndex = cell => { const m = /(?:^|\s)hf-col-(\d+)(?:\s|$)/.exec(cell.className); return m ? Number(m[1]) : null }
  const tableOf = container => container.querySelector('table.hf-table')
  // The table has a hidden column for every other property of the entity (data-hf-extra); the view says which of them are shown (`extra`)
  const viewState = container => store.get('view:' + container.dataset.hfView) ?? {}
  const extraCols = container => [...tableOf(container).querySelectorAll('thead th[data-hf-extra]')].map(colIndex)
  const hiddenCols = container => {
    const shown = new Set(viewState(container).extra ?? [])
    return [...new Set([...(viewState(container).hidden ?? []), ...extraCols(container).filter(i => !shown.has(i))])]
  }

  const groupOf = container => store.get('view:' + container.dataset.hfView)?.group ?? null

  function applyView(container) {
    const hidden = new Set(hiddenCols(container))
    for (const cell of container.querySelectorAll('th, td')) {
      const i = colIndex(cell)
      if (i != null) cell.hidden = hidden.has(i)
    }
    applyGroups(container)
  }

  /** A header row ("<column>: <value>") before each run of rows with the same value in the grouping column. */
  function applyGroups(container) {
    const body = container.querySelector('tbody')
    if (!body) return
    body.querySelectorAll('tr.hf-group-row').forEach(r => r.remove())
    const group = groupOf(container)
    if (group == null) return
    const label = container.querySelector(`thead th.hf-col-${group}`)?.dataset.hfLabel ?? ''
    let last
    for (const row of [...body.querySelectorAll(':scope > tr:not(.hf-table__nodata)')]) {
      const value = row.querySelector(`td.hf-col-${group}`)?.textContent.replace(/\s+/g, ' ').trim() ?? ''
      if (value === last) continue
      last = value
      const header = el('tr', { class: 'hf-group-row' }, el('td', { colspan: row.children.length, text: `${label}: ${value || '–'}` }))
      row.before(header)
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
    const labelOf = th => th.querySelector('.hf-th__text')?.textContent.trim() || ''
    const extras = new Set(extraCols(container))
    const ordered = [...headers.filter(th => !hidden.has(colIndex(th))), ...headers.filter(th => hidden.has(colIndex(th))).sort((a, b) => labelOf(a).localeCompare(labelOf(b)))]
    const items = ordered.map(th => checkRow(labelOf(th), !hidden.has(colIndex(th)), { 'data-col': colIndex(th) }))

    // Columns tab: search, "Hide (All) Unselected", the master row "Columns (shown/all)" and one row per column
    const search = el('input', { type: 'search', class: 'fd-input', placeholder: T('Search'), 'aria-label': T('Search') })
    const hideUnselected = el('input', { type: 'checkbox', class: 'hf-switch', role: 'switch' })
    const master = el('input', { type: 'checkbox', class: 'hf-checkbox' })
    const masterLabel = el('span', { class: 'hf-dialog__row-text' })
    const list = el('ul', { class: 'hf-dialog__list' }, el('li', { class: 'hf-dialog__row hf-dialog__row--head' }, el('label', { class: 'hf-dialog__row-label' }, master, masterLabel)), items.map(i => i.row))
    const refresh = () => {
      const shown = items.filter(i => i.box.checked).length
      masterLabel.textContent = `${T('Columns')} (${shown}/${items.length})`
      master.checked = shown === items.length
      master.indeterminate = shown > 0 && shown < items.length
      const q = search.value.trim().toLowerCase()
      for (const { row, box } of items) row.hidden = (q && !row.textContent.toLowerCase().includes(q)) || (hideUnselected.checked && !box.checked)
    }
    for (const { box } of items) box.addEventListener('change', refresh)
    search.addEventListener('input', refresh)
    hideUnselected.addEventListener('change', refresh)
    master.addEventListener('change', () => { for (const { row, box } of items) { box.checked = master.checked; row.classList.toggle('is-selected', box.checked) } refresh() })
    refresh()
    const columnsPanel = el('div', {},
      el('div', { class: 'hf-dialog__bar' },
        el('div', { class: 'hf-input-group' }, search, el('span', { class: 'hf-input-group__addon' }, el('span', { class: 'hf-input-icon' }, el('i', { class: 'sap-icon--search', 'aria-hidden': 'true' })))),
        el('label', { class: 'hf-switch-label' }, el('span', { text: T('HideUnselected') }), hideUnselected)),
      list)
    const tabs = [{ label: T('Columns'), content: columnsPanel }]

    // Sort tab: only the List Report sorts on the server
    const lr = container.closest('.hf-page--lr')
    const sortable = [...table.querySelectorAll('thead th[data-hf-sort]')]
    let sortSelect
    let direction = 'asc'
    if (lr && sortable.length) {
      const current = table.querySelector('thead th[aria-sort]')
      if (current?.getAttribute('aria-sort') === 'descending') direction = 'desc'
      sortSelect = el('select', { class: 'fd-select', 'aria-label': T('SortBy') }, el('option', { value: '', text: T('SortBy') }),
        sortable.map(th => el('option', { value: th.dataset.hfSort, text: th.dataset.hfLabel || th.textContent.trim(), selected: th === current })))
      const dirLabel = el('span', { text: direction === 'desc' ? T('Descending') : T('Ascending') })
      const asc = el('button', { type: 'button', class: 'is-selected', title: T('Ascending'), 'aria-label': T('Ascending') }, el('i', { class: 'sap-icon--sort-ascending', 'aria-hidden': 'true' }))
      const desc = el('button', { type: 'button', title: T('Descending'), 'aria-label': T('Descending') }, el('i', { class: 'sap-icon--sort-descending', 'aria-hidden': 'true' }))
      const setDirection = value => { direction = value; asc.classList.toggle('is-selected', value === 'asc'); desc.classList.toggle('is-selected', value === 'desc'); dirLabel.textContent = value === 'desc' ? T('Descending') : T('Ascending') }
      asc.addEventListener('click', () => { setDirection('asc'); sortSelect.dispatchEvent(new Event('change', { bubbles: true })) })
      desc.addEventListener('click', () => { setDirection('desc'); sortSelect.dispatchEvent(new Event('change', { bubbles: true })) })
      setDirection(direction)
      tabs.push({ label: T('Sort'), content: el('div', {}, el('div', { class: 'hf-dialog__sort' }, sortSelect, el('span', { class: 'hf-segmented' }, asc, desc), dirLabel)) })
    }
    // Group tab: rows are ordered by the column and get a header row per value (List Report)
    let groupSelect
    const group = groupOf(container)
    if (lr && sortable.length) {
      groupSelect = el('select', { class: 'fd-select', 'aria-label': T('GroupBy') }, el('option', { value: '', text: T('NoGrouping') }),
        sortable.map(th => el('option', { value: colIndex(th), text: th.dataset.hfLabel || th.textContent.trim(), selected: colIndex(th) === group })))
      tabs.push({ label: T('Group'), content: el('div', {}, el('div', { class: 'hf-dialog__sort' }, el('label', { text: T('GroupBy') }), groupSelect)) })
    }
    const current = () => table.querySelector('thead th[aria-sort]')
    const dialog = openDialog({
      title: T('ViewSettings'),
      tabs,
      reset: { label: T('Reset'), action() {
        for (const { row, box } of items) { box.checked = !extras.has(Number(box.dataset.col)); row.classList.toggle('is-selected', box.checked) } // the table's own columns, not the other properties
        refresh()
        if (sortSelect) sortSelect.value = ''
        if (groupSelect) groupSelect.value = ''
      } },
      buttons: [
        { label: T('OK'), action() {
          const off = items.filter(i => !i.box.checked).map(i => Number(i.box.dataset.col))
          const groupIndex = groupSelect && groupSelect.value !== '' ? Number(groupSelect.value) : null
          const state = {}
          const hiddenOwn = off.filter(i => !extras.has(i))
          const shownExtra = items.filter(i => i.box.checked && extras.has(Number(i.box.dataset.col))).map(i => Number(i.box.dataset.col))
          if (hiddenOwn.length) state.hidden = hiddenOwn
          if (shownExtra.length) state.extra = shownExtra
          if (groupIndex != null) state.group = groupIndex
          if (Object.keys(state).length) store.set('view:' + container.dataset.hfView, state); else store.remove('view:' + container.dataset.hfView)
          applyView(container)
          const groupTh = groupIndex != null ? sortable.find(th => colIndex(th) === groupIndex) : null
          const sortTerm = sortSelect?.value ? `${sortSelect.value}${direction === 'desc' ? ' desc' : ''}` : ''
          const terms = [groupTh?.dataset.hfSort, sortTerm].filter(Boolean)
          if (!terms.length) return
          const same = !groupTh && sortSelect.value === (current()?.dataset.hfSort ?? '') && direction === (current()?.getAttribute('aria-sort') === 'descending' ? 'desc' : 'asc')
          if (!same && (groupTh || group != null || sortSelect?.value)) sortList(lr, terms.join(','))
        } },
        { label: T('Cancel') }
      ]
    })
    if (viewState(container).hidden?.length || viewState(container).extra?.length || group != null) dialog.markChanged() // something differs from the defaults, so "Reset" is useful
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

  /** A date-time picker shows the browser's local time; the filter is sent as the instant in UTC. */
  const utcOf = (form, name, value) => {
    const input = form.elements[name]
    const date = input?.type === 'datetime-local' ? new Date(value) : null
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : value
  }

  const filterParams = form => {
    const params = new URLSearchParams()
    for (const [k, v] of new FormData(form)) if (v !== '' && !(k === 'f.EditingStatus' && v === 'ALL')) params.append(k, utcOf(form, k, v))
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

  /** A paged section's CSV comes from the server: every row, with the section's search and sort and the visible columns. */
  function exportSectionServer(button, container) {
    const params = new URLSearchParams()
    const { hfOrderby } = sectionState(container)
    const search = container.querySelector('[data-hf-table-search]')?.value.trim() // what the box says now, not what was last loaded (the reload is debounced)
    if (search) params.set('$search', search)
    if (hfOrderby) params.set('$orderby', hfOrderby)
    params.set('cols', visibleColumns(container).join(','))
    const a = el('a', { href: `${button.dataset.hfExport}?${params}`, download: '' })
    document.body.append(a)
    a.click()
    a.remove()
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

  // ---------------------------------------------------------------- section tables
  // A section that pages (`data-hf-table-url` on its table) searches and sorts on the server, over the whole set: its own `$table`
  // with `$search` / `$orderby`, replacing the rows (the More button asks for the following pages with the same two).
  const sectionUrlOf = container => tableOf(container)?.dataset.hfTableUrl
  const sectionState = container => tableOf(container).dataset

  function loadSection(container, { search = sectionState(container).hfSearch ?? '', orderby = sectionState(container).hfOrderby ?? '' } = {}) {
    const table = tableOf(container)
    table.dataset.hfSearch = search
    table.dataset.hfOrderby = orderby
    const params = new URLSearchParams()
    if (search) params.set('$search', search)
    if (orderby) params.set('$orderby', orderby)
    const [path, ...term] = [orderby.split(',')[0].trim()]
    const key = path.split(' ')[0]
    for (const th of table.querySelectorAll('thead th.hf-th')) {
      if (key && th.dataset.hfSort === key) th.setAttribute('aria-sort', / desc$/.test(path) ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort')
    }
    void term
    return htmx.ajax('GET', `${sectionUrlOf(container)}${params.size ? '?' + params : ''}`, { source: table, target: '#' + table.querySelector('tbody').id, swap: 'innerHTML' })
  }

  /** Sorts a paged section by a column (`direction` null: back to the default order); a grouped column leads the sort. */
  function sortSection(container, key, direction) {
    const group = groupOf(container)
    const groupKey = group == null ? null : tableOf(container).querySelector(`thead th.hf-col-${group}`)?.dataset.hfSort
    const terms = [groupKey && groupKey !== key ? groupKey : null, key && direction ? key + (direction === 'desc' ? ' desc' : '') : null].filter(Boolean)
    return loadSection(container, { orderby: terms.join(',') })
  }

  const sectionSearchTimers = new WeakMap()
  document.addEventListener('input', e => {
    const box = e.target.closest?.('[data-hf-table-search]')
    const container = box?.closest('[data-hf-view]')
    if (!box || !container || !sectionUrlOf(container)) return
    clearTimeout(sectionSearchTimers.get(box))
    sectionSearchTimers.set(box, setTimeout(() => loadSection(container, { search: box.value.trim() }), 300))
  })

  // ---------------------------------------------------------------- section search
  document.addEventListener('input', e => {
    const box = e.target.closest?.('[data-hf-table-search]')
    if (!box || sectionUrlOf(box.closest('[data-hf-view]'))) return
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

  // Filters added through "Add Filter" (properties beyond UI.SelectionFields) are plain text fields with Define Conditions
  const extrasKey = set => 'extra-filters:' + set
  const availableFilters = lr => { try { return JSON.parse(lr.querySelector('form.hf-filter-bar')?.dataset.hfAvailable || '[]') } catch { return [] } }

  function extraFilterItem({ path, label, type }) {
    const id = `f-${path.replace(/\W/g, '_')}`
    const input = el('input', { id, name: `f.${path}`, type: 'text', class: 'fd-input', value: '' })
    const button = el('button', { type: 'button', class: 'fd-button fd-button--compact fd-button--transparent', 'data-hf-action': 'conditions', 'aria-haspopup': 'dialog', 'aria-label': T('DefineConditions') },
      el('i', { class: 'sap-icon--value-help', 'aria-hidden': 'true' }))
    return el('div', { class: 'fd-form-item hf-filter hf-filter--extra', 'data-hf-filter': path, 'data-hf-label': label, 'data-hf-type': type },
      el('label', { class: 'fd-form-label hf-filter__label', for: id, text: label }),
      el('div', { class: 'hf-input-group' }, input, el('span', { class: 'hf-input-group__addon' }, button)))
  }

  function syncExtraFilters(lr) {
    const form = lr.querySelector('form.hf-filter-bar')
    if (!form) return
    const wanted = new Set(store.get(extrasKey(lr.dataset.hfSet)) ?? [])
    const available = new Map(availableFilters(lr).map(f => [f.path, f]))
    for (const item of form.querySelectorAll('.hf-filter--extra')) if (!wanted.has(item.dataset.hfFilter)) item.remove()
    for (const path of wanted) {
      if (!available.has(path) || form.querySelector(`.hf-filter[data-hf-filter="${CSS.escape(path)}"]`)) continue
      form.querySelector('.hf-filter-bar__actions').before(extraFilterItem(available.get(path)))
    }
  }

  function applyFilters() {
    for (const lr of document.querySelectorAll('.hf-page--lr')) {
      syncExtraFilters(lr)
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
    const form = lr.querySelector('form.hf-filter-bar')
    const hidden = new Set(store.get(filtersKey(set)) ?? [])

    // One row per filter, as FE shows them: its label, the field itself, a toggle for whether it is in the bar and a button that clears it.
    // The field is a copy; what was typed in it goes to the real one on OK / Filter.
    const adaptRow = (path, label, extra, source) => {
      const box = el('input', { type: 'checkbox', class: 'hf-adapt__box', hidden: true, checked: extra || !hidden.has(path), 'data-path': path, 'data-extra': extra ? '1' : '' })
      const wrapper = source?.querySelector('.hf-input-group, .hf-select, .hf-date-range') ?? source?.querySelector('input, select')
      const control = wrapper ? wrapper.cloneNode(true) : el('input', { type: 'text', class: 'fd-input' })
      const inner = control.matches('input, select') ? [control] : [...control.querySelectorAll('input, select')]
      const originals = wrapper ? (wrapper.matches('input, select') ? [wrapper] : [...wrapper.querySelectorAll('input, select')]) : []
      inner.forEach((node, i) => {
        node.removeAttribute('id'); node.removeAttribute('name'); node.disabled = false
        node.dataset.hfName = originals[i]?.name ?? ''
        if (originals[i]) node.value = originals[i].value
      })
      control.querySelectorAll('button').forEach(button => { button.disabled = true })
      const eye = el('button', { type: 'button', class: 'fd-button fd-button--transparent hf-adapt__eye', 'aria-pressed': String(box.checked), 'aria-label': T('Show'), title: T('Show') }, el('i', { class: 'sap-icon--show', 'aria-hidden': 'true' }))
      eye.addEventListener('click', () => { box.checked = !box.checked; eye.setAttribute('aria-pressed', String(box.checked)) })
      const clear = el('button', { type: 'button', class: 'fd-button fd-button--transparent hf-adapt__clear', 'aria-label': T('Clear'), title: T('Clear') }, el('i', { class: 'sap-icon--decline', 'aria-hidden': 'true' }))
      clear.addEventListener('click', () => inner.forEach(node => { node.value = node.tagName === 'SELECT' ? node.options[0]?.value ?? '' : '' }))
      const row = el('li', { class: 'hf-adapt__row', 'data-label': label.toLowerCase() }, el('span', { class: 'hf-adapt__label', text: label + ':' }), el('div', { class: 'hf-adapt__field' }, control), eye, clear, box)
      return { row, box, inner }
    }
    const items = filterItems(lr).map(item => adaptRow(item.dataset.hfFilter, item.dataset.hfLabel, item.classList.contains('hf-filter--extra'), item))
    const list = el('ul', { class: 'hf-adapt__list' }, items.map(i => i.row))

    const search = el('input', { type: 'search', class: 'fd-input', placeholder: T('SearchForFilters'), 'aria-label': T('SearchForFilters') })
    search.addEventListener('input', () => items.forEach(i => { i.row.hidden = !!search.value && !i.row.dataset.label.includes(search.value.toLowerCase()) }))

    // "Add Filter": any other property of the entity
    const present = () => new Set(items.map(i => i.box.dataset.path))
    const addSelect = el('select', { class: 'fd-select', 'aria-label': T('AddFilter') })
    const fillAdd = () => {
      addSelect.replaceChildren(el('option', { value: '', text: T('SelectOrType') }),
        ...availableFilters(lr).filter(f => !present().has(f.path)).map(f => el('option', { value: f.path, text: f.label })))
    }
    fillAdd()
    addSelect.addEventListener('change', () => {
      const f = availableFilters(lr).find(x => x.path === addSelect.value)
      if (!f) return
      const added = adaptRow(f.path, f.label, true)
      items.push(added)
      list.append(added.row)
      fillAdd()
    })

    const apply = () => {
      const off = items.filter(i => !i.box.checked && !i.box.dataset.extra).map(i => i.box.dataset.path)
      if (off.length) store.set(filtersKey(set), off); else store.remove(filtersKey(set))
      const extras = items.filter(i => i.box.dataset.extra && i.box.checked).map(i => i.box.dataset.path)
      if (extras.length) store.set(extrasKey(set), extras); else store.remove(extrasKey(set))
      applyFilters()
      for (const i of items) {
        for (const node of i.inner) {
          const target = node.dataset.hfName && form.querySelector(`[name="${CSS.escape(node.dataset.hfName)}"]`)
          if (target) target.value = node.value
        }
      }
    }
    const dialog = openDialog({
      title: T('AdaptFilters'),
      body: el('div', { class: 'hf-dialog__panel hf-adapt' },
        el('div', { class: 'hf-adapt__head' }, el('h3', { text: T('FilterValuesAndVisibility') }), search),
        list,
        el('div', { class: 'hf-adapt__add' }, el('label', { text: T('AddFilter') + ':' }), addSelect)),
      reset: { label: T('Reset'), action() {
        for (const i of [...items]) {
          if (i.box.dataset.extra) { i.row.remove(); items.splice(items.indexOf(i), 1) } else { i.box.checked = true; i.row.querySelector('.hf-adapt__eye').setAttribute('aria-pressed', 'true') }
        }
        fillAdd()
      } },
      buttons: [
        { label: T('OK'), action: apply },
        { label: T('Filter'), action() { apply(); form.requestSubmit() } },
        { label: T('Cancel') }
      ]
    })
    if (hidden.size || items.some(i => i.box.dataset.extra)) dialog.markChanged()
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
      extraFilters: store.get(extrasKey(lr.dataset.hfSet)) ?? [],
      hiddenCols: hiddenCols(lr.querySelector('[data-hf-view]')),
      extraCols: viewState(lr.querySelector('[data-hf-view]')).extra ?? [],
      group: groupOf(lr.querySelector('[data-hf-view]'))
    }
  }

  function applyViewState(lr, state) {
    const form = lr.querySelector('form.hf-filter-bar')
    const container = lr.querySelector('[data-hf-view]')
    store.set(filtersKey(lr.dataset.hfSet), state?.hiddenFilters ?? [])
    store.set(extrasKey(lr.dataset.hfSet), state?.extraFilters ?? [])
    store.set('view:' + container.dataset.hfView, { hidden: state?.hiddenCols ?? [], ...(state?.extraCols?.length ? { extra: state.extraCols } : {}), ...(state?.group != null ? { group: state.group } : {}) })
    syncExtraFilters(lr) // the added filter fields have to exist before their values are set
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
    const body = menu.querySelector('.fd-popover__body')
    body.querySelectorAll('.hf-vm__head, .hf-vm__foot').forEach(node => node.remove())
    body.prepend(el('div', { class: 'hf-vm__head', text: T('MyViews') }))
    const saveAs = el('button', { type: 'button', class: 'fd-button fd-button--emphasized', text: T('SaveAs') })
    const manage = el('button', { type: 'button', class: 'fd-button fd-button--transparent', text: T('Manage') })
    body.append(el('div', { class: 'hf-vm__foot' }, saveAs, manage))
    manage.addEventListener('click', () => {
      hfClosePopovers()
      const kept = new Set(saved.map(v => v.name))
      const rows = saved.map(v => {
        const row = el('li', { class: 'hf-dialog__row' }, el('span', { class: 'hf-dialog__row-text', text: v.name }))
        const remove = el('button', { type: 'button', class: 'fd-button fd-button--transparent hf-icon-button', 'aria-label': T('Delete'), title: T('Delete') }, el('i', { class: 'sap-icon--delete', 'aria-hidden': 'true' }))
        remove.addEventListener('click', () => { kept.delete(v.name); row.remove() })
        row.append(remove)
        return row
      })
      openDialog({
        title: T('ManageViews'), body: el('ul', { class: 'hf-dialog__list' }, el('li', { class: 'hf-dialog__row hf-dialog__row--head' }, el('span', { class: 'hf-dialog__row-text', text: menu.dataset.hfDefault })), ...rows),
        buttons: [
          { label: T('OK'), action() {
            store.set(viewsKey(set), saved.filter(v => kept.has(v.name)))
            if (menu.dataset.hfActive && !kept.has(menu.dataset.hfActive)) menu.dataset.hfActive = ''
            renderVariants(menu)
          } },
          { label: T('Cancel') }
        ]
      })
    })
    saveAs.addEventListener('click', () => {
      hfClosePopovers()
      const input = el('input', { type: 'text', class: 'fd-input', 'aria-label': T('VariantName'), placeholder: T('VariantName') })
      openDialog({
        title: T('SaveAs'), body: el('div', { class: 'hf-dialog__form' }, el('label', { text: T('VariantName') }), input),
        buttons: [
          { label: T('OK'), action() {
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
  }

  // ---------------------------------------------------------------- Define Conditions (free-text filter fields)
  // The field holds FE's condition syntax: `a;b` any of, `*a*` contains, `a*` starts with, `*a` ends with, `!a` not equal.
  const OPERATORS = [['eq', 'EqualTo'], ['ne', 'NotEqualTo'], ['co', 'Contains'], ['sw', 'StartsWith'], ['ew', 'EndsWith'],
    ['bt', 'Between'], ['gt', 'GreaterThan'], ['ge', 'GreaterOrEqual'], ['lt', 'LessThan'], ['le', 'LessOrEqual']]
  // Date fields add FE's date operators; the ones without a value (Today ...) are spelled out in the field as typed text
  const DATE_OPERATORS = [['eq', 'EqualTo'], ['ne', 'NotEqualTo'], ['bt', 'Between'], ['lt', 'LessThan'], ['le', 'LessOrEqual'], ['gt', 'GreaterThan'], ['ge', 'GreaterOrEqual'],
    ['today', 'Today'], ['yesterday', 'Yesterday'], ['tomorrow', 'Tomorrow'], ['thisweek', 'ThisWeek'], ['thismonth', 'ThisMonth'], ['thisyear', 'ThisYear'], ['lastdays', 'LastDays'], ['nextdays', 'NextDays']]
  const FIXED_DATES = { today: 'Today', yesterday: 'Yesterday', tomorrow: 'Tomorrow', thisweek: 'This week', thismonth: 'This month', thisyear: 'This year' }
  const needsValue = op => !(op in FIXED_DATES)
  function parseDateOperator(token) {
    const text = token.trim().toLowerCase().replace(/\s+/g, ' ')
    const fixed = Object.entries(FIXED_DATES).find(([, label]) => label.toLowerCase() === text)
    if (fixed) return { op: fixed[0], value: '' }
    const relative = /^(last|next) (\d+) days$/.exec(text)
    return relative ? { op: relative[1] + 'days', value: relative[2] } : null
  }
  function parseConditions(text, isDate) {
    return text.split(';').filter(Boolean).map(token => {
      const dateOperator = isDate ? parseDateOperator(token) : null
      if (dateOperator) return dateOperator
      if (token.startsWith('!')) return { op: 'ne', value: token.slice(1) }
      const compare = /^(<=|>=|<|>)(.+)$/.exec(token)
      if (compare) return { op: { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }[compare[1]], value: compare[2] }
      if (token.includes('...')) return { op: 'bt', value: token }
      const starts = token.startsWith('*'), ends = token.length > 1 && token.endsWith('*')
      const value = token.replace(/^\*/, '').replace(/\*$/, '')
      return { op: starts && ends ? 'co' : ends ? 'sw' : starts ? 'ew' : 'eq', value }
    })
  }
  const formatCondition = ({ op, value }) => FIXED_DATES[op] ?? ({ lastdays: `Last ${value} days`, nextdays: `Next ${value} days`, eq: value, ne: `!${value}`, co: `*${value}*`, sw: `${value}*`, ew: `*${value}`, bt: value, gt: `>${value}`, ge: `>=${value}`, lt: `<${value}`, le: `<=${value}` })[op]

  function openConditions(button) {
    const filter = button.closest('[data-hf-filter]')
    const input = filter.querySelector('input:not([type=date])') ?? filter.querySelector('input')
    const isDate = filter.dataset.hfType === 'date'
    const operators = isDate ? DATE_OPERATORS : OPERATORS
    const rows = el('div', { class: 'hf-conditions' })
    const summary = el('div', { class: 'hf-conditions__summary' })
    const sync = () => {
      const entered = [...rows.children].map(r => ({ op: r.querySelector('select').value, value: r.querySelector('input').value.trim() })).filter(c => !needsValue(c.op) || c.value)
      summary.textContent = entered.length ? entered.map(formatCondition).join('; ') : ''
      return entered
    }
    const addRow = (condition = { op: 'eq', value: '' }) => {
      const select = el('select', { class: 'fd-select' }, operators.map(([op, key]) => el('option', { value: op, text: T(key), selected: op === condition.op })))
      const value = el('input', { type: 'text', class: 'fd-input', placeholder: T('Value'), value: condition.value })
      // a date operator picks a day (`Between` takes `a...b`, `Last n days` a number, `Today` and friends none)
      const syncType = () => {
        value.hidden = isDate && !needsValue(select.value)
        value.type = isDate && ['eq', 'ne', 'lt', 'le', 'gt', 'ge'].includes(select.value) ? 'date' : isDate && /days$/.test(select.value) ? 'number' : 'text'
        value.placeholder = isDate && select.value === 'bt' ? 'YYYY-MM-DD...YYYY-MM-DD' : T('Value')
      }
      select.addEventListener('change', () => { syncType(); sync() })
      syncType()
      const remove = el('button', { type: 'button', class: 'fd-button fd-button--compact fd-button--transparent', 'aria-label': T('Delete') }, el('i', { class: 'sap-icon--decline', 'aria-hidden': 'true' }))
      const row = el('div', { class: 'hf-conditions__row' }, select, value, remove)
      remove.addEventListener('click', () => { row.remove(); if (!rows.children.length) addRow(); sync() })
      row.addEventListener('input', sync)
      rows.append(row)
    }
    const existing = parseConditions(input.value, isDate)
    for (const c of existing.length ? existing : [undefined]) addRow(c)
    const add = el('button', { type: 'button', class: 'fd-button fd-button--compact', text: T('AddCondition') })
    add.addEventListener('click', () => { addRow(); rows.lastChild.querySelector('input').focus() })
    sync()
    openDialog({
      title: `${T('DefineConditions')}: ${filter.dataset.hfLabel}`,
      body: el('div', { class: 'hf-dialog__form hf-conditions-form' }, rows, el('div', { class: 'hf-conditions__add' }, add),
        el('h3', { class: 'hf-conditions__title', text: T('Conditions') }), summary),
      buttons: [{ label: T('OK'), action() { input.value = sync().map(formatCondition).join(';'); input.dispatchEvent(new Event('change', { bubbles: true })) } }, { label: T('Cancel') }]
    }).dialog.classList.add('hf-dialog--value-help')
  }

  // ---------------------------------------------------------------- paste rows (section tables of a draft)
  // Cells copied from a spreadsheet (tab/newline separated) become new rows, one cell per editable visible column.
  function pasteRows(section, text) {
    const url = section.querySelector('[data-hf-paste-url]')?.dataset.hfPasteUrl
    const lines = String(text).replace(/\r/g, '').split('\n')
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    if (!url || !lines.length) return
    const cols = [...section.querySelectorAll('thead th[data-hf-paste-path]')].filter(th => !th.hidden).map(th => th.dataset.hfPastePath)
    if (!cols.length) return
    htmx.ajax('POST', url, { target: '#app', swap: 'innerHTML', values: { cols: JSON.stringify(cols), rows: JSON.stringify(lines.map(l => l.split('\t'))) } })
  }
  document.addEventListener('paste', e => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return // pasting into a cell is a normal paste
    const section = e.target.closest?.('.hf-section--table') ?? (document.activeElement?.closest?.('.hf-section--table'))
    if (!section?.querySelector('[data-hf-paste-url]')) return
    e.preventDefault()
    pasteRows(section, e.clipboardData?.getData('text') ?? '')
  })

  // ---------------------------------------------------------------- tree table
  // A node's children are fetched when it is first expanded (`$children`, inserted below its row) and kept afterwards:
  // collapsing only hides them, so expanding again is instant. Rows carry `data-hf-level` and `data-hf-state`.
  const levelOf = row => Number(row.dataset.hfLevel)

  function setTreeState(row, state) {
    row.dataset.hfState = state
    const toggle = row.querySelector('.hf-tree-toggle')
    if (!toggle) return
    toggle.setAttribute('aria-expanded', String(state === 'expanded'))
    toggle.setAttribute('aria-label', T(state === 'expanded' ? 'CollapseNode' : 'ExpandNode'))
    toggle.querySelector('i').className = state === 'expanded' ? 'sap-icon--navigation-down-arrow' : 'sap-icon--navigation-right-arrow'
  }

  /** The rows below a node, in order, as long as they are deeper than it. */
  function descendantsOf(row) {
    const result = []
    for (let next = row.nextElementSibling; next && next.dataset.hfLevel != null && levelOf(next) > levelOf(row); next = next.nextElementSibling) result.push(next)
    return result
  }

  /** Shows the descendants whose ancestors (up to `row`) are all expanded, hides the others. */
  function showDescendants(row) {
    const open = { [levelOf(row)]: true }
    for (const child of descendantsOf(row)) {
      const level = levelOf(child)
      const visible = !!open[level - 1]
      child.hidden = !visible
      open[level] = visible && child.dataset.hfState === 'expanded'
    }
  }

  async function expandNode(row) {
    if (!row.hasAttribute('data-hf-loaded')) {
      const table = row.closest('table')
      const url = new URL(table.dataset.hfTree, location.href)
      url.searchParams.set('node', row.dataset.hfNode)
      url.searchParams.set('level', String(levelOf(row) + 1))
      const sorted = table.querySelector('thead th[aria-sort]')
      if (sorted) url.searchParams.set('$orderby', sorted.dataset.hfSort + (sorted.getAttribute('aria-sort') === 'descending' ? ' desc' : ''))
      const toggle = row.querySelector('.hf-tree-toggle')
      row.setAttribute('aria-busy', 'true')
      toggle.disabled = true
      try {
        await htmx.ajax('GET', url.pathname + url.search, { source: toggle, target: row, swap: 'afterend' })
        row.setAttribute('data-hf-loaded', '')
      } finally {
        row.removeAttribute('aria-busy')
        toggle.disabled = false
      }
    }
    setTreeState(row, 'expanded')
    showDescendants(row)
  }

  function collapseNode(row) {
    setTreeState(row, 'collapsed')
    for (const child of descendantsOf(row)) child.hidden = true
  }

  document.addEventListener('click', e => {
    const toggle = e.target.closest?.('.hf-tree-toggle')
    if (!toggle) return
    e.stopPropagation()
    const row = toggle.closest('tr')
    if (row.dataset.hfState === 'expanded') collapseNode(row); else expandNode(row)
  })

  // ---------------------------------------------------------------- sort indicator
  // A click on a column header opens the column menu under it, like FE's (sorting is an entry of that menu, so it goes through the
  // filter bar's state and keeps the filters; the header link alone would drop them). A second click on the header closes it.
  let menuClosedBy = null
  document.addEventListener('click', e => {
    const th = e.target.closest?.('thead th.hf-th')
    if (!th || !th.closest('[data-hf-view]')) return
    e.preventDefault()
    e.stopPropagation()
    if (menuClosedBy === th) { menuClosedBy = null; return }
    const rect = th.getBoundingClientRect()
    openColumnMenu(th, rect.left, rect.bottom)
  }, true)

  // The rows were sorted on the server (`HX-Trigger: hf:sorted`): move the arrow in the header
  document.addEventListener('hf:sorted', e => {
    const { path, desc } = e.detail ?? {}
    for (const th of document.querySelectorAll('.hf-page--lr thead th[data-hf-sort]')) {
      const on = !!path && th.dataset.hfSort === path
      if (on) th.setAttribute('aria-sort', desc ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort')
      const link = th.querySelector('a.hf-th__sort')
      link?.querySelector('i')?.remove()
      if (on) link?.append(' ', el('i', { class: desc ? 'sap-icon--sort-descending' : 'sap-icon--sort-ascending', 'aria-hidden': 'true' }))
    }
  })

  // ---------------------------------------------------------------- column menu
  // A right click (or the context-menu key) on a column header opens FE's column menu: sort, group, filter, hide and the
  // column settings. The List Report sorts and groups on the server (the same `$table` request the header link uses);
  // a section table only has the rows on the page, so it sorts those.
  let columnMenu = null
  let columnMenuOpenedAt = 0
  const closeColumnMenu = () => { columnMenu?.remove(); columnMenu = null }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  function sortRows(container, index, direction) {
    const table = tableOf(container)
    const body = table.querySelector('tbody')
    const cellText = row => row.querySelector(`td.hf-col-${index}`)?.textContent.replace(/\s+/g, ' ').trim() ?? ''
    const rows = [...body.querySelectorAll(':scope > tr:not(.hf-table__nodata):not(.hf-group-row)')]
    rows.sort((a, b) => collator.compare(cellText(a), cellText(b)) * (direction === 'desc' ? -1 : 1))
    body.querySelectorAll(':scope > tr.hf-group-row').forEach(r => r.remove())
    body.append(...rows)
    for (const th of table.querySelectorAll('thead th.hf-th')) {
      if (colIndex(th) === index) th.setAttribute('aria-sort', direction === 'desc' ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort')
    }
    applyGroups(container)
  }

  function updateView(container, change) {
    const key = 'view:' + container.dataset.hfView
    const state = { ...(store.get(key) ?? {}), ...change }
    for (const k of Object.keys(state)) if (state[k] == null || (Array.isArray(state[k]) && !state[k].length)) delete state[k]
    if (Object.keys(state).length) store.set(key, state); else store.remove(key)
    applyView(container)
  }

  /** Shows the filter field of a column in the filter bar (adding it through "Add Filter" if it isn't there) and focuses it. */
  function focusFilter(lr, path) {
    const form = lr.querySelector('form.hf-filter-bar')
    const find = () => form.querySelector(`.hf-filter[data-hf-filter="${CSS.escape(path)}"]`)
    const set = lr.dataset.hfSet
    if (!find()) {
      store.set(extrasKey(set), [...(store.get(extrasKey(set)) ?? []), path])
      applyFilters()
    }
    const hidden = new Set(store.get(filtersKey(set)) ?? [])
    if (hidden.delete(path)) { store.set(filtersKey(set), [...hidden]); applyFilters() }
    if (lr.classList.contains('hf-page--collapsed')) lr.querySelector('[data-hf-toggle-header]')?.click()
    find()?.querySelector('input:not([type=hidden]), select')?.focus()
  }

  function openColumnMenu(th, x, y) {
    closeColumnMenu()
    const container = th.closest('[data-hf-view]')
    if (!container) return
    const lr = container.closest('.hf-page--lr')
    const index = colIndex(th)
    const sortKey = th.dataset.hfSort
    const current = th.getAttribute('aria-sort')
    const editing = !!container.querySelector('tbody input:not([type=checkbox]):not([type=hidden])')
    const server = !lr && !!sectionUrlOf(container) // a paged section sorts and groups on the server
    const canSort = lr || server ? !!sortKey : !editing && !!container.querySelector('tbody tr') && !tableOf(container).dataset.hfTree
    const canGroup = canSort && !tableOf(container).dataset.hfTree
    const grouped = groupOf(container) === index
    const canFilter = !!lr && !!sortKey && (!!lr.querySelector(`.hf-filter[data-hf-filter="${CSS.escape(sortKey)}"]`) || availableFilters(lr).some(f => f.path === sortKey))

    const sortBy = direction => lr ? sortList(lr, sortKey + (direction === 'desc' ? ' desc' : '')) : server ? sortSection(container, sortKey, direction) : sortRows(container, index, direction)
    const setGroup = value => {
      updateView(container, { group: value })
      if (value == null) return
      if (lr) sortList(lr, sortKey); else if (server) sortSection(container, sortKey, 'asc'); else sortRows(container, index, 'asc') // a group's rows sit together
    }
    const entries = [
      canSort && { text: T('SortAscending'), icon: 'sort-ascending', selected: current === 'ascending', run: () => sortBy('asc') },
      canSort && { text: T('SortDescending'), icon: 'sort-descending', selected: current === 'descending', run: () => sortBy('desc') },
      canSort && (lr || server) && current && { text: T('ResetSort'), icon: 'decline', run: () => lr ? sortList(lr, '') : sortSection(container, null, null) },
      canGroup && { text: grouped ? T('Ungroup') : T('Group'), icon: 'group-2', run: () => setGroup(grouped ? null : index) },
      canFilter && { text: T('FilterColumn'), icon: 'filter', run: () => focusFilter(lr, sortKey) },
      'separator',
      { text: T('HideColumn'), icon: 'hide', disabled: visibleColumns(container).length <= 1, run: () => updateView(container, { hidden: [...new Set([...hiddenCols(container), index])] }) },
      { text: T('ColumnSettings'), icon: 'action-settings', run: () => openViewSettings(container) }
    ].filter(Boolean)

    const list = el('ul', { class: 'hf-popover__list', role: 'menu' }, entries.map(entry => {
      if (entry === 'separator') return el('li', { class: 'hf-colmenu__separator', role: 'separator' })
      const button = el('button', { type: 'button', role: 'menuitem', class: 'hf-popover__item hf-colmenu__item', disabled: !!entry.disabled, 'aria-current': entry.selected ? 'true' : false },
        el('i', { class: `sap-icon--${entry.icon}`, 'aria-hidden': 'true' }), el('span', { text: entry.text }))
      button.addEventListener('click', () => { closeColumnMenu(); entry.run() })
      return el('li', { role: 'none' }, button)
    }))
    columnMenu = el('div', { class: 'hf-colmenu', 'aria-label': th.dataset.hfLabel || th.textContent.trim() }, list)
    document.body.append(columnMenu)
    const box = columnMenu.getBoundingClientRect()
    columnMenu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`
    columnMenu.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`
    columnMenu.querySelector('button:not([disabled])')?.focus({ preventScroll: true })
    columnMenuOpenedAt = performance.now()
  }

  document.addEventListener('contextmenu', e => {
    const th = e.target.closest?.('thead th.hf-th')
    if (!th || !th.closest('[data-hf-view]')) return
    e.preventDefault()
    // the context-menu key has no pointer position: open the menu under the header cell
    const keyboard = e.clientX === 0 && e.clientY === 0
    const rect = th.getBoundingClientRect()
    openColumnMenu(th, keyboard ? rect.left : e.clientX, keyboard ? rect.bottom : e.clientY)
  })
  document.addEventListener('mousedown', e => {
    menuClosedBy = null
    if (!columnMenu || columnMenu.contains(e.target)) return
    menuClosedBy = e.target.closest?.('thead th.hf-th') // pressing the header of the open menu closes it, the click that follows must not reopen it
    closeColumnMenu()
  })
  document.addEventListener('keydown', e => {
    if (!columnMenu) return
    if (e.key === 'Escape') { closeColumnMenu(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...columnMenu.querySelectorAll('button:not([disabled])')]
    const at = items.indexOf(document.activeElement)
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  })
  window.addEventListener('resize', closeColumnMenu)
  // a scroll right after the menu opened is the browser bringing the clicked header into view, not the user moving on
  window.addEventListener('scroll', () => { if (performance.now() - columnMenuOpenedAt > 250) closeColumnMenu() }, true)
  document.addEventListener('htmx:before:request', closeColumnMenu)

  // ---------------------------------------------------------------- wiring
  document.addEventListener('click', e => {
    const paste = e.target.closest('[data-hf-action=paste]')
    if (paste) {
      const section = paste.closest('.hf-section--table')
      navigator.clipboard?.readText().then(text => pasteRows(section, text)).catch(() => {})
      return
    }
    const button = e.target.closest('[data-hf-action]')
    if (!button) return
    const container = button.closest('[data-hf-view]')
    switch (button.dataset.hfAction) {
      case 'conditions': openConditions(button); break
      case 'settings': if (container) openViewSettings(container); break
      case 'copy': if (container) copySelectedRows(container); break
      case 'export': exportList(button); break
      case 'export-dom': exportSection(button); break
      case 'export-section': exportSectionServer(button, container); break
      case 'adapt-filters': openAdaptFilters(button.closest('.hf-page--lr')); break
    }
  })

  // The value help of a filter field selects several values: a click on a row ticks it, the selection is listed under the table and OK
  // puts it into the filter as `a;b` (the condition syntax "any of").
  const multiState = new WeakMap()
  const multiDialog = node => node.closest?.('[data-hf-multi]')
  const multiSelection = dialog => {
    if (!multiState.has(dialog)) {
      const input = document.querySelector(`form.hf-filter-bar [name="${CSS.escape(dialog.dataset.hfTarget)}"]`)
      const selection = new Map()
      for (const value of (input?.value ?? '').split(';').filter(Boolean)) selection.set(value, value)
      multiState.set(dialog, selection)
    }
    return multiState.get(dialog)
  }
  const rowLabel = row => row.lastElementChild.textContent.trim() || row.dataset.value
  const syncMulti = dialog => {
    const selection = multiSelection(dialog)
    const rows = [...dialog.querySelectorAll('.hf-vh-row')]
    for (const row of rows) {
      if (selection.has(row.dataset.value)) selection.set(row.dataset.value, rowLabel(row))
      const box = row.querySelector('.hf-checkbox')
      if (box) box.checked = selection.has(row.dataset.value)
    }
    const all = dialog.querySelector('[data-hf-vh-all]')
    if (all) all.checked = rows.length > 0 && rows.every(row => selection.has(row.dataset.value))
    const box = dialog.querySelector('.hf-vh__selection')
    box.querySelector('.hf-vh__selection-title').textContent = selection.size ? `${box.dataset.some} (${selection.size})` : box.dataset.none
    box.querySelector('[data-hf-vh-clear]').hidden = !selection.size
    box.querySelector('.hf-vh__token-list').replaceChildren(...[...selection].map(([value, label]) => {
      const remove = el('button', { type: 'button', class: 'hf-vh__token-remove', 'aria-label': T('Delete'), 'data-value': value }, el('i', { class: 'sap-icon--decline', 'aria-hidden': 'true' }))
      return el('span', { class: 'hf-vh__token' }, el('span', { text: label }), remove)
    }))
    dialog.querySelector('[data-hf-vh-copy]').disabled = !selection.size
  }
  document.addEventListener('click', e => {
    const dialog = multiDialog(e.target)
    if (!dialog) return
    const selection = multiSelection(dialog)
    const row = e.target.closest('.hf-vh-row')
    if (row) {
      e.stopImmediatePropagation()
      if (selection.has(row.dataset.value)) selection.delete(row.dataset.value); else selection.set(row.dataset.value, rowLabel(row))
      syncMulti(dialog)
    } else if (e.target.closest('[data-hf-vh-all]')) {
      const all = e.target.closest('[data-hf-vh-all]').checked
      for (const r of dialog.querySelectorAll('.hf-vh-row')) { if (all) selection.set(r.dataset.value, rowLabel(r)); else selection.delete(r.dataset.value) }
      syncMulti(dialog)
    } else if (e.target.closest('[data-hf-vh-clear]')) {
      selection.clear(); syncMulti(dialog)
    } else if (e.target.closest('.hf-vh__token-remove')) {
      selection.delete(e.target.closest('.hf-vh__token-remove').dataset.value); syncMulti(dialog)
    } else if (e.target.closest('[data-hf-vh-copy]')) {
      navigator.clipboard?.writeText([...selection.values()].join('\n')).catch(() => {})
    } else if (e.target.closest('[data-hf-vh-ok]')) {
      const input = document.querySelector(`form.hf-filter-bar [name="${CSS.escape(dialog.dataset.hfTarget)}"]`)
      document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(hfDismiss)
      if (input) { input.value = [...selection.keys()].join(';'); input.focus() }
    } else if (e.target.closest('[data-hf-vh-conditions]')) {
      const button = document.querySelector(`[data-hf-filter="${CSS.escape(dialog.dataset.hfTarget.replace(/^f\./, ''))}"] button`)
      document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(hfDismiss)
      if (button) openConditions(button)
    } else return
    e.stopImmediatePropagation()
  }, true)
  document.addEventListener('htmx:after:swap', () => { const dialog = document.querySelector('.hf-dialog[data-hf-multi]'); if (dialog) syncMulti(dialog) })

  // The value help dialog fills filter fields too (their inputs are named f.<path>)
  document.addEventListener('click', e => {
    const row = e.target.closest('.hf-vh-row')
    const target = row?.closest('[data-hf-target]')?.dataset.hfTarget
    if (!row || !target?.startsWith('f.')) return
    e.stopImmediatePropagation()
    const input = document.querySelector(`form.hf-filter-bar [name="${CSS.escape(target)}"]`)
    document.querySelectorAll('.hf-overlay[data-hf-dialog]').forEach(hfDismiss)
    if (input) { input.value = row.dataset.value; input.focus() }
  }, true)

  /** "Copy to Clipboard": the ticked rows as tab separated text, the headers first (what FE copies from a table). */
  const copySelectedRows = container => {
    const table = container.querySelector('table')
    if (!table) return
    const cells = row => [...row.children].filter(cell => !cell.classList.contains('fd-table__cell--checkbox') && !cell.classList.contains('hf-col-nav'))
    const text = cell => cell.textContent.replace(/\s+/g, ' ').trim()
    const rows = [...table.querySelectorAll('tbody tr')].filter(row => row.querySelector('.hf-checkbox:checked'))
    const lines = [table.querySelector('thead tr'), ...rows].map(row => cells(row).map(text).join('\t'))
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {})
  }

  // ---- date filter: FE's dynamic date range ----
  // One input with a calendar button; its popup lists what FE lists (single dates, ranges, weeks, months, quarters, years), and the
  // choices with a day in them open a calendar. The native date inputs of the field stay in the form (hidden) and hold the days of a
  // range (`f.<path>.ge` / `.le`); an operator (Today, This Week, Last 3 Months ...) goes to the field's operator input (`f.<path>`) as the
  // text the server understands (lib/data/date-operators.js).
  const DT = (key, fallback) => texts[key] ?? fallback
  const DATE_GROUPS = () => [
    [DT('DateSingleDates', 'Single Dates'), [['date', DT('DateDate', 'Date')], ['today', DT('DateToday', 'Today')], ['yesterday', DT('DateYesterday', 'Yesterday')], ['tomorrow', DT('DateTomorrow', 'Tomorrow')]]],
    [DT('DateRanges', 'Date Ranges'), [['range', DT('DateFromTo', 'From / To')], ['from', DT('DateFrom', 'From')], ['to', DT('DateTo', 'To')], ['year to date', DT('DateYearToDate', 'Year to Date')], ['date to year', DT('DateDateToYear', 'Date to Year')],
      ['lastx', DT('DateLastX', 'Last X Days / Weeks / Months / Quarters / Years')], ['nextx', DT('DateNextX', 'Next X Days / Weeks / Months / Quarters / Years')], ['todayxy', DT('DateTodayXY', 'Today -X / +Y Days')]]],
    [DT('DateWeeks', 'Weeks'), [['this week', DT('DateThisWeek', 'This Week')], ['last week', DT('DateLastWeek', 'Last Week')], ['next week', DT('DateNextWeek', 'Next Week')]]],
    [DT('DateMonths', 'Months'), [['month', DT('DateMonth', 'Month')], ['this month', DT('DateThisMonth', 'This Month')], ['last month', DT('DateLastMonth', 'Last Month')], ['next month', DT('DateNextMonth', 'Next Month')]]],
    [DT('DateQuarters', 'Quarters'), [['this quarter', DT('DateThisQuarter', 'This Quarter')], ['last quarter', DT('DateLastQuarter', 'Last Quarter')], ['next quarter', DT('DateNextQuarter', 'Next Quarter')],
      ['first quarter', DT('DateFirstQuarter', 'First Quarter')], ['second quarter', DT('DateSecondQuarter', 'Second Quarter')], ['third quarter', DT('DateThirdQuarter', 'Third Quarter')], ['fourth quarter', DT('DateFourthQuarter', 'Fourth Quarter')]]],
    [DT('DateYears', 'Years'), [['this year', DT('DateThisYear', 'This Year')], ['last year', DT('DateLastYear', 'Last Year')], ['next year', DT('DateNextYear', 'Next Year')]]],
    [DT('DateNoRange', 'No Date / Range'), [['not specified', DT('DateNotSpecified', 'Not Specified')]]]
  ]
  const CALENDAR_OPTIONS = new Set(['date', 'range', 'from', 'to'])
  const PANEL_OPTIONS = new Set(['lastx', 'nextx', 'todayxy', 'month'])
  const dateLang = document.documentElement.lang || navigator.language
  const isoOf = ms => new Date(ms).toISOString().slice(0, 10)
  const showDay = iso => iso ? new Intl.DateTimeFormat(dateLang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : ''
  const parseDay = text => {
    const t = text.trim()
    if (/^\d{4}-\d\d-\d\d$/.test(t)) return t
    const ms = Date.parse(`${t} UTC`)
    return Number.isNaN(ms) ? null : isoOf(ms)
  }
  const optionLabel = id => DATE_GROUPS().flatMap(([, options]) => options).find(([key]) => key === id)?.[1]
  const titleCase = text => text.replace(/\b\w/g, c => c.toUpperCase())

  function enhanceDatePicker(box) {
    if (box.dataset.hfEnhanced || box.querySelector('[type=datetime-local]')) return
    const ge = box.querySelector('input[name$=".ge"]')
    const le = box.querySelector('input[name$=".le"]')
    const operator = box.querySelector('[data-hf-date-operator]')
    if (!ge || !le || !operator) return
    box.dataset.hfEnhanced = '1'
    box.classList.add('hf-date-range--enhanced')
    const text = el('input', { type: 'text', class: 'hf-date-range__text', autocomplete: 'off', 'aria-label': ge.getAttribute('aria-label').replace(/ \(from\)$/, '') })
    const icon = el('button', { type: 'button', class: 'hf-date-range__icon', 'aria-haspopup': 'dialog', 'aria-label': DT('DateOpenPicker', 'Open Picker') }, el('i', { class: 'sap-icon--appointment-2', 'aria-hidden': 'true' }))
    box.append(text, icon)

    const show = () => {
      text.value = operator.value
        ? (optionLabel(operator.value.toLowerCase()) ?? titleCase(operator.value))
        : ge.value && le.value ? (ge.value === le.value ? showDay(ge.value) : `${showDay(ge.value)} – ${showDay(le.value)}`)
          : ge.value ? `${DT('DateFrom', 'From')} ${showDay(ge.value)}` : le.value ? `${DT('DateTo', 'To')} ${showDay(le.value)}` : ''
      operator.disabled = !operator.value // an empty operator is not sent
    }
    const commit = ({ op = '', from = '', to = '' }) => {
      operator.value = op; ge.value = from; le.value = to
      show()
      ge.dispatchEvent(new Event('change', { bubbles: true }))
    }
    // typing: an operator by its name, a day, or two days
    text.addEventListener('change', () => {
      const typed = text.value.trim()
      if (!typed) return commit({})
      const known = DATE_GROUPS().flatMap(([, options]) => options).find(([id, label]) => !CALENDAR_OPTIONS.has(id) && !PANEL_OPTIONS.has(id) && [id, label.toLowerCase()].includes(typed.toLowerCase()))
      if (known) return commit({ op: known[0] })
      const parts = typed.split(/\s[–-]\s|\.\.\./)
      const days = parts.map(parseDay)
      if (days.length === 2 && days.every(Boolean)) return commit({ from: days[0], to: days[1] })
      if (days.length === 1 && days[0]) return commit({ from: days[0], to: days[0] })
      show()
    })
    show()

    let pop = null
    const close = () => { pop?.remove(); pop = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true) }
    const outside = e => { if (pop && !pop.contains(e.target) && !box.contains(e.target)) close() }
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); text.focus() } }
    const open = () => {
      if (pop) return close()
      pop = el('div', { class: 'hf-datepop', role: 'dialog' })
      box.closest('.hf-filter').append(pop)
      document.addEventListener('mousedown', outside, true)
      document.addEventListener('keydown', onKey, true)
      list()
    }
    icon.addEventListener('click', open)
    text.addEventListener('keydown', e => { if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); open() } })

    const header = (title, back) => {
      const bar = el('div', { class: 'hf-datepop__bar' })
      if (back) bar.append(el('button', { type: 'button', class: 'hf-datepop__back', 'aria-label': DT('DateBack', 'Back') }, el('i', { class: 'sap-icon--navigation-left-arrow', 'aria-hidden': 'true' })))
      bar.append(el('span', { text: title }))
      bar.querySelector('button')?.addEventListener('click', list)
      return bar
    }
    const footer = (hint, onApply, enabled) => {
      const apply = el('button', { type: 'button', class: 'fd-button fd-button--emphasized', text: DT('DateApply', 'Apply'), disabled: !enabled })
      const cancel = el('button', { type: 'button', class: 'fd-button fd-button--transparent', text: T('Cancel') })
      apply.addEventListener('click', () => { onApply(); close() })
      cancel.addEventListener('click', close)
      return el('div', { class: 'hf-datepop__foot' }, hint ? el('div', { class: 'hf-datepop__hint', text: hint }) : null, el('div', { class: 'hf-datepop__buttons' }, apply, cancel))
    }
    const panel = (...nodes) => pop.replaceChildren(...nodes)

    function list() {
      const ul = el('ul', { class: 'hf-datepop__list', role: 'listbox' })
      for (const [group, options] of DATE_GROUPS()) {
        ul.append(el('li', { class: 'hf-datepop__group', text: group }))
        for (const [id, label] of options) {
          const item = el('li', { class: 'hf-datepop__item', role: 'option', tabindex: '0', 'data-id': id }, el('span', { text: label }))
          if (CALENDAR_OPTIONS.has(id)) item.append(el('i', { class: 'sap-icon--appointment-2', 'aria-hidden': 'true' }))
          const choose = () => CALENDAR_OPTIONS.has(id) ? calendar(id, label) : PANEL_OPTIONS.has(id) ? parameters(id, label) : (commit({ op: id }), close())
          item.addEventListener('click', choose)
          item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose() } })
          ul.append(item)
        }
      }
      panel(ul)
      ul.querySelector('.hf-datepop__item')?.focus()
    }

    function parameters(id, title) {
      const numbers = [el('input', { type: 'number', class: 'fd-input', min: '0', value: '1', 'aria-label': 'X' })]
      const body = el('div', { class: 'hf-datepop__form' })
      let unit
      if (id === 'todayxy') {
        numbers.push(el('input', { type: 'number', class: 'fd-input', min: '0', value: '1', 'aria-label': 'Y' }))
        body.append(el('label', { text: '−X' }), numbers[0], el('label', { text: '+Y' }), numbers[1])
      } else if (id === 'month') {
        unit = el('select', { class: 'fd-select', 'aria-label': title }, ...Array.from({ length: 12 }, (_, i) => el('option', { value: String(i + 1).padStart(2, '0'), text: new Intl.DateTimeFormat(dateLang, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)) })))
        unit.value = String(new Date().getMonth() + 1).padStart(2, '0')
        body.append(unit)
      } else {
        unit = el('select', { class: 'fd-select', 'aria-label': DT('DateUnit', 'Unit') }, ...[['day', 'Days'], ['week', 'Weeks'], ['month', 'Months'], ['quarter', 'Quarters'], ['year', 'Years']].map(([value, key]) => el('option', { value, text: DT(`Date${key}`, key) })))
        body.append(numbers[0], unit)
      }
      panel(header(title, true), body, footer('', () => {
        const [x, y] = numbers.map(n => Math.max(0, parseInt(n.value, 10) || 0))
        if (id === 'todayxy') return commit({ op: `today -${x}/+${y} days` })
        if (id === 'month') return commit({ op: `month ${new Date().getFullYear()}-${unit.value}` })
        commit({ op: `${id === 'lastx' ? 'last' : 'next'} ${x} ${unit.value}s` })
      }, true))
    }

    function calendar(id, title) {
      const selected = id === 'range' ? [ge.value || null, le.value || null] : [id === 'to' ? le.value || null : ge.value || null, null]
      const start = selected[0] ? new Date(`${selected[0]}T00:00:00Z`) : new Date()
      let year = start.getUTCFullYear()
      let month = start.getUTCMonth()
      const [from0] = selected
      const pick = { from: from0, to: id === 'range' ? selected[1] : null }
      const info = new Intl.Locale(dateLang).weekInfo ?? new Intl.Locale(dateLang).getWeekInfo?.()
      const firstDay = (info?.firstDay ?? 7) % 7
      const body = el('div', { class: 'hf-datepop__cal' })
      const complete = () => id === 'range' ? !!(pick.from && pick.to) : !!pick.from
      const isoWeek = ms => { const d = new Date(ms); const day = (d.getUTCDay() + 6) % 7; const thursday = ms + (3 - day) * 86400000; const y = new Date(thursday).getUTCFullYear(); return Math.floor((thursday - Date.UTC(y, 0, 1)) / 86400000 / 7) + 1 }
      let mode = 'days'
      const monthNames = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(dateLang, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)))
      const drawChoice = () => { // the month or the year to go to
        const head = el('div', { class: 'hf-datepop__month' }, el('button', { type: 'button', 'data-page': '-1', 'aria-label': DT('DatePrevious', 'Previous') }, el('i', { class: 'sap-icon--navigation-left-arrow', 'aria-hidden': 'true' })),
          el('span', { class: 'hf-datepop__name', text: mode === 'months' ? String(year) : `${Math.floor(year / 20) * 20} – ${Math.floor(year / 20) * 20 + 19}` }),
          el('button', { type: 'button', 'data-page': '1', 'aria-label': DT('DateNext', 'Next') }, el('i', { class: 'sap-icon--navigation-right-arrow', 'aria-hidden': 'true' })))
        const base = Math.floor(year / 20) * 20
        const cells = mode === 'months' ? monthNames.map((name, i) => [i, name, i === month]) : Array.from({ length: 20 }, (_, i) => [base + i, String(base + i), base + i === year])
        const grid = el('div', { class: 'hf-datepop__choices' }, ...cells.map(([value, label, current]) => el('button', { type: 'button', 'data-value': String(value), class: current ? 'is-selected' : '', text: label })))
        const onClick = e => {
          const page = e.target.closest('[data-page]')?.dataset.page
          if (page) { year += Number(page) * (mode === 'months' ? 1 : 20); return drawChoice() }
          const value = e.target.closest('[data-value]')?.dataset.value
          if (value == null) return
          if (mode === 'months') month = Number(value); else year = Number(value)
          mode = 'days'; draw()
        }
        head.addEventListener('click', onClick); grid.addEventListener('click', onClick)
        body.replaceChildren(head, grid)
      }
      const draw = () => {
        if (mode !== 'days') return drawChoice()
        const head = el('div', { class: 'hf-datepop__month' },
          el('button', { type: 'button', 'aria-label': DT('DatePrevious', 'Previous'), 'data-step': '-1' }, el('i', { class: 'sap-icon--navigation-left-arrow', 'aria-hidden': 'true' })),
          el('button', { type: 'button', class: 'hf-datepop__name', 'data-mode': 'months', text: monthNames[month] }),
          el('button', { type: 'button', class: 'hf-datepop__name', 'data-mode': 'years', text: String(year) }),
          el('button', { type: 'button', 'aria-label': DT('DateNext', 'Next'), 'data-step': '1' }, el('i', { class: 'sap-icon--navigation-right-arrow', 'aria-hidden': 'true' })))
        head.addEventListener('click', e => { const next = e.target.closest('[data-mode]')?.dataset.mode; if (next) { mode = next; return draw() } const step = e.target.closest('[data-step]')?.dataset.step; if (step) { const d = new Date(Date.UTC(year, month + Number(step), 1)); year = d.getUTCFullYear(); month = d.getUTCMonth(); draw() } })
        const grid = el('table', { class: 'hf-datepop__grid', role: 'grid' })
        const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(dateLang, { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1 + ((firstDay + i) % 7))))
        grid.append(el('thead', {}, el('tr', {}, el('th', { text: '' }), ...weekdays.map(day => el('th', { text: day })))))
        const tbody = el('tbody')
        const first = Date.UTC(year, month, 1)
        let cursor = first - ((new Date(first).getUTCDay() - firstDay + 7) % 7) * 86400000
        const today = isoOf(Date.now())
        for (let week = 0; week < 6; week++) {
          const row = el('tr', {}, el('th', { class: 'hf-datepop__week', text: String(isoWeek(cursor + 3 * 86400000)) }))
          for (let day = 0; day < 7; day++, cursor += 86400000) {
            const iso = isoOf(cursor)
            const inRange = pick.from && pick.to && iso > pick.from && iso < pick.to
            const edge = iso === pick.from || iso === pick.to
            row.append(el('td', {}, el('button', { type: 'button', 'data-day': iso, class: `hf-datepop__day${new Date(cursor).getUTCMonth() !== month ? ' is-other' : ''}${edge ? ' is-selected' : ''}${inRange ? ' is-between' : ''}${iso === today ? ' is-today' : ''}`, text: String(new Date(cursor).getUTCDate()) })))
          }
          tbody.append(row)
        }
        grid.append(tbody)
        grid.addEventListener('click', e => {
          const iso = e.target.closest('[data-day]')?.dataset.day
          if (!iso) return
          if (id !== 'range') { pick.from = iso; pick.to = null }
          else if (!pick.from || pick.to) { pick.from = iso; pick.to = null }
          else if (iso < pick.from) { pick.to = pick.from; pick.from = iso }
          else pick.to = iso
          draw()
        })
        body.replaceChildren(head, grid)
        const apply = pop.querySelector('.hf-datepop__foot .fd-button--emphasized')
        if (apply) apply.disabled = !complete()
      }
      panel(header(title, true), body, footer(id === 'range' ? DT('DateChooseDates', 'Choose Dates') : '', () => {
        if (id === 'range') commit({ from: pick.from, to: pick.to })
        else if (id === 'date') commit({ from: pick.from, to: pick.from })
        else if (id === 'from') commit({ from: pick.from })
        else commit({ to: pick.from })
      }, complete()))
      draw()
    }
  }
  const enhanceDatePickers = () => document.querySelectorAll('.hf-date-range[data-hf-picker=range]').forEach(enhanceDatePicker)

  // ---- column widths ----
  // Fiori elements gives every column the width `sap.m.table.Util.calcColumnWidth` works out from the property type and the
  // header, by measuring sample text in a canvas. The server says what to measure (`data-hf-width`, lib/render/column-width.js);
  // this is the same calculation, so a column is as wide here as in the Fiori elements app.
  const columnWidth = (() => {
    const canvas = document.createElement('canvas').getContext('2d')
    const BASE = 16
    const measure = (text, font) => { canvas.font = font; return canvas.measureText(text || '').width / BASE + 0.05 }
    const NUMERIC = { Byte: 3, SByte: 3, Int16: 5, Int32: 9, Int64: 12, Single: 6, Float: 12, Double: 13, Decimal: 15 }
    const lang = document.documentElement.lang || navigator.language
    const sampleDate = new Date(2023, 9, 26, 22, 47, 58, 999)
    const format = (options, value = sampleDate) => new Intl.DateTimeFormat(lang, options).format(value)

    const typeWidth = (type, font, { maxWidth, defaultWidth }) => {
      const cap = width => Math.min(width, maxWidth)
      if (type.t === 'Boolean') return cap(Math.max(measure(T('Yes'), font), measure(T('No'), font)))
      if (type.t === 'String') {
        const max = type.m || 0
        if (!max || max * 0.25 > maxWidth) return maxWidth
        const sample = measure('A'.repeat(max), font)
        if (max < maxWidth || maxWidth < 10) return cap(sample)
        const width = Math.log(sample - maxWidth * 0.16) / Math.log(maxWidth / 3) * (maxWidth / 2) * Math.pow(maxWidth / 19, 1 / sample)
        return cap(Math.min(width, sample))
      }
      if (type.t === 'Date') return cap(measure(`${format({ dateStyle: 'medium' })}-`, font))
      if (type.t === 'DateTimeOffset') return cap(measure(`${format({ dateStyle: 'medium', timeStyle: 'medium' })}-`, font))
      if (type.t === 'TimeOfDay') return cap(measure(format({ timeStyle: 'medium' }), font))
      if (NUMERIC[type.t]) {
        const scale = type.s || 0
        const precision = Math.min(type.p || 20, NUMERIC[type.t])
        const sample = new Intl.NumberFormat(lang, { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(2 * Math.pow(10, precision - scale - 1))
        return cap(measure(sample, font))
      }
      return defaultWidth
    }

    const headerWidth = (header, contentWidth, maxWidth, minWidth, font) => {
      if (contentWidth > maxWidth) return maxWidth
      if (minWidth > header.length) return minWidth
      if (!contentWidth) return measure(header, font)
      const original = Math.min(measure(header, font), maxWidth * 0.7)
      contentWidth = Math.max(contentWidth, minWidth)
      const ratio = Math.max(1, 1 - (Math.log(Math.max(contentWidth - 1.7, 0.2)) / Math.log(maxWidth * 0.5)) + 1)
      const max = ratio * contentWidth
      const diff = Math.max(0, original - max)
      return diff < 0.15 ? original : max + diff * (1 - 1 / contentWidth) / Math.E
    }

    /** The width in rem of the column a `data-hf-width` spec describes, `bodyFont`/`headFont` being the fonts its cells and header use. */
    return (spec, bodyFont, headFont) => {
      const minWidth = 2, maxWidth = 19, padding = 1.0625
      const gap = spec.crit ? 1 : 0 // the cell's icon; the amount and its currency are two measured types, no extra gap (FE's unit gap is for a separate unit column)
      const content = gap + spec.types.reduce((inner, type) => inner + typeWidth(type, bodyFont, { maxWidth, defaultWidth: 8 }) + (inner && 0.5), 0)
      const header = spec.l ? headerWidth(spec.l, content, maxWidth, minWidth, headFont) : 0
      return Math.ceil(Math.min(Math.max(minWidth, content, header), maxWidth) * 100) / 100 + padding
    }
  })()

  const applyColumnWidths = () => {
    document.querySelectorAll('table.hf-table, table.hf-vh__table').forEach(table => {
      const heads = [...table.querySelectorAll('thead th')]
      if (!heads.some(th => th.dataset.hfWidth)) return
      const body = table.querySelector('tbody td')
      const bodyFont = getComputedStyle(body || heads[0]).font
      let total = 0 // what the sized columns add up to, for a table that is not full width
      for (const th of heads) {
        let rem
        try { rem = th.dataset.hfWidth ? columnWidth(JSON.parse(th.dataset.hfWidth), bodyFont, getComputedStyle(th).font) : undefined } catch { rem = undefined }
        if (rem) { // FE's column border sits outside the calculated width, and so does the padding a first column has beyond the cell padding
          const extra = th.previousElementSibling ? 0 : Math.max(0, parseFloat(getComputedStyle(th).paddingLeft) - 8)
          th.style.width = `calc(${rem}rem + ${1 + extra}px)`
          total += rem * 16 + 1 + extra
        } else total += th.getBoundingClientRect().width
      }
      if (table.classList.contains('hf-vh__table')) table.style.width = `${Math.ceil(total)}px`
      table.classList.add('hf-table--sized')
    })
  }
  document.fonts?.ready.then(applyColumnWidths)

  const applyAll = () => {
    applyColumnWidths()
    enhanceDatePickers()
    applyViews()
    applyFilters()
    document.querySelectorAll('#hf-variants').forEach(renderVariants)
  }
  document.addEventListener('DOMContentLoaded', applyAll)
  document.addEventListener('hf:ready', applyAll)
  // A table body swap (sort, Go, More) brings new cells that need the saved column settings again
  document.addEventListener('htmx:after:swap', applyAll)
})()
