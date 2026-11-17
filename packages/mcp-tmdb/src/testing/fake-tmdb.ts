import type { FetchLike } from '@agichat/mcp-kit'
import { vi } from 'vitest'

/**
 * Doble de la API de TMDB para las pruebas de este paquete. Responde segun
 * la ruta y guarda cada URL pedida para revisar parametros y credenciales.
 */

export const DUNE = {
  id: 438631,
  title: 'Duna',
  original_title: 'Dune',
  release_date: '2021-09-15',
  overview: 'Paul Atreides viaja a Arrakis.',
  vote_average: 7.8,
  vote_count: 12000,
  poster_path: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
}

export const DUNE_DETAILS = {
  ...DUNE,
  runtime: 155,
  genres: [{ id: 878, name: 'Ciencia ficción' }],
  external_ids: { imdb_id: 'tt1160419' },
  keywords: { keywords: [{ id: 1, name: 'based on novel or book' }] },
}

export type Route = (url: URL) => { status: number; body: unknown }

export function fakeTmdb(route: Route) {
  const urls: URL[] = []
  const fetch = vi.fn<FetchLike>((raw) => {
    const url = new URL(raw)
    urls.push(url)
    const { status, body } = route(url)
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  })
  return { fetch, urls }
}

/** Ruta tipica: busqueda, descubrimiento y la ficha de Duna. */
export const defaultRoute: Route = (url) => {
  const path = url.pathname.replace('/3', '')
  if (path === '/search/movie' || path === '/discover/movie' || path.endsWith('/recommendations')) {
    return { status: 200, body: { results: [DUNE] } }
  }
  if (path === `/movie/${DUNE.id}`) return { status: 200, body: DUNE_DETAILS }
  return { status: 404, body: { status_message: 'not found' } }
}
