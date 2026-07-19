import { describe, it, expect } from 'vitest'

import { signToken, verifyToken } from '../../src/auth/tokens.js'

describe('auth tokens', () => {
  it('should verify a signed token and return its subject', async () => {
    const token = await signToken('user-123')

    const payload = await verifyToken(token)

    expect(payload).toEqual({ sub: 'user-123' })
  })

  it('should return null for a garbage token', async () => {
    const payload = await verifyToken('not-a-jwt')

    expect(payload).toBeNull()
  })

  it('should return null for an expired token', async () => {
    // 0s TTL: exp equals iat, so the token is already expired on verify.
    const token = await signToken('user-123', { ttl: '0s' })

    const payload = await verifyToken(token)

    expect(payload).toBeNull()
  })

  it('should return null for a token signed with a different secret', async () => {
    const token = await signToken('user-123', { secret: 'another-secret' })

    const payload = await verifyToken(token)

    expect(payload).toBeNull()
  })
})
