import { ChatClient, InMemoryTransport } from '@agichat/core'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GFM_MARKDOWN, XSS_PROBE_MARKDOWN } from '../testing/fixtures.js'
import { ChatWidget } from './chat-widget.js'
import { MarkdownMessage } from './markdown-message.js'

/** Revisa que ningun vector del payload haya llegado vivo al DOM. */
function expectNoActiveContent(root: HTMLElement) {
  expect(root.querySelector('script')).toBeNull()
  expect(root.querySelector('iframe, object, embed')).toBeNull()
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.getAttributeNames()) {
      expect(attribute.startsWith('on'), `atributo ${attribute} en <${element.tagName}>`).toBe(
        false,
      )
    }
  }
  for (const link of root.querySelectorAll('a')) {
    expect(link.getAttribute('href') ?? '').not.toMatch(/^\s*javascript:/i)
  }
}

describe('MarkdownMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza Markdown con extensiones GFM', () => {
    const { container } = render(<MarkdownMessage content={GFM_MARKDOWN} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Proximos pasos' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '9 h' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(container.querySelector('del')).toHaveTextContent('obsoleto')
    expect(container.querySelector('strong')).toHaveTextContent('negritas')
  })

  it('abre los enlaces fuera del sitio sin exponer window.opener', () => {
    render(<MarkdownMessage content={GFM_MARKDOWN} />)

    const link = screen.getByRole('link', { name: 'el panel' })
    expect(link).toHaveAttribute('href', 'https://agichat.example.com/tracking')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  describe('contenido malicioso del agente', () => {
    it('no deja script, manejadores ni enlaces javascript: en el DOM', () => {
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const { container } = render(<MarkdownMessage content={XSS_PROBE_MARKDOWN} />)

      expectNoActiveContent(container)
      expect(alert).not.toHaveBeenCalled()
      // El texto legitimo de la respuesta si se muestra.
      expect(screen.getByRole('heading', { name: 'Aviso de prueba' })).toBeInTheDocument()
    })

    it('conserva el texto del enlace pero neutraliza su destino', () => {
      render(<MarkdownMessage content={XSS_PROBE_MARKDOWN} />)

      const suspicious = screen.getByText('enlace sospechoso')
      const href = suspicious.closest('a')?.getAttribute('href') ?? ''
      expect(href).not.toMatch(/javascript:/i)
    })

    it('tampoco ejecuta nada cuando llega troceado por el transporte', async () => {
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const transport = new InMemoryTransport({ chunkSize: 5 })
      const client = new ChatClient({ transport })
      await client.connect()
      const { container } = render(<ChatWidget client={client} launcher={false} />)

      await client.sendMessage('muestrame html')
      transport.respondWith(XSS_PROBE_MARKDOWN, 'xss-1')

      expect(await screen.findByRole('heading', { name: 'Aviso de prueba' })).toBeInTheDocument()
      expectNoActiveContent(container)
      expect(alert).not.toHaveBeenCalled()
    })
  })
})
