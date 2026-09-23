import { ChatClient, InMemoryTransport } from '@agichat/core'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LABELS } from '../labels.js'
import { ChatWidget } from './chat-widget.js'

/** Cliente ya conectado para controlar a mano cada evento del agente. */
async function manualClient() {
  const transport = new InMemoryTransport({ chunkSize: 4 })
  const client = new ChatClient({ transport })
  await client.connect()
  return { client, transport }
}

function getThread() {
  return screen.getByRole('log', { name: DEFAULT_LABELS.messagesRegion })
}

async function send(text: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(DEFAULT_LABELS.placeholder), `${text}{Enter}`)
}

describe('ChatWidget', () => {
  describe('montaje', () => {
    it('arranca cerrado con la burbuja y la abre y cierra', async () => {
      const user = userEvent.setup()
      render(<ChatWidget transport={new InMemoryTransport()} />)

      const launcher = screen.getByRole('button', { name: DEFAULT_LABELS.openChat })
      expect(launcher).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('region', { name: DEFAULT_LABELS.assistantName })).toBeNull()

      await user.click(launcher)
      expect(screen.getByRole('region', { name: DEFAULT_LABELS.assistantName })).toBeVisible()
      expect(launcher).toHaveAttribute('aria-expanded', 'true')
      expect(launcher).toHaveAccessibleName(DEFAULT_LABELS.closeChat)
      expect(launcher.getAttribute('aria-controls')).toBe(
        screen.getByRole('region', { name: DEFAULT_LABELS.assistantName }).id,
      )

      await user.click(launcher)
      expect(screen.queryByRole('region', { name: DEFAULT_LABELS.assistantName })).toBeNull()
    })

    it('puede arrancar abierto', () => {
      render(<ChatWidget transport={new InMemoryTransport()} defaultOpen />)
      expect(screen.getByRole('region', { name: DEFAULT_LABELS.assistantName })).toBeVisible()
    })

    it('sin burbuja se pinta en linea y siempre abierto', () => {
      const { container } = render(
        <ChatWidget transport={new InMemoryTransport()} launcher={false} className="mi-sitio" />,
      )

      expect(screen.queryByRole('button', { name: DEFAULT_LABELS.openChat })).toBeNull()
      expect(screen.getByRole('region', { name: DEFAULT_LABELS.assistantName })).toBeVisible()
      expect(container.firstChild).toHaveClass('agc-widget', 'agc-widget--inline', 'mi-sitio')
    })

    it('conserva el hilo al cerrar y volver a abrir', async () => {
      const user = userEvent.setup()
      const transport = new InMemoryTransport({ autoRespond: () => 'Listo' })
      render(<ChatWidget transport={transport} defaultOpen />)
      await waitFor(() => expect(transport.status).toBe('open'))

      await send('hola')
      const launcher = screen.getByRole('button', { name: DEFAULT_LABELS.closeChat })
      await user.click(launcher)
      await user.click(launcher)

      expect(within(getThread()).getByText('Listo')).toBeInTheDocument()
    })
  })

  describe('estructura del wireframe', () => {
    it('muestra avatar, titulo y subtitulo tambien con mensajes en pantalla', async () => {
      const transport = new InMemoryTransport({ autoRespond: () => 'Claro que sí' })
      render(<ChatWidget transport={transport} launcher={false} />)
      await waitFor(() => expect(transport.status).toBe('open'))

      await send('¿Me ayudas?')

      expect(await within(getThread()).findByText('Claro que sí')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: DEFAULT_LABELS.title })).toBeVisible()
      expect(screen.getByText(DEFAULT_LABELS.subtitle)).toBeVisible()
    })

    it('pinta al usuario en burbuja y al agente como texto corrido', async () => {
      const transport = new InMemoryTransport({ autoRespond: () => 'Respuesta **útil**' })
      render(<ChatWidget transport={transport} launcher={false} />)
      await waitFor(() => expect(transport.status).toBe('open'))

      await send('pregunta')

      const [userItem, agentItem] = within(getThread()).getAllByRole('listitem')
      expect(userItem).toHaveClass('agc-message--user')
      expect(within(userItem!).getByText('pregunta')).toHaveClass('agc-bubble')
      expect(agentItem).toHaveClass('agc-message--assistant')
      expect(agentItem!.querySelector('.agc-bubble')).toBeNull()
      expect(within(agentItem!).getByText('útil').tagName).toBe('STRONG')
    })

    it('muestra el texto del usuario literal, sin interpretarlo como Markdown', async () => {
      const transport = new InMemoryTransport()
      render(<ChatWidget transport={transport} launcher={false} />)
      await waitFor(() => expect(transport.status).toBe('open'))

      await send('**no negrita**')

      expect(within(getThread()).getByText('**no negrita**')).toBeInTheDocument()
    })

    it('acepta textos y avatar propios', () => {
      render(
        <ChatWidget
          transport={new InMemoryTransport()}
          launcher={false}
          avatarSrc="/ana.png"
          labels={{ assistantName: 'Ana', title: 'Hola, soy Ana' }}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Hola, soy Ana' })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', '/ana.png')
      expect(screen.getByText(DEFAULT_LABELS.subtitle)).toBeInTheDocument()
    })
  })

  describe('flujo de la respuesta', () => {
    it('muestra los puntos hasta que llega el primer fragmento', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)

      await send('hola')
      expect(screen.getByRole('status', { name: DEFAULT_LABELS.typing })).toBeInTheDocument()

      act(() => transport.emit({ type: 'message.start', messageId: 'r1' }))
      expect(screen.getByRole('status', { name: DEFAULT_LABELS.typing })).toBeInTheDocument()

      act(() => transport.emit({ type: 'message.delta', messageId: 'r1', text: 'Bue' }))
      expect(screen.queryByRole('status', { name: DEFAULT_LABELS.typing })).toBeNull()
      const agentItem = within(getThread()).getAllByRole('listitem').at(-1)!
      expect(agentItem).toHaveAttribute('aria-busy', 'true')

      act(() => transport.emit({ type: 'message.end', messageId: 'r1' }))
      expect(agentItem).toHaveAttribute('aria-busy', 'false')
    })

    it('bloquea el envio mientras el agente responde', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      const button = screen.getByRole('button', { name: DEFAULT_LABELS.send })

      await send('primera')
      await userEvent.setup().type(screen.getByLabelText(DEFAULT_LABELS.placeholder), 'segunda')
      expect(button).toBeDisabled()

      act(() => transport.respondWith('ok', 'r1'))
      expect(button).toBeEnabled()
    })

    it('conserva el texto parcial y marca el mensaje si el canal muere a media respuesta', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)

      await send('hola')
      act(() => {
        transport.emit({ type: 'message.start', messageId: 'r1' })
        transport.emit({ type: 'message.delta', messageId: 'r1', text: 'Texto a medias' })
        transport.setStatus('closed')
      })

      const agentItem = within(getThread()).getAllByRole('listitem').at(-1)!
      expect(within(agentItem).getByText('Texto a medias')).toBeInTheDocument()
      expect(agentItem).toHaveAttribute('data-status', 'error')
      expect(within(agentItem).getByRole('note')).toHaveTextContent(DEFAULT_LABELS.interrupted)
      expect(screen.getByRole('status')).toHaveTextContent(DEFAULT_LABELS.disconnected)
      expect(screen.queryByRole('status', { name: DEFAULT_LABELS.typing })).toBeNull()
      expect(screen.getByRole('button', { name: DEFAULT_LABELS.send })).toBeDisabled()
    })

    it('muestra el fallo del agente y permite volver a preguntar', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)

      await send('hola')
      act(() =>
        transport.failWith('agent_unavailable', 'El agente no pudo completar la respuesta.'),
      )

      expect(screen.getByRole('alert')).toHaveTextContent(
        'El agente no pudo completar la respuesta.',
      )
      await userEvent.setup().type(screen.getByLabelText(DEFAULT_LABELS.placeholder), 'otra vez')
      expect(screen.getByRole('button', { name: DEFAULT_LABELS.send })).toBeEnabled()
    })

    it('avisa mientras el canal se reconecta', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)

      act(() => transport.setStatus('reconnecting'))
      expect(screen.getByRole('status')).toHaveTextContent(DEFAULT_LABELS.reconnecting)

      act(() => transport.setStatus('open'))
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  describe('ciclo de vida', () => {
    it('con transporte propio abre el canal y lo cierra al desmontarse', async () => {
      const transport = new InMemoryTransport()
      const { unmount } = render(<ChatWidget transport={transport} />)

      await waitFor(() => expect(transport.status).toBe('open'))
      unmount()
      expect(transport.status).toBe('closed')
    })

    it('con cliente inyectado no lo destruye al desmontarse', async () => {
      const { client, transport } = await manualClient()
      const { unmount } = render(<ChatWidget client={client} />)

      unmount()
      expect(transport.status).toBe('open')
      await expect(client.sendMessage('sigo vivo')).resolves.toMatchObject({ ok: true })
    })
  })
})
