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
    const close = () => overlay.remove()
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
    const box = el('input', { type: 'checkbox', checked, ...attrs })
    const row = el('li', { class: `hf-dialog__row${checked ? ' is-selected' : ''}` }, el('label', { class: 'hf-dialog__row-label' }, box, el('span', { class: 'hf-dialog__row-text', text })))
    box.addEventListener('change', () => row.classList.toggle('is-selected', box.checked))
    return { row, box }
  }

  // ---------------------------------------------------------------- column visibility (view settings)
  const colIndex = cell => { const m = /(?:^|\s)hf-col-(\d+)(?:\s|$)/.exec(cell.className); return m ? Number(m[1]) : null }
  const tableOf = container => container.querySelector('table.hf-table')
  const hiddenCols = container => store.get('view:' + container.dataset.hfView)?.hidden ?? []

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
    const items = headers.map(th => checkRow(th.querySelector('.hf-th__text')?.textContent.trim() || '', !hidden.has(colIndex(th)), { 'data-col': colIndex(th) }))

    // Columns tab: search, "Hide (All) Unselected", the master row "Columns (shown/all)" and one row per column
    const search = el('input', { type: 'search', class: 'fd-input', placeholder: T('Search'), 'aria-label': T('Search') })
    const hideUnselected = el('input', { type: 'checkbox', class: 'hf-switch', role: 'switch' })
    const master = el('input', { type: 'checkbox' })
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
        for (const { row, box } of items) { box.checked = true; row.classList.add('is-selected') }
        refresh()
        if (sortSelect) sortSelect.value = ''
        if (groupSelect) groupSelect.value = ''
      } },
      buttons: [
        { label: T('OK'), action() {
          const off = items.filter(i => !i.box.checked).map(i => Number(i.box.dataset.col))
          const groupIndex = groupSelect && groupSelect.value !== '' ? Number(groupSelect.value) : null
          const state = {}
          if (off.length) state.hidden = off
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
    if (hidden.size || group != null) dialog.markChanged() // something differs from the defaults, so "Reset" is useful
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
    const hidden = new Set(store.get(filtersKey(set)) ?? [])
    const items = filterItems(lr).map(item => checkRow(item.dataset.hfLabel, !hidden.has(item.dataset.hfFilter), { 'data-path': item.dataset.hfFilter, 'data-extra': item.classList.contains('hf-filter--extra') ? '1' : '' }))
    const list = el('ul', { class: 'hf-dialog__list' }, items.map(i => i.row))

    // "Add Filter": any other property of the entity
    const present = () => new Set(items.map(i => i.box.dataset.path))
    const addSelect = el('select', { class: 'fd-select', 'aria-label': T('AddFilter') })
    const fillAdd = () => {
      addSelect.replaceChildren(el('option', { value: '', text: T('AddFilter') }),
        ...availableFilters(lr).filter(f => !present().has(f.path)).map(f => el('option', { value: f.path, text: f.label })))
    }
    fillAdd()
    addSelect.addEventListener('change', () => {
      const f = availableFilters(lr).find(x => x.path === addSelect.value)
      if (!f) return
      const added = checkRow(f.label, true, { 'data-path': f.path, 'data-extra': '1' })
      items.push(added)
      list.append(added.row)
      fillAdd()
    })

    const dialog = openDialog({
      title: T('AdaptFilters'),
      body: el('div', { class: 'hf-dialog__panel' },
        el('h3', { class: 'hf-dialog__subheader', text: T('FilterValuesAndVisibility') }),
        list,
        el('div', { class: 'hf-dialog__bar hf-dialog__bar--add' }, addSelect)),
      reset: { label: T('Reset'), action() {
        for (const i of [...items]) {
          if (i.box.dataset.extra) { i.row.remove(); items.splice(items.indexOf(i), 1) } else { i.box.checked = true; i.row.classList.add('is-selected') }
        }
        fillAdd()
      } },
      buttons: [
        { label: T('OK'), action() {
          const off = items.filter(i => !i.box.checked && !i.box.dataset.extra).map(i => i.box.dataset.path)
          if (off.length) store.set(filtersKey(set), off); else store.remove(filtersKey(set))
          const extras = items.filter(i => i.box.dataset.extra && i.box.checked).map(i => i.box.dataset.path)
          if (extras.length) store.set(extrasKey(set), extras); else store.remove(extrasKey(set))
          applyFilters()
        } },
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
      group: groupOf(lr.querySelector('[data-hf-view]'))
    }
  }

  function applyViewState(lr, state) {
    const form = lr.querySelector('form.hf-filter-bar')
    const container = lr.querySelector('[data-hf-view]')
    store.set(filtersKey(lr.dataset.hfSet), state?.hiddenFilters ?? [])
    store.set(extrasKey(lr.dataset.hfSet), state?.extraFilters ?? [])
    store.set('view:' + container.dataset.hfView, { hidden: state?.hiddenCols ?? [], ...(state?.group != null ? { group: state.group } : {}) })
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
    const saveAs = el('li', { class: 'hf-variant hf-variant--save' }, el('button', { type: 'button', class: 'hf-popover__item', text: T('SaveAs') + '…' }))
    saveAs.querySelector('button').addEventListener('click', () => {
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
    list.append(saveAs)
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

  // ---------------------------------------------------------------- rows of a composition in a non-draft Object Page
  // Rows are added/removed in the page only; the object's Save posts what is there and the server replaces the composition.
  const renumber = section => {
    const count = section.querySelectorAll('tbody tr[data-hf-row]').length
    const title = section.querySelector('.hf-section__title')
    if (title) title.textContent = title.textContent.replace(/\(\d+\)\s*$/, `(${count})`)
  }
  document.addEventListener('click', e => {
    const add = e.target.closest('[data-hf-action=row-add]')
    const remove = e.target.closest('[data-hf-action=row-remove]')
    if (!add && !remove) return
    const section = (add || remove).closest('.hf-section--table')
    const body = section.querySelector('tbody')
    if (add) {
      const template = section.querySelector('template[data-hf-row-template]')
      body.querySelector('.hf-table__nodata')?.remove()
      const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
      const row = template.content.firstElementChild.cloneNode(true)
      for (const input of row.querySelectorAll('[name]')) input.name = input.name.replace('~__i__.', `~${id}.`)
      body.prepend(row)
      row.querySelector('input:not([type=hidden]):not([type=checkbox])')?.focus()
    } else {
      body.querySelectorAll('tr[data-hf-row] .hf-checkbox:checked').forEach(box => box.closest('tr').remove())
      section.querySelectorAll('thead .hf-checkbox').forEach(box => { box.checked = false })
    }
    renumber(section)
    remove?.setAttribute('disabled', '')
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
      case 'export': exportList(button); break
      case 'export-dom': exportSection(button); break
      case 'export-section': exportSectionServer(button, container); break
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
  document.addEventListener('hf:ready', applyAll)
  // A table body swap (sort, Go, More) brings new cells that need the saved column settings again
  document.addEventListener('htmx:after:swap', applyAll)
})()
