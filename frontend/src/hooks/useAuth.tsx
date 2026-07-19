import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import * as chatService from '@/stubs/chatService'
import { clearAuth, readAuth, writeAuth } from '@/services/authStorage'
import { AUTH_EXPIRED_EVENT } from '@/services/graphqlClient'
import type { RegisterInput, User } from '@/types/user'

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  register: (input: RegisterInput) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState(() => readAuth())

  // graphqlClient clears storage and broadcasts when the backend rejects the
  // token; dropping state here makes ProtectedRoute redirect to /login.
  useEffect(() => {
    const onExpired = (): void => setAuth(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const register = useCallback(async (input: RegisterInput): Promise<void> => {
    const payload = await chatService.register(input)
    writeAuth(payload)
    setAuth(payload)
  }, [])

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const payload = await chatService.login(email, password)
      writeAuth(payload)
      setAuth(payload)
    },
    [],
  )

  const logout = useCallback((): void => {
    clearAuth()
    setAuth(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user: auth?.user ?? null,
        token: auth?.token ?? null,
        isAuthenticated: auth !== null,
        register,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
