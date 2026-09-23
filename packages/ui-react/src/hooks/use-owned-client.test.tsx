import { InMemoryTransport, type ChatTransport } from '@agichat/core'
import { renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useOwnedClient } from './use-owned-client.js'

describe('useOwnedClient', () => {
  it('sin transporte no crea cliente', () => {
    const { result } = renderHook(() => useOwnedClient(null))
    expect(result.current).toBeNull()
  })

  it('crea el cliente y abre el canal al montarse', async () => {
    const transport = new InMemoryTransport()
    const { result } = renderHook(() => useOwnedClient(transport))

    await waitFor(() => expect(result.current?.getState().connection).toBe('open'))
    expect(transport.status).toBe('open')
  })

  it('cierra el canal al desmontarse', async () => {
    const transport = new InMemoryTransport()
    const { result, unmount } = renderHook(() => useOwnedClient(transport))
    await waitFor(() => expect(result.current).not.toBeNull())

    unmount()
    expect(transport.status).toBe('closed')
  })

  it('sobrevive al doble montaje del modo estricto', async () => {
    const transport = new InMemoryTransport()
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => useOwnedClient(transport), { wrapper })

    // Tras montar, desmontar y volver a montar, el cliente vigente debe seguir
    // vivo y conectado, no ser el que se destruyo en el primer ciclo.
    await waitFor(() => expect(result.current?.getState().connection).toBe('open'))
    expect(transport.status).toBe('open')
  })

  it('no deja rechazos sin capturar si conectar falla', async () => {
    const connect = vi.fn(() => Promise.reject(new Error('sin red')))
    const transport: ChatTransport = {
      status: 'idle',
      connect,
      send: () => Promise.resolve(),
      subscribe: () => () => {},
      disconnect: () => {},
    }

    const { result } = renderHook(() => useOwnedClient(transport))

    await waitFor(() => expect(connect).toHaveBeenCalled())
    expect(result.current).not.toBeNull()
  })
})
