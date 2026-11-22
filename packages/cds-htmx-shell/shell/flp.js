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
      // `params` are the page's values for the target (they become the query of its URL, the startup parameters of its component)
      async navigate({ semanticObject, action, params }) {
        if (!ui5.Navigation) throw new Error('No launchpad Navigation service')
        const appStateKey = await this.saveState(params)
        await ui5.Navigation.navigate({ target: { semanticObject, action }, params: params && Object.keys(params).length ? params : undefined, appStateKey })
      },
      // as Fiori elements does, the context also goes in an app state (`sap-xapp-state`): a SelectionVariant with one single value per
      // parameter. A target that reads the state (FE does) finds the same values as in the URL. `undefined` when it cannot be saved.
      async saveState(params) {
        const names = Object.keys(params || {}).filter(name => !name.includes('.')) // the path-prefixed copies stay URL-only
        if (!names.length) return undefined
        try {
          const AppState = await sap.ushell.Container.getServiceAsync('AppState')
          const state = AppState.createEmptyAppState(ui5.component)
          const selectionVariant = {
            Version: { Major: '1', Minor: '0', Patch: '0' }, SelectionVariantID: '', Text: '', ODataFilterExpression: '', Parameters: [],
            SelectOptions: names.map(name => ({ PropertyName: name, Ranges: [{ Sign: 'I', Option: 'EQ', Low: String(params[name]), High: null }] }))
          }
          state.setData({ selectionVariant: JSON.stringify(selectionVariant) })
          await state.save()
          return state.getKey()
        } catch { return undefined }
      },
      // whether the launchpad has a target for each of `[{ semanticObject, action }]` the user may use: `[boolean]`, all true when it cannot say
      async isSupported(targets) {
        if (!ui5.Navigation?.isNavigationSupported) return targets.map(() => true)
        const answer = await ui5.Navigation.isNavigationSupported(targets.map(({ semanticObject, action }) => ({ target: { semanticObject, action } })))
        return targets.map((_, i) => typeof answer?.[i] === 'boolean' ? answer[i] : answer?.[i]?.supported !== false)
      },
      // the targets the launchpad has for a semantic object, for the popover of a `Common.SemanticObject` property: [{ intent, text }]
      async getLinks({ semanticObject, params }) {
        if (!ui5.Navigation?.getLinks) return []
        // UI5's Navigation.getLinks takes a list of filters and answers with one list of links per filter
        const answer = await ui5.Navigation.getLinks([{ semanticObject, params }])
        const links = Array.isArray(answer?.[0]) ? answer[0] : answer
        // as Fiori elements does: the app that is open is not offered as a target of itself
        const here = (location.hash.match(/^#([^?&]+)/) || [])[1]
        return (links || []).filter(link => !here || !String(link.intent).startsWith(`#${here}`)).map(link => ({ intent: link.intent, text: link.text }))
      },
      // follows a link of `getLinks` (its intent is a shell hash)
      async navigateTo(intent) { await ui5.Navigation.navigate({ target: { shellHash: intent } }) },
      setTitle(title) { ui5.ShellUIService?.setTitle?.(title) }
    }
  }
})(window)
