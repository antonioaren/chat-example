import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/auth/passwords.js'

describe('passwords', () => {
  it('should verify a password against its own hash', async () => {
    const hash = await hashPassword('s3cret-pass')

    await expect(verifyPassword('s3cret-pass', hash)).resolves.toBe(true)
  })

  it('should reject a wrong password', async () => {
    const hash = await hashPassword('s3cret-pass')

    await expect(verifyPassword('not-the-password', hash)).resolves.toBe(false)
  })

  it('should salt hashes so the same password never hashes twice to the same value', async () => {
    const first = await hashPassword('s3cret-pass')
    const second = await hashPassword('s3cret-pass')

    expect(first).not.toBe(second)
  })

  it('should not store the plaintext password inside the hash', async () => {
    const hash = await hashPassword('s3cret-pass')

    expect(hash).not.toContain('s3cret-pass')
  })
})
