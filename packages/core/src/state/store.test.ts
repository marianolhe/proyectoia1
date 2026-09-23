import { describe, expect, it, vi } from 'vitest'
import { createStore } from './store.js'

type CounterAction = { type: 'inc' } | { type: 'noop' }

const counterReducer = (state: number, action: CounterAction): number =>
  action.type === 'inc' ? state + 1 : state

describe('createStore', () => {
  it('expone el estado inicial', () => {
    expect(createStore(counterReducer, 7).getSnapshot()).toBe(7)
  })

  it('aplica el reductor y notifica a los suscriptores', () => {
    const store = createStore(counterReducer, 0)
    const listener = vi.fn()
    store.subscribe(listener)

    store.dispatch({ type: 'inc' })

    expect(store.getSnapshot()).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('no notifica cuando el reductor devuelve el mismo estado', () => {
    const store = createStore(counterReducer, 0)
    const listener = vi.fn()
    store.subscribe(listener)

    store.dispatch({ type: 'noop' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('deja de notificar tras darse de baja', () => {
    const store = createStore(counterReducer, 0)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.dispatch({ type: 'inc' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('tolera que un suscriptor se de de baja durante la notificacion', () => {
    const store = createStore(counterReducer, 0)
    const second = vi.fn()
    const unsubscribeFirst = store.subscribe(() => {
      unsubscribeFirst()
    })
    store.subscribe(second)

    expect(() => {
      store.dispatch({ type: 'inc' })
    }).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
