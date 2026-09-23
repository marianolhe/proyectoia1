/**
 * Almacen observable minimo.
 *
 * Se implementa a mano, en unas pocas lineas, en lugar de traer Redux o Zustand:
 * el nucleo debe quedar sin dependencias de runtime para que integrarlo en el
 * sitio de un cliente no arrastre peso ni conflictos de versiones. La forma de
 * la interfaz (`getSnapshot` mas `subscribe`) es exactamente la que espera
 * `useSyncExternalStore` de React, asi que la capa de UI no necesita adaptador.
 */
export interface Store<TState, TAction> {
  getSnapshot(): TState
  dispatch(action: TAction): void
  subscribe(listener: () => void): () => void
}

export type Reducer<TState, TAction> = (state: TState, action: TAction) => TState

export function createStore<TState, TAction>(
  reducer: Reducer<TState, TAction>,
  initialState: TState,
): Store<TState, TAction> {
  let state = initialState
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,

    dispatch(action) {
      const next = reducer(state, action)
      // El reductor devuelve la misma referencia cuando la accion no cambia
      // nada. Comparar por identidad evita repintados inutiles durante el
      // streaming, que es donde mas acciones por segundo llegan.
      if (next === state) return

      state = next
      // Se itera sobre una copia: un oyente puede darse de baja durante la
      // notificacion sin corromper el recorrido.
      for (const listener of [...listeners]) listener()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
