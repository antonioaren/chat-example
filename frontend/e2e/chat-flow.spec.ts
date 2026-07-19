import { expect, test, type Locator, type Page } from '@playwright/test'

// Twilio-sim delays in the backend worker: sent at ~3s, delivered at ~6s
// after the job is processed. Generous ceilings keep the tests stable when
// the worker is cold-starting.
const STATUS_TIMEOUT_MS = 15_000

// Unique values per call: the conversation is shared and persists in
// DynamoDB, so each test isolates itself by content, not by state reset.
function uniqueName(): string {
  return `E2E ${Date.now()}`.slice(0, 40)
}

function uniqueMessage(): string {
  return `e2e message ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function joinChat(page: Page, name: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join chat' }).click()
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function sendMessage(page: Page, body: string): Promise<Locator> {
  await page.getByPlaceholder('Type a message').fill(body)
  await page.getByRole('button', { name: 'Send' }).click()
  return page.locator('.message-bubble', { hasText: body })
}

test('join the conversation shows the signed-in state', async ({ page }) => {
  const name = uniqueName()

  await joinChat(page, name)

  // The name renders twice (header + participant chip) — assert the first
  await expect(page.getByText(name).first()).toBeVisible()
  await expect(page.getByPlaceholder('Type a message')).toBeVisible()
})

test('a sent message appears immediately as queued (optimistic UI)', async ({
  page,
}) => {
  await joinChat(page, uniqueName())

  const bubble = await sendMessage(page, uniqueMessage())

  await expect(bubble).toBeVisible()
  await expect(bubble.locator('.message-bubble__status')).toHaveText(/queued/i)
})

test('a message progresses through sent and delivered', async ({ page }) => {
  await joinChat(page, uniqueName())

  const bubble = await sendMessage(page, uniqueMessage())
  const status = bubble.locator('.message-bubble__status')

  await expect(status).toHaveText(/sent/i, { timeout: STATUS_TIMEOUT_MS })
  await expect(status).toHaveText(/delivered/i, { timeout: STATUS_TIMEOUT_MS })
})
