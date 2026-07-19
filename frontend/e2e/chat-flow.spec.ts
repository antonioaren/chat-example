import { expect, test, type Locator, type Page } from '@playwright/test'

// Twilio-sim delays in the backend worker: sent at ~3s, delivered at ~6s
// after the job is processed. Generous ceilings keep the tests stable when
// the worker is cold-starting.
const STATUS_TIMEOUT_MS = 15_000

interface Credentials {
  firstName: string
  lastName: string
  email: string
  phone: string
  alias: string
  password: string
}

// Unique values per call: users and conversations persist in the backend,
// so each test isolates itself by registering fresh users.
function uniqueCredentials(label: string): Credentials {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    firstName: label,
    lastName: 'Tester',
    email: `e2e-${label.toLowerCase()}-${stamp}@example.com`,
    phone: '+34600000000',
    alias: `${label.toLowerCase()}-${stamp}`,
    password: 'e2e-password-123',
  }
}

function uniqueMessage(): string {
  return `e2e message ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function registerUser(page: Page, creds: Credentials): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('First name').fill(creds.firstName)
  await page.getByLabel('Last name').fill(creds.lastName)
  await page.getByLabel('Email').fill(creds.email)
  await page.getByLabel('Phone').fill(creds.phone)
  await page.getByLabel('Alias').fill(creds.alias)
  await page.getByLabel('Password').fill(creds.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function createConversation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(page).toHaveURL(/\/conversations\/[A-Za-z0-9-]+$/)
}

async function sendMessage(page: Page, body: string): Promise<Locator> {
  await page.getByPlaceholder('Type a message').fill(body)
  await page.getByRole('button', { name: 'Send' }).click()
  return page.locator('.message-bubble', { hasText: body })
}

test('happy path: register, create conversation, add participant, message, re-login', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)

  const userA = uniqueCredentials('Alice')
  const userB = uniqueCredentials('Bob')

  // Register user A and create a conversation from the empty state.
  await registerUser(page, userA)
  await expect(page.getByText(`Signed in as`)).toContainText(userA.alias)
  await createConversation(page)

  const conversationUrl = page.url()

  // The sidebar lists the new conversation and marks it active.
  const sidebar = page.getByRole('complementary')
  await expect(sidebar.getByRole('link')).toHaveCount(1)

  // Register dummy user B in an isolated browser context.
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await registerUser(pageB, userB)
  await contextB.close()

  // A adds B by email; B shows up as a participant.
  await page.getByLabel('Add participant by email').fill(userB.email)
  await page.getByRole('button', { name: 'Add participant' }).click()
  await expect(
    page.getByRole('list', { name: 'Participants' }).getByText(userB.alias),
  ).toBeVisible()

  // A sends a message: optimistic queued bubble, then reaches sent.
  const body = uniqueMessage()
  const bubble = await sendMessage(page, body)
  await expect(bubble).toBeVisible()
  await expect(bubble.locator('.message-bubble__status')).toHaveText(/sent/i, {
    timeout: STATUS_TIMEOUT_MS,
  })

  // Logout returns to the login screen.
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // Login again with the same email/password restores the session and the
  // conversation list.
  await page.getByLabel('Email').fill(userA.email)
  await page.getByLabel('Password').fill(userA.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Signed in as')).toContainText(userA.alias)
  await expect(sidebar.getByRole('link')).toHaveCount(1)

  // Selecting the conversation navigates back to it.
  await sidebar.getByRole('link').first().click()
  await expect(page).toHaveURL(conversationUrl)
  await expect(page.locator('.message-bubble', { hasText: body })).toBeVisible()
})

test('a sent message appears immediately as queued (optimistic UI)', async ({
  page,
}) => {
  await registerUser(page, uniqueCredentials('Opti'))
  await createConversation(page)

  const bubble = await sendMessage(page, uniqueMessage())

  await expect(bubble).toBeVisible()
  await expect(bubble.locator('.message-bubble__status')).toHaveText(/queued/i)
})

test('a message progresses through sent and delivered', async ({ page }) => {
  await registerUser(page, uniqueCredentials('Status'))
  await createConversation(page)

  const bubble = await sendMessage(page, uniqueMessage())
  const status = bubble.locator('.message-bubble__status')

  await expect(status).toHaveText(/sent/i, { timeout: STATUS_TIMEOUT_MS })
  await expect(status).toHaveText(/delivered/i, { timeout: STATUS_TIMEOUT_MS })
})

test('protected route redirects to login when signed out', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})
