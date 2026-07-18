import { createClient } from 'graphql-sse'

const GRAPHQL_URL =
  import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql'

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`)
  }

  const json = (await response.json()) as GraphQLResponse<T>

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message)
  }

  if (!json.data) {
    throw new Error('GraphQL response contained no data')
  }

  return json.data
}

export const sseClient = createClient({ url: GRAPHQL_URL })
