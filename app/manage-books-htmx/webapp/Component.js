sap.ui.define(['cds/htmx/shell/Component'], function (ShellComponent) {
  'use strict'

  // Everything the app does is in the shell component and in the backend; this file only names the app.
  return ShellComponent.extend('managebooks.htmx.Component', {
    metadata: { manifest: 'json' }
  })
})
