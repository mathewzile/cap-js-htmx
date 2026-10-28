/* Launchpad adapter (SAP Build Work Zone / Fiori launchpad): the route is the inner-app hash (`#Books-manageHtmx&/Books(..)`, nothing after the intent for the entry page)
 * kept by UI5's HashChanger, the theme follows the launchpad's and the page title goes to the shell bar through ShellUIService. The launchpad is
 * never told about unsaved changes: a draft is saved on the server as it is edited, so leaving it loses nothing (and would only prompt).
 *
 * `ui5` carries the UI5 modules the component loaded: { HashChanger, Theming, ControlBehavior, ShellUIService, Navigation }. */
;(function (global) {
  'use strict'

  const strip = route => route.replace(/^\//, '')

  global.HtmxShellAdapters = global.HtmxShellAdapters || {}
  global.HtmxShellAdapters.flp = function flp(ui5) {
    const hashChanger = ui5.HashChanger.getInstance()
    return {
      name: 'flp',
      attach({ onRoute }) { this.listener = e => onRoute(e.getParameter('newHash') ? '/' + strip(e.getParameter('newHash')) : null); hashChanger.attachEvent('hashChanged', this.listener) },
      detach() { hashChanger.detachEvent('hashChanged', this.listener) },
      current() { return hashChanger.getHash() ? '/' + strip(hashChanger.getHash()) : null },
      push(route) { hashChanger.setHash(strip(route)) },
      replace(route) { hashChanger.replaceHash(strip(route)) },
      theme() { return ui5.Theming.getTheme() },
      onTheme(callback) { ui5.Theming.attachApplied(() => callback(ui5.Theming.getTheme())) },
      // UI5's animation mode (`full`, `basic`, `minimal`, `none`): the launchpad's setting for how much the page moves
      animationMode() { return ui5.ControlBehavior?.getAnimationMode?.() ?? null },
      onAnimationMode(callback) { ui5.ControlBehavior?.attachChange?.(() => callback(ui5.ControlBehavior.getAnimationMode())) },
      // intent-based navigation through the launchpad's Navigation service, which is missing when the component runs outside a launchpad
      async navigate({ semanticObject, action }) {
        if (!ui5.Navigation) throw new Error('No launchpad Navigation service')
        await ui5.Navigation.navigate({ target: { semanticObject, action } })
      },
      setTitle(title) { ui5.ShellUIService?.setTitle?.(title) }
    }
  }
})(window)
