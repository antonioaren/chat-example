import { useState, type FormEvent } from 'react'

const MAX_NAME_LENGTH = 40

interface AddUserFormProps {
  isFull: boolean
  error: string | null
  onSubmit: (name: string) => Promise<void>
}

export function AddUserForm({ isFull, error, onSubmit }: AddUserFormProps) {
  const [name, setName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const trimmedName = name.trim()
  const canSubmit =
    !isFull &&
    !isSubmitting &&
    trimmedName.length > 0 &&
    trimmedName.length <= MAX_NAME_LENGTH

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!trimmedName) {
      setValidationError('Name is required.')
      return
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setValidationError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`)
      return
    }

    setValidationError(null)
    setIsSubmitting(true)

    try {
      await onSubmit(trimmedName)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isFull) {
    return (
      <section className="join-panel" aria-live="polite">
        <h2>Conversation full</h2>
        <p className="join-panel__message">
          This conversation already has two participants (2/2).
        </p>
      </section>
    )
  }

  const displayError = validationError ?? error

  return (
    <section className="join-panel">
      <h2>Join conversation</h2>
      <p className="join-panel__message">
        Enter your name to join this 1:1 chat. Open a second tab to add the
        other participant.
      </p>

      <form className="join-form" onSubmit={handleSubmit} noValidate>
        <label className="join-form__label" htmlFor="participant-name">
          Your name
        </label>
        <input
          id="participant-name"
          className="join-form__input"
          type="text"
          name="name"
          placeholder="e.g. Alice"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          aria-invalid={displayError ? true : undefined}
          aria-describedby={displayError ? 'join-form-error' : undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (validationError) {
              setValidationError(null)
            }
          }}
        />

        {displayError ? (
          <p id="join-form-error" className="join-form__error" role="alert">
            {displayError}
          </p>
        ) : null}

        <button
          className="join-form__submit"
          type="submit"
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Joining…' : 'Join chat'}
        </button>
      </form>
    </section>
  )
}
