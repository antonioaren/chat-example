import type { AuthPayload, User } from '@/types/user'

const STORAGE_KEY = 'simple-react-chat:auth'

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as User).id === 'string' &&
    typeof (value as User).alias === 'string' &&
    typeof (value as User).email === 'string'
  )
}

export function readAuth(): AuthPayload | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as AuthPayload).token === 'string' &&
      isUser((parsed as AuthPayload).user)
    ) {
      return parsed as AuthPayload
    }
  } catch {
    // fall through to null on corrupt storage
  }
  return null
}

export function writeAuth(auth: AuthPayload): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

export function clearAuth(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}

export function readToken(): string | null {
  return readAuth()?.token ?? null
}
