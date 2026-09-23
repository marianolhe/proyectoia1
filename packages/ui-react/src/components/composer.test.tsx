import type { SendResult } from '@agichat/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './composer.js'

function renderComposer(canSubmit: boolean, result: SendResult = { ok: true, messageId: 'm1' }) {
  const onSend = vi.fn((_text: string) => Promise.resolve(result))
  render(
    <Composer canSubmit={canSubmit} placeholder="Escribe" sendLabel="Enviar" onSend={onSend} />,
  )
  return {
    onSend,
    input: screen.getByLabelText('Escribe'),
    button: screen.getByRole('button', { name: 'Enviar' }),
  }
}

describe('Composer', () => {
  it('deshabilita el envio sin texto', () => {
    const { button } = renderComposer(true)
    expect(button).toBeDisabled()
  })

  it('deshabilita el envio si el nucleo no lo permite, pero deja escribir', async () => {
    const user = userEvent.setup()
    const { input, button, onSend } = renderComposer(false)

    await user.type(input, 'hola{Enter}')

    expect(input).toHaveValue('hola')
    expect(button).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('envia con Enter y limpia el campo', async () => {
    const user = userEvent.setup()
    const { input, onSend } = renderComposer(true)

    await user.type(input, 'hola{Enter}')

    expect(onSend).toHaveBeenCalledWith('hola')
    expect(input).toHaveValue('')
  })

  it('envia con el boton', async () => {
    const user = userEvent.setup()
    const { input, button, onSend } = renderComposer(true)

    await user.type(input, 'duda')
    await user.click(button)

    expect(onSend).toHaveBeenCalledWith('duda')
  })

  it('ignora texto de solo espacios', async () => {
    const user = userEvent.setup()
    const { input, onSend } = renderComposer(true)

    await user.type(input, '   {Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it.each(['busy', 'disconnected'] as const)(
    'devuelve el texto al campo si el nucleo responde %s',
    async (reason) => {
      const user = userEvent.setup()
      const { input } = renderComposer(true, { ok: false, reason })

      await user.type(input, 'hola{Enter}')

      expect(await screen.findByDisplayValue('hola')).toBe(input)
    },
  )

  it('no devuelve el texto si el mensaje ya llego al hilo y fallo el envio', async () => {
    const user = userEvent.setup()
    const { input } = renderComposer(true, { ok: false, reason: 'failed' })

    await user.type(input, 'hola{Enter}')

    expect(input).toHaveValue('')
  })
})
