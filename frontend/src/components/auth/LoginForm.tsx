import { useState, type FormEvent } from 'react'

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = !isSubmitting && email.trim().length > 0 && password.length > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit(email.trim(), password)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Login failed',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="join-form" onSubmit={handleSubmit} noValidate>
      <label className="join-form__label" htmlFor="login-email">
        Email
      </label>
      <input
        id="login-email"
        className="join-form__input"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label className="join-form__label" htmlFor="login-password">
        Password
      </label>
      <input
        id="login-password"
        className="join-form__input"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error ? (
        <p className="join-form__error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="join-form__submit" type="submit" disabled={!canSubmit}>
        {isSubmitting ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  )
}
