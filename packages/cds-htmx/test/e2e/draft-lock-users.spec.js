const { test, expect } = require('@playwright/test')

// Two users in two browser sessions (the dev server's mocked users alice and bob): while alice edits a book, bob sees who holds the draft,
// in the List Report row and in the header of the book's page. Each context sends its own credentials.

const JANE_EYRE = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // a book: its list has the draft column (Common.SemanticKey: title)
const START = { timeout: 60000 }

// (the mocked auth never challenges, so the credentials go with every request instead of waiting for a 401)
const session = async (browser, username) => (await browser.newContext({ extraHTTPHeaders: { Authorization: 'Basic ' + Buffer.from(username + ':').toString('base64') } })).newPage()

test('while alice edits a book, bob sees "Unsaved changes by alice" in the list and an icon with a popover on the book page', async ({ browser }) => {
  test.setTimeout(120000)
  const alice = await session(browser, 'alice')
  const bob = await session(browser, 'bob')
  const book = `/htmx/catalog/Books(ID=${JANE_EYRE},IsActiveEntity=true)`

  await alice.goto(book)
  await alice.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(alice.getByRole('button', { name: 'Save', exact: true })).toBeVisible(START)

  await bob.goto('/htmx/catalog/Books')
  await expect(bob.locator('.hf-table tbody tr', { hasText: 'Jane Eyre' })).toContainText('Unsaved changes by alice', START)
  // the marker opens its popover and does not open the row
  await bob.locator('.hf-table tbody tr', { hasText: 'Jane Eyre' }).locator('.hf-draft-lock__button').click()
  await expect(bob.locator('.hf-draft-lock__body')).toContainText('This object has unsaved changes made by alice.')
  await expect(bob.locator('.hf-draft-lock__body')).toContainText('Last changed on')
  await expect(bob.locator('.hf-table')).toBeVisible()
  await bob.goto(book)
  // the header has the icon alone; its popover says the same
  const icon = bob.locator('.hf-page--op .hf-draft-lock__button')
  await expect(icon).toBeVisible(START)
  await expect(icon).toHaveText('')
  await icon.click()
  await expect(bob.locator('.hf-page--op .hf-draft-lock__body')).toContainText('Unsaved Changes')
  await expect(bob.locator('.hf-page--op .hf-draft-lock__body')).toContainText('made by alice')

  // alice discards: the lock is gone for bob
  await alice.getByRole('button', { name: 'Discard Draft' }).click()
  await bob.reload()
  await expect(bob.locator('.hf-page--op')).not.toContainText('made by alice', START)
  await expect(bob.locator('.hf-draft-lock__button')).toHaveCount(0)
})
