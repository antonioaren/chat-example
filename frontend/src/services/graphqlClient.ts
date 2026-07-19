import { createClient } from 'graphql-sse'

import { clearAuth, readToken } from '@/services/authStorage'

const GRAPHQL_URL =
  import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql'

export const AUTH_EXPIRED_EVENT = 'simple-react-chat:auth-expired'

// The backend rejects requests whose token is expired/invalid with this exact
// message. Clearing storage + broadcasting lets AuthProvider drop its state so
// ProtectedRoute redirects to /login instead of leaving a dead session shell.
export function handleAuthError(message: string): void {
  if (message === 'Authentication required') {
    clearAuth()
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

// Token is read lazily per request so login/logout in the same tab take
// effect without recreating the clients.
function authHeaders(): Record<string, string> {
  const token = readToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`)
  }

  const json = (await response.json()) as GraphQLResponse<T>

  if (json.errors && json.errors.length > 0) {
    handleAuthError(json.errors[0].message)
    throw new Error(json.errors[0].message)
  }

  if (!json.data) {
    throw new Error('GraphQL response contained no data')
  }

  return json.data
}

export const sseClient = createClient({
  url: GRAPHQL_URL,
  headers: () => authHeaders(),
})
