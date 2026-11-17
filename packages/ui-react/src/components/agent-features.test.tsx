import { ChatClient, InMemoryTransport } from '@agichat/core'
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LABELS } from '../labels.js'
import { ChatWidget } from './chat-widget.js'

/**
 * Lo que el widget gano en el proyecto 2: poster, pestanias que se abren
 * solas, atribucion de la fuente y una lista blanca de destinos propia.
 */

const POSTER = 'https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg'
const IMDB = 'https://www.imdb.com/title/tt1160419/'

async function manualClient() {
  const transport = new InMemoryTransport()
  const client = new ChatClient({ transport })
  await client.connect()
  return { client, transport }
}

function replyWithImage(transport: InMemoryTransport, url: string) {
  act(() => {
    transport.emit({ type: 'message.start', messageId: 'r1' })
    transport.emit({ type: 'message.delta', messageId: 'r1', text: 'Te recomiendo **Duna**.' })
    transport.emit({ type: 'message.image', messageId: 'r1', url, alt: 'Póster de Duna' })
    transport.emit({ type: 'message.end', messageId: 'r1' })
  })
}

function openAction(transport: InMemoryTransport, url = IMDB, actionId = 'a1') {
  act(() => transport.emit({ type: 'action.open_url', actionId, url, title: 'IMDb: Duna' }))
}

describe('ChatWidget con el agente del proyecto 2', () => {
  describe('poster', () => {
    it('muestra el poster que envia el agente', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      replyWithImage(transport, POSTER)

      const image = screen.getByRole('img', { name: 'Póster de Duna' })
      expect(image).toHaveAttribute('src', POSTER)
      expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
    })

    it('no pinta imagenes de un servidor fuera de la lista', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      replyWithImage(transport, 'https://evil.example/c.png?d=secreto')

      expect(screen.queryByRole('img')).toBeNull()
    })

    it('el integrador puede ampliar la lista de servidores de imagenes', async () => {
      const { client, transport } = await manualClient()
      render(
        <ChatWidget client={client} launcher={false} policy={{ imageHosts: ['cdn.example'] }} />,
      )
      replyWithImage(transport, 'https://cdn.example/a.png')

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.example/a.png')
    })

    it('reemplaza por su texto una imagen Markdown externa', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      act(() => transport.respondWith('Mira ![espia](https://evil.example/x.png) y ya', 'r1'))

      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.getByText(/espia/)).toBeInTheDocument()
    })

    it('pinta una imagen Markdown de la lista permitida', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      act(() => transport.respondWith(`![Duna](${POSTER})`, 'r1'))

      expect(screen.getByRole('img', { name: 'Duna' })).toHaveAttribute('src', POSTER)
    })
  })

  describe('pestanias', () => {
    it('abre la pestania sin clic y avisa al usuario', async () => {
      const { client, transport } = await manualClient()
      const openUrl = vi.fn(() => true)
      render(<ChatWidget client={client} launcher={false} openUrl={openUrl} />)
      openAction(transport)

      await waitFor(() => expect(openUrl).toHaveBeenCalledWith(IMDB))
      expect(screen.getByRole('status')).toHaveTextContent(DEFAULT_LABELS.tabOpened)
      expect(screen.getByRole('link', { name: 'IMDb: Duna' })).toHaveAttribute('href', IMDB)
    })

    it('si el navegador la bloquea ofrece el enlace para abrirla a mano', async () => {
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} openUrl={() => false} />)
      openAction(transport)

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(DEFAULT_LABELS.tabBlocked),
      )
      expect(client.getState().actions[0]?.status).toBe('blocked')
    })

    it('nunca abre ni ofrece un destino fuera de la lista', async () => {
      const { client, transport } = await manualClient()
      const openUrl = vi.fn(() => true)
      render(<ChatWidget client={client} launcher={false} openUrl={openUrl} />)
      openAction(transport, 'https://evil.example/premio')

      await waitFor(() => expect(client.getState().actions[0]?.status).toBe('blocked'))
      expect(openUrl).not.toHaveBeenCalled()
      expect(screen.queryByRole('link', { name: 'IMDb: Duna' })).toBeNull()
    })

    it('abre cada accion una sola vez aunque el widget se vuelva a pintar', async () => {
      const { client, transport } = await manualClient()
      const openUrl = vi.fn(() => true)
      const { rerender } = render(<ChatWidget client={client} launcher={false} openUrl={openUrl} />)
      openAction(transport)
      act(() => transport.respondWith('otra respuesta', 'r2'))
      rerender(<ChatWidget client={client} launcher={false} openUrl={openUrl} />)

      await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1))
    })

    it('por defecto usa window.open y corta window.opener', async () => {
      const opened = { opener: 'pagina' as unknown }
      const spy = vi.spyOn(window, 'open').mockReturnValue(opened as Window)
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      openAction(transport)

      await waitFor(() => expect(spy).toHaveBeenCalledWith(IMDB, '_blank'))
      expect(opened.opener).toBeNull()
      spy.mockRestore()
    })

    it('window.open bloqueado se registra como bloqueado', async () => {
      const spy = vi.spyOn(window, 'open').mockReturnValue(null)
      const { client, transport } = await manualClient()
      render(<ChatWidget client={client} launcher={false} />)
      openAction(transport)

      await waitFor(() => expect(client.getState().actions[0]?.status).toBe('blocked'))
      spy.mockRestore()
    })
  })

  describe('atribucion', () => {
    it('muestra el aviso de la fuente con enlace', () => {
      render(
        <ChatWidget
          transport={new InMemoryTransport()}
          launcher={false}
          attribution={{
            text: 'Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.',
            href: 'https://www.themoviedb.org/',
          }}
        />,
      )

      expect(screen.getByText(/no está avalado ni certificado por TMDB/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'themoviedb.org' })).toHaveAttribute(
        'href',
        'https://www.themoviedb.org/',
      )
    })

    it('puede mostrar un logo en lugar del nombre del sitio', () => {
      render(
        <ChatWidget
          transport={new InMemoryTransport()}
          launcher={false}
          attribution={{
            text: 'Datos de TMDB',
            href: 'https://www.themoviedb.org/',
            logoSrc: 'https://example.test/tmdb.svg',
            logoAlt: 'TMDB',
          }}
        />,
      )

      expect(screen.getByRole('link', { name: 'TMDB' })).toContainElement(
        screen.getByRole('img', { name: 'TMDB' }),
      )
    })

    it('admite logo sin enlace y texto solo', () => {
      const { rerender } = render(
        <ChatWidget
          transport={new InMemoryTransport()}
          launcher={false}
          attribution={{ text: 'Fuente A', logoSrc: 'https://example.test/a.svg' }}
        />,
      )
      expect(screen.getByText('Fuente A')).toBeInTheDocument()
      expect(screen.queryByRole('link')).toBeNull()

      rerender(
        <ChatWidget
          transport={new InMemoryTransport()}
          launcher={false}
          attribution={{ text: 'B' }}
        />,
      )
      expect(screen.getByText('B')).toBeInTheDocument()
    })
  })
})
