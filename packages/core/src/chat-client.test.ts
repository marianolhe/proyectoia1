import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from './chat-client.js'
import type { ChatTransport } from './ports/transport.js'
import { InMemoryTransport } from './testing/in-memory-transport.js'

/** Generador determinista para que los identificadores sean predecibles. */
function sequentialIds(prefix = 'id'): () => string {
  let counter = 0
  return () => `${prefix}-${++counter}`
}

/** Cliente conectado y listo para enviar, que es el caso habitual. */
async function connectedClient(transport = new InMemoryTransport()) {
  const client = new ChatClient({
    transport,
    conversationId: 'conv-1',
    createMessageId: sequentialIds('msg'),
    now: () => 1000,
  })
  await client.connect()
  return { client, transport }
}

describe('ChatClient', () => {
  let client: ChatClient
  let transport: InMemoryTransport

  beforeEach(async () => {
    ;({ client, transport } = await connectedClient())
  })

  describe('conexion', () => {
    it('refleja el estado del canal en el estado de la conversacion', () => {
      expect(client.getState().connection).toBe('open')
    })

    it('no intenta conectar despues de destruirse', async () => {
      const spy = vi.spyOn(transport, 'connect')
      client.destroy()

      await client.connect()

      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('sendMessage', () => {
    it('agrega el mensaje al hilo y lo entrega al transporte', async () => {
      const result = await client.sendMessage('Hola')

      expect(result).toEqual({ ok: true, messageId: 'msg-1' })
      expect(transport.sent).toEqual([
        { conversationId: 'conv-1', messageId: 'msg-1', text: 'Hola' },
      ])
      expect(client.getState().messages[0]).toMatchObject({ role: 'user', content: 'Hola' })
    })

    it('recorta los espacios antes de enviar', async () => {
      await client.sendMessage('   Hola   ')

      expect(transport.sent[0]?.text).toBe('Hola')
    })

    it('rechaza texto vacio o solo espacios sin tocar el transporte', async () => {
      expect(await client.sendMessage('   ')).toEqual({ ok: false, reason: 'empty' })
      expect(transport.sent).toHaveLength(0)
    })

    it('rechaza un envio mientras el agente responde', async () => {
      await client.sendMessage('Primera')
      transport.emit({ type: 'message.start', messageId: 'a1' })

      expect(await client.sendMessage('Segunda')).toEqual({ ok: false, reason: 'busy' })
    })

    it('rechaza el envio con el canal cerrado', async () => {
      const desconectado = new ChatClient({ transport: new InMemoryTransport() })

      expect(await desconectado.sendMessage('Hola')).toEqual({ ok: false, reason: 'disconnected' })
    })

    it('conserva el mensaje del usuario y registra el error si el envio falla', async () => {
      const failing = new InMemoryTransport({ failOnSend: true })
      const { client: withFailure } = await connectedClient(failing)

      const result = await withFailure.sendMessage('Hola')

      expect(result).toEqual({ ok: false, reason: 'failed' })
      // El texto no desaparece de la pantalla solo porque la red fallo.
      expect(withFailure.getState().messages[0]?.content).toBe('Hola')
      expect(withFailure.getState().error).toMatchObject({
        code: 'send_failed',
        message: 'Fallo simulado de envio',
        recoverable: true,
      })
    })

    it('usa un mensaje generico cuando el fallo no es un Error', async () => {
      const rare: ChatTransport = {
        status: 'open',
        connect: () => Promise.resolve(),
        send: () => Promise.reject('cadena suelta'),
        subscribe: () => () => {},
        disconnect: () => {},
      }
      // El transporte anuncia el canal abierto al suscribirse, que es como se
      // entera el cliente en el flujo normal.
      const withStatus = new ChatClient({
        transport: {
          ...rare,
          subscribe: (listener) => {
            listener({ type: 'status', status: 'open' })
            return () => {}
          },
        },
      })

      const result = await withStatus.sendMessage('Hola')

      expect(result).toEqual({ ok: false, reason: 'failed' })
      expect(withStatus.getState().error?.message).toBe('No se pudo enviar el mensaje.')
    })
  })

  describe('eventos del agente', () => {
    it('traduce el streaming completo a un mensaje del asistente', async () => {
      await client.sendMessage('Hola')
      transport.respondWith('# Titulo\n\nTexto en **Markdown**.', 'a1')

      const { messages, phase } = client.getState()
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        content: '# Titulo\n\nTexto en **Markdown**.',
        status: 'complete',
      })
      expect(phase).toBe('idle')
    })

    it('traduce un error del agente a error de conversacion', () => {
      transport.failWith('agent_timeout', 'El agente tardo demasiado.', true)

      expect(client.getState().error).toEqual({
        code: 'agent_timeout',
        message: 'El agente tardo demasiado.',
        recoverable: true,
      })
    })

    it('notifica a los suscriptores en cada cambio', async () => {
      const listener = vi.fn()
      client.subscribe(listener)

      await client.sendMessage('Hola')

      expect(listener).toHaveBeenCalled()
    })
  })

  describe('ciclo de vida', () => {
    it('resetConversation vacia el hilo y mantiene el canal', async () => {
      await client.sendMessage('Hola')

      client.resetConversation('conv-2')

      expect(client.getState().messages).toHaveLength(0)
      expect(client.getState().conversationId).toBe('conv-2')
      expect(client.getState().connection).toBe('open')
    })

    it('resetConversation genera un identificador si no se le da uno', async () => {
      await client.sendMessage('Hola')

      client.resetConversation()

      expect(client.getState().conversationId).toBeTruthy()
      expect(client.getState().messages).toHaveLength(0)
    })

    it('destroy cierra el transporte y deja de escuchar eventos', () => {
      const disconnect = vi.spyOn(transport, 'disconnect')

      client.destroy()

      expect(disconnect).toHaveBeenCalledOnce()
    })

    it('destroy es idempotente', () => {
      const disconnect = vi.spyOn(transport, 'disconnect')

      client.destroy()
      client.destroy()

      expect(disconnect).toHaveBeenCalledOnce()
    })

    it('genera un identificador de conversacion si no se le proporciona', () => {
      const anonymous = new ChatClient({ transport: new InMemoryTransport() })

      expect(anonymous.getState().conversationId).toBeTruthy()
    })
  })
})
