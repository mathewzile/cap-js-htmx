const assert = require('node:assert/strict')
const { test } = require('node:test')
const channels = require('../../lib/sse/channels')

const alice = { id: 'alice' }
const bob = { id: 'bob' }
const channel = (res, user = alice) => ({ res, user, locale: 'en', app: null, view: null })

test('a closing old connection does not remove the channel that replaced it', () => {
  const oldRes = {}, newRes = {}
  channels.add('c1', channel(oldRes))
  channels.add('c1', channel(newRes)) // a reconnect with the same client id
  channels.remove('c1', oldRes)
  assert.equal(channels.get('c1')?.res, newRes)
  channels.remove('c1', newRes)
  assert.equal(channels.get('c1'), undefined)
})

test('a client id is only good for its own user', () => {
  channels.add('c2', channel({}, alice))
  assert.ok(channels.forUser('c2', alice))
  assert.equal(channels.forUser('c2', bob), undefined)
  channels.remove('c2')
})

test('a remembered view is taken over by the user who created it only', () => {
  const view = { entityType: 'x' }
  channels.rememberView('c3', view, alice)
  assert.equal(channels.takePending('c3', bob), null)
  assert.equal(channels.takePending('c3', alice), view)
  assert.equal(channels.takePending('c3', alice), null)
})
