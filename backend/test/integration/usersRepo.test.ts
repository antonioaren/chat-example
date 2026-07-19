// Opt-in integration tier: exercises usersRepo against the real PostgreSQL
// from docker-compose.dev.yml. Run `pnpm docker:dev` first, then
// `pnpm test:integration`. Not part of the default `pnpm test` run.

import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import {
  createUser,
  findUserByEmail,
  findUserById,
  DuplicateEmailError,
  DuplicateAliasError,
} from '../../src/db/usersRepo.js'
import { prisma } from '../../src/db/prismaClient.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let counter = 0
function uniqueInput(overrides: Record<string, string> = {}) {
  counter += 1
  const suffix = `${Date.now()}-${counter}`
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `ada-${suffix}@example.com`,
    phone: '+34600000000',
    alias: `ada-${suffix}`,
    passwordHash: 'not-a-real-hash',
    ...overrides,
  }
}

describe('integration — usersRepo against real PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'ada-' } },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'ada-' } },
    })
    await prisma.$disconnect()
  })

  it('should create a user with a generated uuid and lowercased email', async () => {
    const input = uniqueInput({ email: `ADA-Mixed-${Date.now()}@Example.COM` })

    const user = await createUser(input)

    expect(user.id).toMatch(UUID_PATTERN)
    expect(user.email).toBe(input.email.toLowerCase())
    expect(user.firstName).toBe('Ada')
    expect(user.lastName).toBe('Lovelace')
    expect(user.phone).toBe('+34600000000')
    expect(user.alias).toBe(input.alias)
    expect(user.passwordHash).toBe('not-a-real-hash')
  })

  it('should reject a duplicate email with DuplicateEmailError', async () => {
    const input = uniqueInput()
    await createUser(input)

    await expect(
      createUser(uniqueInput({ email: input.email })),
    ).rejects.toBeInstanceOf(DuplicateEmailError)
  })

  it('should treat email as case-insensitive for duplicates', async () => {
    const input = uniqueInput()
    await createUser(input)

    await expect(
      createUser(uniqueInput({ email: input.email.toUpperCase() })),
    ).rejects.toBeInstanceOf(DuplicateEmailError)
  })

  it('should reject a duplicate alias with DuplicateAliasError', async () => {
    const input = uniqueInput()
    await createUser(input)

    await expect(
      createUser(uniqueInput({ alias: input.alias })),
    ).rejects.toBeInstanceOf(DuplicateAliasError)
  })

  it('should trim surrounding whitespace on email for storage and lookup', async () => {
    const suffix = `${Date.now()}-trim`
    const created = await createUser(
      uniqueInput({ email: `  ADA-${suffix}@Example.com  ` }),
    )

    const found = await findUserByEmail(`ada-${suffix}@example.com`)

    expect(created.email).toBe(`ada-${suffix}@example.com`)
    expect(found?.id).toBe(created.id)
  })

  it('should find a user by email regardless of case', async () => {
    const input = uniqueInput()
    const created = await createUser(input)

    const found = await findUserByEmail(input.email.toUpperCase())

    expect(found?.id).toBe(created.id)
  })

  it('should find a user by id', async () => {
    const created = await createUser(uniqueInput())

    const found = await findUserById(created.id)

    expect(found?.email).toBe(created.email)
  })

  it('should return null for unknown email and id', async () => {
    await expect(findUserByEmail('ada-nobody@example.com')).resolves.toBeNull()
    await expect(
      findUserById('00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeNull()
  })
})
