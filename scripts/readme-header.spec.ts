// Plays a real 4-player round against the running app and composes docs/header.png.
// Run with: npm run screenshot
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const OUTPUT = path.join(__dirname, '..', 'docs', 'header.png')
const VIEWPORT = { width: 960, height: 600 }

const seat = (page: Page, name: string) =>
  page.locator('div.absolute.flex-col').filter({ hasText: name })
const pick = (page: Page, card: string) =>
  page.getByRole('button', { name: card, exact: true }).click()

async function shoot(page: Page) {
  await page.mouse.move(0, 0) // no hover effects
  return (await page.screenshot()).toString('base64')
}

test('README header image', async ({ browser }) => {
  test.setTimeout(60_000)
  const users: Page[] = []
  for (let i = 0; i < 4; i++) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    await context.addInitScript(() => localStorage.setItem('soundEnabled', 'false'))
    users.push(await context.newPage())
  }
  const [alice, bob, carol, dave] = users

  // Alice creates the game, the others join via invite link
  await alice.goto('/')
  await alice.getByLabel('Your Name').fill('Alice')
  await alice.getByRole('button', { name: 'Create New Game' }).click()
  await expect(alice.getByText('(You)')).toBeVisible()
  const gameId = alice.url().split('/game/')[1]
  for (const [page, name] of [[bob, 'Bob'], [carol, 'Carol'], [dave, 'Dave']] as const) {
    await page.goto(`/invite/${gameId}`)
    await page.getByLabel('Your Name').fill(name)
    await page.getByRole('button', { name: 'Join This Game' }).click()
    await expect(seat(alice, name)).toBeVisible()
  }

  // 1) Voting in progress: Alice sees her own pick, the others' cards stay hidden
  await pick(alice, '5')
  await pick(bob, '8')
  await pick(carol, '5')
  await expect(seat(alice, 'Carol')).toContainText('?')
  const voting = await shoot(alice)

  // 2) Revealed after the countdown
  await pick(dave, '3')
  await expect(seat(alice, 'Dave')).toContainText('?')
  await alice.getByRole('button', { name: 'Reveal Cards' }).click()
  await expect(alice.getByText('Average estimate')).toBeVisible({ timeout: 6000 })
  await alice.waitForTimeout(400) // let the card deck fade out
  const revealed = await shoot(alice)

  // Compose the banner
  const canvas = await (await browser.newContext({ viewport: { width: 1600, height: 760 }, deviceScaleFactor: 2 })).newPage()
  await canvas.setContent(`<!doctype html>
<html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1600px; height: 760px; padding: 52px 64px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    color: #f8fafc;
    background: radial-gradient(1200px 600px at 15% -10%, #0c4a6e 0%, transparent 60%),
                radial-gradient(900px 500px at 110% 120%, #0369a1 0%, transparent 55%), #0b1120;
  }
  header { display: flex; align-items: baseline; gap: 24px; margin-bottom: 40px; }
  h1 { font-size: 64px; font-weight: 800; letter-spacing: -0.02em; }
  h1 span { color: #38bdf8; }
  p.tagline { font-size: 26px; color: #94a3b8; }
  .shots { display: flex; gap: 40px; }
  figure { flex: 1; }
  .window { border-radius: 14px; overflow: hidden; background: #1f2937;
            box-shadow: 0 30px 60px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(148,163,184,.18); }
  .bar { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #111827; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .window img { display: block; width: 100%; }
  figcaption { margin-top: 20px; font-size: 22px; color: #cbd5e1; }
  figcaption b { color: #38bdf8; margin-right: 8px; }
</style></head>
<body>
  <header>
    <h1>Planning <span>Poker</span></h1>
    <p class="tagline">Real-time story estimation for agile teams</p>
  </header>
  <div class="shots">
    ${[
      [voting, '1', 'Everyone picks a card in secret'],
      [revealed, '2', 'Reveal together after a 3-2-1 countdown'],
    ]
      .map(
        ([img, step, caption]) => `
    <figure>
      <div class="window">
        <div class="bar"><i style="background:#f87171"></i><i style="background:#fbbf24"></i><i style="background:#34d399"></i></div>
        <img src="data:image/png;base64,${img}">
      </div>
      <figcaption><b>${step}</b>${caption}</figcaption>
    </figure>`,
      )
      .join('')}
  </div>
</body></html>`)
  await canvas.screenshot({ path: OUTPUT })
})
