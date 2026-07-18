import { describe, it, expect, beforeEach } from 'vitest'
import { yoga } from "../src/app.js";
import { conversations } from '../src/store.js'

const post = (body: string, contentType = 'application/json') =>
  yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    }),
  )

describe('GraphQL Yoga — schema validation', () => {
  beforeEach(() => {
    conversations.clear()
  })

  it('should return the conversation when it exists', async () => {
    conversations.set('conv-app', { id: 'conv-app', messages: [] })

    const response = await post(
      JSON.stringify({ query: '{ conversation(id: "conv-app") { id messages { id } } }' }),
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversation).toMatchObject({ id: 'conv-app', messages: [] })
  })

  it('should return errors array when querying a non-existent field', async () => {
    const response = await post(JSON.stringify({ query: '{ nonExistent }' }))

    const json = await response.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.errors.length).toBeGreaterThan(0)
    expect(json.data).toBeUndefined()
  })

  it('should return 4xx when the request body is malformed JSON', async () => {
    const response = await post('not valid json')

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
  })
})
