/* Base component of a cds-htmx app in the launchpad. The app's own Component.js only extends it:
 *
 *   sap.ui.define(['cds/htmx/shell/Component'], Base => Base.extend('managebooks.htmx.Component', { metadata: { manifest: 'json' } }))
 *
 * and declares in its manifest `sap.ui5.resourceRoots["cds.htmx.shell"] = "./shell"` and its endpoints in `sap.htmx`:
 *   { "service": "/htmx/catalog", "entry": "/htmx/catalog/Books" }
 * The component renders one container, loads the shell scripts next to it and starts the app. */
sap.ui.define([
  'sap/ui/core/UIComponent',
  'sap/ui/core/HTML',
  'sap/ui/dom/includeScript',
  'sap/ui/core/routing/HashChanger',
  'sap/ui/core/Theming',
  'sap/ui/core/ControlBehavior',
  'sap/base/i18n/Localization'
], function (UIComponent, HTML, includeScript, HashChanger, Theming, ControlBehavior, Localization) {
  'use strict'

  return UIComponent.extend('cds.htmx.shell.Component', {
    // like sap.fe.core.AppComponent: the launchpad gives the app the whole width instead of a centered 1280px
    metadata: { config: { fullWidth: true } },

    createContent() {
      return new HTML({ content: '<div class="htmx-fiori hf-root"></div>', afterRendering: () => this._start() })
    },

    async _start() {
      if (this._started) return
      this._started = true
      const manifest = this.getManifestObject()
      const id = manifest.getEntry('/sap.app/id')
      const version = manifest.getEntry('/sap.app/applicationVersion/version')
      const htmx = manifest.getEntry('/sap.htmx') || {}
      // the URL the launchpad serves this app's files from; the approuter's xs-app.json routes /htmx/** below it
      const base = sap.ui.require.toUrl(id.replace(/\./g, '/')).replace(/\/$/, '')
      const root = this.getRootControl().getDomRef()

      // once per page: a second app in the launchpad finds the shell of the first one (loading it again would reset its state)
      if (!window.HtmxShell) {
        for (const file of ['hx-csrf.js', 'standalone.js', 'flp.js', 'shell.js']) {
          await includeScript({ url: sap.ui.require.toUrl('cds/htmx/shell/' + file) })
        }
      }
      const ui5 = { HashChanger, Theming, ControlBehavior }
      try { ui5.ShellUIService = await this.getService('ShellUIService') } catch { /* not in a launchpad */ }
      try { ui5.Navigation = await sap.ushell.Container.getServiceAsync('Navigation') } catch { /* not in a launchpad */ }
      ui5.component = this // the app state of a navigation lives as long as this component
      const direct = this.getComponentData()?.startupParameters || {}
      // `sap-xapp-state`: the app state another app (FE sends one with every navigation) saved for this one, a SelectionVariant; its
      // single values are parameters like the ones of the URL, which win when both name the same
      // (the launchpad hands the key over in the component data itself, not among the startup parameters)
      const startup = { ...await this._stateParameters(this.getComponentData()?.['sap-xapp-state']?.[0] ?? direct['sap-xapp-state']?.[0]), ...direct }
      this._shell = await window.HtmxShell.start({
        root,
        base,
        app: `${id}@${version}`,
        appTitle: this.getManifestEntry('/sap.app/title'), // the i18n-resolved title of the app's tile
        service: htmx.service,
        entry: (startup.route && startup.route[0]) || htmx.entry,
        // what another app passed through an intent (the target side of an intent-based navigation): the launchpad's own `sap-*`
        // parameters and the `route` above are not data of the app
        startup: Object.fromEntries(Object.entries(startup).filter(([name]) => name !== 'route' && !name.startsWith('sap-'))),
        language: Localization.getLanguageTag().toString(),
        adapter: window.HtmxShellAdapters.flp(ui5)
      })
    },

    /** `{ name: [value] }` for the single `EQ` values of the SelectionVariant in the app state `key`; `{}` without one or when it cannot be read. */
    async _stateParameters(key) {
      if (!key) return {}
      try {
        const AppState = await sap.ushell.Container.getServiceAsync('AppState')
        const data = (await AppState.getAppState(key)).getData()
        const variant = typeof data?.selectionVariant === 'string' ? JSON.parse(data.selectionVariant) : data?.selectionVariant
        const found = {}
        for (const option of variant?.SelectOptions || []) {
          const equal = (option.Ranges || []).filter(range => range.Sign === 'I' && range.Option === 'EQ')
          if (equal.length === 1 && equal[0].Low != null) found[option.PropertyName] = [String(equal[0].Low)]
        }
        for (const parameter of variant?.Parameters || []) if (parameter.PropertyValue != null) found[parameter.PropertyName] = [String(parameter.PropertyValue)]
        return found
      } catch { return {} }
    },

    exit() {
      this._shell?.destroy()
    }
  })
})
