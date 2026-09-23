import type { TransportStatus } from '@agichat/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LABELS } from '../labels.js'
import { ConnectionNotice } from './connection-notice.js'

describe('ConnectionNotice', () => {
  it.each<[TransportStatus, string]>([
    ['connecting', DEFAULT_LABELS.connecting],
    ['reconnecting', DEFAULT_LABELS.reconnecting],
    ['closed', DEFAULT_LABELS.disconnected],
    ['error', DEFAULT_LABELS.disconnected],
  ])('avisa del canal en estado %s', (connection, text) => {
    render(<ConnectionNotice connection={connection} error={null} labels={DEFAULT_LABELS} />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it.each<TransportStatus>(['idle', 'open'])('no pinta nada en estado %s', (connection) => {
    const { container } = render(
      <ConnectionNotice connection={connection} error={null} labels={DEFAULT_LABELS} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el error del agente aunque el canal siga abierto', () => {
    render(
      <ConnectionNotice
        connection="open"
        error={{ code: 'agent_unavailable', message: 'El agente falló.', recoverable: true }}
        labels={DEFAULT_LABELS}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('El agente falló.')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
