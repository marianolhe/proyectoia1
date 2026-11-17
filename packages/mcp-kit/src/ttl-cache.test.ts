import { describe, expect, it, vi } from 'vitest'
import { TtlCache } from './ttl-cache.js'

function clock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('TtlCache', () => {
  it('devuelve lo guardado hasta que vence', () => {
    const time = clock()
    const cache = new TtlCache<string>({ ttlMs: 100, now: time.now })
    cache.set('a', 'uno')

    time.advance(99)
    expect(cache.get('a')).toBe('uno')
    time.advance(1)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('descarta la entrada mas antigua al llenarse', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10)
    cache.set('c', 3)

    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(10)
    expect(cache.get('c')).toBe(3)
  })

  it('getOrLoad carga una vez y despues sirve del cache', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    const load = vi.fn(() => Promise.resolve('valor'))

    await cache.getOrLoad('k', load)
    await cache.getOrLoad('k', load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('dos peticiones simultaneas comparten la misma carga', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    let resolve: (value: string) => void = () => {}
    const load = vi.fn(() => new Promise<string>((res) => (resolve = res)))

    const first = cache.getOrLoad('k', load)
    const second = cache.getOrLoad('k', load)
    resolve('listo')

    await expect(Promise.all([first, second])).resolves.toEqual(['listo', 'listo'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('no guarda lo que shouldCache rechaza', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    const load = vi.fn(() => Promise.resolve('error'))

    await cache.getOrLoad('k', load, () => false)
    await cache.getOrLoad('k', load, () => false)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('una carga que falla no queda atascada', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    await expect(cache.getOrLoad('k', () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(cache.getOrLoad('k', () => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})
