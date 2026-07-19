import { Link, useNavigate } from 'react-router-dom'

import { RegisterForm } from '@/components/auth/RegisterForm'
import { useAuth } from '@/hooks/useAuth'
import type { RegisterInput } from '@/types/user'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  async function handleRegister(input: RegisterInput): Promise<void> {
    await register(input)
    navigate('/')
  }

  return (
    <main className="chat-page">
      <h1>Chat</h1>
      <section className="join-panel">
        <h2>Create your account</h2>
        <p className="join-panel__message">
          Register to start chatting. All fields are required.
        </p>
        <RegisterForm onSubmit={handleRegister} />
        <p className="join-panel__switch">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </section>
    </main>
  )
}
