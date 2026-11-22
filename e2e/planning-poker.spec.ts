import { test, expect, type Browser, type Page } from '@playwright/test'

// Every user gets an own browser context: own localStorage, own socket.
async function newUser(browser: Browser) {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  return context.newPage()
}

async function createGame(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('Your Name').fill(name)
  await page.getByRole('button', { name: 'Create New Game' }).click()
  await expect(page).toHaveURL(/\/game\/[\w-]{6}$/)
  await expect(page.getByText('(You)')).toBeVisible()
  return page.url().split('/game/')[1]
}

async function joinViaInvite(page: Page, gameId: string, name: string) {
  await page.goto(`/invite/${gameId}`)
  await expect(page.getByText(/invited to join/)).toBeVisible()
  await expect(page.getByLabel('Game ID')).toHaveValue(gameId)
  await page.getByLabel('Your Name').fill(name)
  await page.getByRole('button', { name: 'Join This Game' }).click()
  await expect(page).toHaveURL(`/game/${gameId}`)
  await expect(page.getByText('(You)')).toBeVisible()
}

// The seat (card + name) of a player at the table.
const seat = (page: Page, name: string) =>
  page.locator('div.absolute.flex-col').filter({ hasText: name })
const pickCard = (page: Page, card: string) =>
  page.getByRole('button', { name: card, exact: true }).click()

async function twoPlayerGame(browser: Browser) {
  const alice = await newUser(browser)
  const bob = await newUser(browser)
  const gameId = await createGame(alice, 'Alice')
  await joinViaInvite(bob, gameId, 'Bob')
  for (const page of [alice, bob]) {
    await expect(seat(page, 'Alice')).toBeVisible()
    await expect(seat(page, 'Bob')).toBeVisible()
  }
  return { alice, bob, gameId }
}

test('two users estimate a story: pick, reveal with countdown, new round', async ({ browser }) => {
  const { alice, bob } = await twoPlayerGame(browser)
  await expect(seat(alice, 'Alice')).toContainText('(You)')
  await expect(seat(bob, 'Bob')).toContainText('(You)')
  await expect(alice.getByText('Pick your cards!')).toBeVisible()

  // Alice votes: Bob sees that she voted, but not what
  await pickCard(alice, '5')
  await expect(seat(bob, 'Alice')).toContainText('?')
  await expect(seat(bob, 'Alice')).not.toContainText('5')
  await expect(bob.getByRole('button', { name: 'Reveal Cards' })).toBeVisible()

  // Bob votes and reveals; both see the countdown, then the result
  await pickCard(bob, '8')
  await expect(seat(alice, 'Bob')).toContainText('?')
  await bob.getByRole('button', { name: 'Reveal Cards' }).click()
  await expect(alice.locator('div.animate-pulse')).toHaveText(/^[1-3]$/) // countdown on the table

  for (const page of [alice, bob]) {
    await expect(page.getByText('Average estimate')).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('6.5')).toBeVisible()
    await expect(seat(page, 'Alice')).toContainText('5')
    await expect(seat(page, 'Bob')).toContainText('8')
    await expect(page.getByRole('button', { name: '13', exact: true })).toBeDisabled()
  }

  // New round resets everyone
  await alice.getByRole('button', { name: 'Start New Round' }).click()
  for (const page of [alice, bob]) {
    await expect(page.getByText('Pick your cards!')).toBeVisible()
    await expect(page.getByText('Average estimate')).toBeHidden()
    await expect(page.getByRole('button', { name: '13', exact: true })).toBeEnabled()
  }
})

test('? and coffee cards do not count towards the average', async ({ browser }) => {
  const { alice, bob } = await twoPlayerGame(browser)
  await pickCard(alice, '3')
  await pickCard(bob, '☕')
  await expect(alice.getByRole('button', { name: 'Reveal Cards' })).toBeVisible()
  await alice.getByRole('button', { name: 'Reveal Cards' }).click()
  await expect(bob.getByText('3.0')).toBeVisible({ timeout: 6000 })
  await expect(seat(alice, 'Bob')).toContainText('☕')
})

test('a player can change their card before the reveal', async ({ browser }) => {
  const { alice, bob } = await twoPlayerGame(browser)
  await pickCard(alice, '2')
  await pickCard(alice, '21')
  await pickCard(bob, '1')
  await expect(seat(alice, 'Bob')).toContainText('?')
  await bob.getByRole('button', { name: 'Reveal Cards' }).click()
  await expect(bob.getByText('11.0')).toBeVisible({ timeout: 6000 })
})

test('invite button copies a working invite link', async ({ browser }) => {
  const alice = await newUser(browser)
  const gameId = await createGame(alice, 'Alice')
  await alice.getByRole('button', { name: 'Invite players' }).click()
  await expect(alice.getByRole('button', { name: 'Copied!' })).toBeVisible()
  const link = await alice.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(new RegExp(`/invite/${gameId}$`))

  const bob = await newUser(browser)
  await bob.goto(link)
  await bob.getByLabel('Your Name').fill('Bob')
  await bob.getByRole('button', { name: 'Join This Game' }).click()
  await expect(seat(alice, 'Bob')).toBeVisible()
})

test('a player who closes the tab disappears for the others', async ({ browser }) => {
  const { alice, bob } = await twoPlayerGame(browser)
  await bob.context().close()
  await expect(seat(alice, 'Bob')).toBeHidden()
  await expect(seat(alice, 'Alice')).toBeVisible()
})

test('a player who clicks "New Game" leaves the game for the others', async ({ browser }) => {
  const { alice, bob } = await twoPlayerGame(browser)
  await bob.getByRole('button', { name: 'New Game' }).click()
  await expect(bob).toHaveURL('/')
  await expect(seat(alice, 'Bob')).toBeHidden()
})

test('reloading keeps the player in the game without duplicates', async ({ browser }) => {
  const { alice, bob } = await twoPlayerGame(browser)
  await bob.reload()
  await expect(bob.getByText('(You)')).toBeVisible()
  await expect(seat(alice, 'Bob')).toHaveCount(1)
  await expect(seat(bob, 'Alice')).toBeVisible()
})

test('returning via invite link with a stored name skips the form', async ({ browser }) => {
  const { bob, gameId } = await twoPlayerGame(browser)
  await bob.goto(`/invite/${gameId}`)
  await expect(bob).toHaveURL(`/game/${gameId}`)
  await expect(seat(bob, 'Bob')).toContainText('(You)')
})

test('an unknown game shows an error and leads back home', async ({ browser }) => {
  const page = await newUser(browser)
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('playerName', 'Alice'))
  await page.goto('/game/nope00')
  await expect(page.getByText('Game not found')).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible()
})

test('creating a game requires a name', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create New Game' }).click()
  await expect(page.getByText('Please enter your name')).toBeVisible()
  await expect(page).toHaveURL('/')
})

test('shows the app version on every page', async ({ browser }) => {
  const version = /^v\d+\.\d+\.\d+/
  const page = await newUser(browser)
  await page.goto('/')
  await expect(page.getByText(version)).toBeVisible()
  await createGame(page, 'Alice')
  await expect(page.getByText(version)).toBeVisible()
})

test('unknown routes redirect home', async ({ page }) => {
  await page.goto('/does/not/exist')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible()
})
