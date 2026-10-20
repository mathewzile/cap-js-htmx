const path = require('path')
const express = require('express')

function distDirOf(name, sampleFile) {
  return path.dirname(require.resolve(`${name}/${sampleFile}`))
}

const mountPath = '/htmx/-'
const router = express.Router()

router.use('/htmx.org', express.static(distDirOf('htmx.org', 'dist/htmx.min.js')))
router.use('/fundamental-styles', express.static(distDirOf('fundamental-styles', 'dist/fundamental-styles.css')))
router.use('/common-css', express.static(distDirOf('@fundamental-styles/common-css', 'dist/common-css.css')))
router.use('/theming-base-content', express.static(path.dirname(require.resolve('@sap-theming/theming-base-content/package.json'))))
router.use('/public', express.static(path.join(__dirname, '..', 'public')))

module.exports = { mountPath, router, distDirOf }
