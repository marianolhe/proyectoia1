import { createContext, useContext } from 'react'

/**
 * Politica de destinos del widget.
 *
 * El agente puede pedir que se pinte una imagen o que se abra una pestania
 * sin que el usuario haga clic. El backend ya valida esos destinos, pero el
 * widget corre en el sitio de un cliente y no debe fiarse de lo que llega por
 * el canal: repite la validacion contra su propia lista. Si el backend fuera
 * comprometido, lo peor que podria abrir es una pagina de esta lista.
 */
export interface WidgetPolicy {
  /** Servidores desde los que se aceptan imagenes. */
  readonly imageHosts: readonly string[]
  /** Sitios que el agente puede abrir en una pestania nueva. */
  readonly openUrlHosts: readonly string[]
}

export const DEFAULT_POLICY: WidgetPolicy = {
  imageHosts: ['image.tmdb.org', 'books.google.com'],
  openUrlHosts: ['www.imdb.com', 'books.google.com'],
}

export function resolvePolicy(overrides: Partial<WidgetPolicy> | undefined): WidgetPolicy {
  return overrides === undefined ? DEFAULT_POLICY : { ...DEFAULT_POLICY, ...overrides }
}

export function isAllowedUrl(candidate: string | undefined, hosts: readonly string[]): boolean {
  if (candidate === undefined) return false
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  return hosts.includes(url.hostname)
}

/**
 * Se reparte por contexto para no pasar la politica por cada componente
 * intermedio. El valor por defecto es la politica estricta, de modo que un
 * componente usado suelto tambien queda protegido.
 */
export const PolicyContext = createContext<WidgetPolicy>(DEFAULT_POLICY)

export function usePolicy(): WidgetPolicy {
  return useContext(PolicyContext)
}
