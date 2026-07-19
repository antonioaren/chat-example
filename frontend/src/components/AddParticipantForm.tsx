import { useState, type FormEvent } from 'react'

interface AddParticipantFormProps {
  onSubmit: (email: string) => Promise<void>
}

export function AddParticipantForm({ onSubmit }: AddParticipantFormProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = !isSubmitting && email.trim().length > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit(email.trim())
      setEmail('')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not add participant',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="add-participant" onSubmit={handleSubmit} noValidate>
      <label className="add-participant__label" htmlFor="add-participant-email">
        Add participant by email
      </label>
      <div className="add-participant__row">
        <input
          id="add-participant-email"
          className="join-form__input"
          type="email"
          name="email"
          placeholder="user@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button
          className="join-form__submit"
          type="submit"
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Adding…' : 'Add participant'}
        </button>
      </div>
      {error ? (
        <p className="join-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
