import { Link, useNavigate } from 'react-router-dom'

import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleLogin(email: string, password: string): Promise<void> {
    await login(email, password)
    navigate('/')
  }

  return (
    <main className="chat-page">
      <h1>Chat</h1>
      <section className="join-panel">
        <h2>Log in</h2>
        <p className="join-panel__message">
          Welcome back. Enter your email and password.
        </p>
        <LoginForm onSubmit={handleLogin} />
        <p className="join-panel__switch">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </section>
    </main>
  )
}
