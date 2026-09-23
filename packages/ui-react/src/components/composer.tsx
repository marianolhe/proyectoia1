import type { SendResult } from '@agichat/core'
import { useId, useState, type FormEvent } from 'react'

export interface ComposerProps {
  readonly canSubmit: boolean
  readonly placeholder: string
  readonly sendLabel: string
  onSend(text: string): Promise<SendResult>
}

export function Composer({ canSubmit, placeholder, sendLabel, onSend }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const hasText = draft.trim().length > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !hasText) return

    // Se limpia antes de esperar a la red: el nucleo ya pinto el mensaje en
    // el hilo, y dejarlo tambien en el input pareceria que no se envio.
    const text = draft
    setDraft('')
    const result = await onSend(text)

    // Solo se devuelve el texto cuando el mensaje no llego al hilo. Si el
    // envio fallo, el mensaje ya esta visible y la alerta explica el fallo.
    if (!result.ok && (result.reason === 'busy' || result.reason === 'disconnected')) {
      setDraft((current) => (current === '' ? text : current))
    }
  }

  return (
    <form className="agc-composer" onSubmit={handleSubmit}>
      <label className="agc-visually-hidden" htmlFor={inputId}>
        {placeholder}
      </label>
      {/* El input queda habilitado mientras el agente responde: el usuario
          puede ir escribiendo su siguiente duda; solo se bloquea el envio. */}
      <input
        id={inputId}
        className="agc-composer__input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        className="agc-composer__send"
        type="submit"
        aria-label={sendLabel}
        disabled={!canSubmit || !hasText}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M5 12h13M13 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  )
}
