/* Launchpad adapter (SAP Build Work Zone / Fiori launchpad): the route is the inner-app hash (`#Books-manageHtmx&/htmx/catalog/Books(..)`)
 * kept by UI5's HashChanger, the theme follows the launchpad's, the page title goes to the shell bar through ShellUIService and
 * the launchpad is told while a draft is being edited (its "unsaved changes" prompt).
 *
 * `ui5` carries the UI5 modules the component loaded: { HashChanger, Theming, ShellUIService }. */
;(function (global) {
  'use strict'

  const strip = route => route.replace(/^\//, '')

  global.HtmxShellAdapters = global.HtmxShellAdapters || {}
  global.HtmxShellAdapters.flp = function flp(ui5) {
    const hashChanger = ui5.HashChanger.getInstance()
    return {
      name: 'flp',
      attach({ onRoute }) { hashChanger.attachEvent('hashChanged', e => onRoute(e.getParameter('newHash') ? '/' + strip(e.getParameter('newHash')) : null)) },
      current() { return hashChanger.getHash() ? '/' + strip(hashChanger.getHash()) : null },
      push(route) { hashChanger.setHash(strip(route)) },
      replace(route) { hashChanger.replaceHash(strip(route)) },
      theme() { return ui5.Theming.getTheme() },
      onTheme(callback) { ui5.Theming.attachApplied(() => callback(ui5.Theming.getTheme())) },
      setTitle(title) { ui5.ShellUIService?.setTitle?.(title) },
      setDirty(dirty) { global.sap?.ushell?.Container?.setDirtyFlag?.(!!dirty) }
    }
  }
})(window)
