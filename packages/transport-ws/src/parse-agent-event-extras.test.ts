import { describe, expect, it } from 'vitest'
import { parseAgentEvent } from './parse-agent-event.js'

const json = (value: unknown) => JSON.stringify(value)

describe('parseAgentEvent: eventos del proyecto 2', () => {
  it('acepta una imagen https', () => {
    const event = {
      type: 'message.image',
      messageId: 'r1',
      url: 'https://image.tmdb.org/t/p/w342/a.jpg',
      alt: 'Póster',
    }
    expect(parseAgentEvent(json(event))).toEqual(event)
  })

  it('acepta una accion de abrir pestania', () => {
    const event = {
      type: 'action.open_url',
      actionId: 'a1',
      url: 'https://www.imdb.com/title/tt1/',
      title: 'IMDb',
    }
    expect(parseAgentEvent(json(event))).toEqual(event)
  })

  it('completa alt y title ausentes con texto vacio', () => {
    expect(
      parseAgentEvent(json({ type: 'message.image', messageId: 'r', url: 'https://a.b/c.png' })),
    ).toMatchObject({ alt: '' })
    expect(
      parseAgentEvent(json({ type: 'action.open_url', actionId: 'a', url: 'https://a.b/' })),
    ).toMatchObject({ title: '' })
  })

  it.each([
    [{ type: 'message.image', url: 'https://a.b/c.png' }, 'falta messageId'],
    [{ type: 'message.image', messageId: 'r', url: 'javascript:alert(1)' }, 'url de imagen'],
    [{ type: 'message.image', messageId: 'r', url: 'http://a.b/c.png' }, 'url de imagen'],
    [{ type: 'message.image', messageId: 'r', url: 'no es url' }, 'url de imagen'],
    [{ type: 'action.open_url', url: 'https://a.b/' }, 'falta actionId'],
    [{ type: 'action.open_url', actionId: 'a', url: 'data:text/html,x' }, 'url de accion'],
    [{ type: 'action.open_url', actionId: 'a', url: 42 }, 'url de accion'],
  ])('rechaza %j', (frame, reason) => {
    const event = parseAgentEvent(json(frame))
    expect(event).toMatchObject({ type: 'error', code: 'invalid_event' })
    expect(event.type === 'error' && event.message).toContain(reason)
  })
})
