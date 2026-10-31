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
      try { ui5.ShellUIService = await this.getService('ShellUIService') } catch (err) { /* not in a launchpad */ }
      try { ui5.Navigation = await sap.ushell.Container.getServiceAsync('Navigation') } catch (err) { /* not in a launchpad */ }
      const startup = this.getComponentData()?.startupParameters || {}
      this._shell = await window.HtmxShell.start({
        root,
        base,
        app: `${id}@${version}`,
        appTitle: this.getManifestEntry('/sap.app/title'), // the i18n-resolved title of the app's tile
        service: htmx.service,
        entry: (startup.route && startup.route[0]) || htmx.entry,
        language: Localization.getLanguageTag().toString(),
        adapter: window.HtmxShellAdapters.flp(ui5)
      })
    },

    exit() {
      this._shell?.destroy()
    }
  })
})
