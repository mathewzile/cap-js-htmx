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
  assert.equal(channels.takePending('c3', alice).view, view)
  assert.equal(channels.takePending('c3', alice), null)
})

test('one view per Flexible Column Layout column: a page opened in a column closes the columns after it', () => {
  const list = { list: true, column: 0 }
  const op = { entitySetPath: 'Authors', column: 1 }
  const sub = { entitySetPath: 'Books', column: 2 }
  let views = channels.mergeViews(null, list)
  views = channels.mergeViews(views, op)
  views = channels.mergeViews(views, sub)
  assert.deepEqual([...views.keys()], [0, 1, 2])
  const other = { entitySetPath: 'Authors', column: 1 } // another author opened in the middle column
  views = channels.mergeViews(views, other)
  assert.deepEqual([...views.keys()], [0, 1])
  assert.equal(views.get(1), other)
  assert.deepEqual([...channels.mergeViews(views, { column: undefined }).keys()], [0], 'a page without columns is one view')
})

test('views remembered for a page that has no channel yet are merged, and taken over together', () => {
  const alice = { id: 'alice' }
  channels.rememberView('c9', { list: true, column: 0 }, alice)
  channels.rememberView('c9', { entitySetPath: 'Authors', column: 1 }, alice)
  const taken = channels.takePending('c9', alice)
  assert.deepEqual([...taken.views.keys()], [0, 1])
  assert.equal(taken.view.column, 1)
})
