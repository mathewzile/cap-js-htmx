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
    const current = () => table.querySelector('thead th[aria-sort]')
    const dialog = openDialog({
      title: T('ViewSettings'),
      tabs,
      reset: { label: T('Reset'), action() {
        for (const { row, box } of items) { box.checked = true; row.classList.add('is-selected') }
        refresh()
        if (sortSelect) sortSelect.value = ''
      } },
      buttons: [
        { label: T('OK'), action() {
          const off = items.filter(i => !i.box.checked).map(i => Number(i.box.dataset.col))
          if (off.length) store.set('view:' + container.dataset.hfView, { hidden: off }); else store.remove('view:' + container.dataset.hfView)
          applyView(container)
          if (!sortSelect || !sortSelect.value) return
          const same = sortSelect.value === (current()?.dataset.hfSort ?? '') && direction === (current()?.getAttribute('aria-sort') === 'descending' ? 'desc' : 'asc')
          if (!same) sortList(lr, `${sortSelect.value}${direction === 'desc' ? ' desc' : ''}`)
        } },
        { label: T('Cancel') }
      ]
    })
    if (hidden.size) dialog.markChanged() // something differs from the defaults, so "Reset" is useful
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
    const items = filterItems(lr).map(item => checkRow(item.dataset.hfLabel, !hidden.has(item.dataset.hfFilter), { 'data-path': item.dataset.hfFilter }))
    const dialog = openDialog({
      title: T('AdaptFilters'),
      body: el('div', { class: 'hf-dialog__panel' },
        el('h3', { class: 'hf-dialog__subheader', text: T('FilterValuesAndVisibility') }),
        el('ul', { class: 'hf-dialog__list' }, items.map(i => i.row))),
      reset: { label: T('Reset'), action() { for (const { row, box } of items) { box.checked = true; row.classList.add('is-selected') } } },
      buttons: [
        { label: T('OK'), action() {
          const off = items.filter(i => !i.box.checked).map(i => i.box.dataset.path)
          if (off.length) store.set(filtersKey(set), off); else store.remove(filtersKey(set))
          applyFilters()
        } },
        { label: T('Cancel') }
      ]
    })
    if (hidden.size) dialog.markChanged()
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
  const OPERATORS = [['eq', 'EqualTo'], ['ne', 'NotEqualTo'], ['co', 'Contains'], ['sw', 'StartsWith'], ['ew', 'EndsWith']]
  function parseConditions(text) {
    return text.split(';').filter(Boolean).map(token => {
      if (token.startsWith('!')) return { op: 'ne', value: token.slice(1) }
      const starts = token.startsWith('*'), ends = token.length > 1 && token.endsWith('*')
      const value = token.replace(/^\*/, '').replace(/\*$/, '')
      return { op: starts && ends ? 'co' : ends ? 'sw' : starts ? 'ew' : 'eq', value }
    })
  }
  const formatCondition = ({ op, value }) => ({ eq: value, ne: `!${value}`, co: `*${value}*`, sw: `${value}*`, ew: `*${value}` })[op]

  function openConditions(button) {
    const filter = button.closest('[data-hf-filter]')
    const input = filter.querySelector('input')
    const rows = el('div', { class: 'hf-conditions' })
    const summary = el('div', { class: 'hf-conditions__summary' })
    const sync = () => {
      const entered = [...rows.children].map(r => ({ op: r.querySelector('select').value, value: r.querySelector('input').value.trim() })).filter(c => c.value)
      summary.textContent = entered.length ? entered.map(formatCondition).join('; ') : ''
      return entered
    }
    const addRow = (condition = { op: 'eq', value: '' }) => {
      const select = el('select', { class: 'fd-select' }, OPERATORS.map(([op, key]) => el('option', { value: op, text: T(key), selected: op === condition.op })))
      const value = el('input', { type: 'text', class: 'fd-input', placeholder: T('Value'), value: condition.value })
      const remove = el('button', { type: 'button', class: 'fd-button fd-button--compact fd-button--transparent', 'aria-label': T('Delete') }, el('i', { class: 'sap-icon--decline', 'aria-hidden': 'true' }))
      const row = el('div', { class: 'hf-conditions__row' }, select, value, remove)
      remove.addEventListener('click', () => { row.remove(); if (!rows.children.length) addRow(); sync() })
      row.addEventListener('input', sync)
      rows.append(row)
    }
    const existing = parseConditions(input.value)
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

  // ---------------------------------------------------------------- wiring
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-hf-action]')
    if (!button) return
    const container = button.closest('[data-hf-view]')
    switch (button.dataset.hfAction) {
      case 'conditions': openConditions(button); break
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
