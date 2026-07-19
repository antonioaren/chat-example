import { useState, type FormEvent } from 'react'

import type { RegisterInput } from '@/types/user'

interface RegisterFormProps {
  onSubmit: (input: RegisterInput) => Promise<void>
}

interface FieldConfig {
  key: keyof RegisterInput
  label: string
  type: string
  autoComplete: string
}

const FIELDS: FieldConfig[] = [
  { key: 'firstName', label: 'First name', type: 'text', autoComplete: 'given-name' },
  { key: 'lastName', label: 'Last name', type: 'text', autoComplete: 'family-name' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { key: 'alias', label: 'Alias', type: 'text', autoComplete: 'nickname' },
  { key: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
]

const EMPTY_INPUT: RegisterInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  alias: '',
  password: '',
}

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const [input, setInput] = useState<RegisterInput>(EMPTY_INPUT)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit =
    !isSubmitting &&
    FIELDS.every(({ key }) => input[key].trim().length > 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        ...input,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email.trim(),
        phone: input.phone.trim(),
        alias: input.alias.trim(),
      })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Registration failed',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="join-form" onSubmit={handleSubmit} noValidate>
      {FIELDS.map(({ key, label, type, autoComplete }) => (
        <div className="join-form__field" key={key}>
          <label className="join-form__label" htmlFor={`register-${key}`}>
            {label}
          </label>
          <input
            id={`register-${key}`}
            className="join-form__input"
            type={type}
            name={key}
            autoComplete={autoComplete}
            value={input[key]}
            onChange={(event) =>
              setInput((prev) => ({ ...prev, [key]: event.target.value }))
            }
          />
        </div>
      ))}

      {error ? (
        <p className="join-form__error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="join-form__submit" type="submit" disabled={!canSubmit}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
