import type { FetchLike } from '@agichat/mcp-kit'
import { vi } from 'vitest'

/** Doble de la API de Google Books para las pruebas de este paquete. */

export const DUNE_BOOK = {
  id: 'B1hSG45JCX4C',
  volumeInfo: {
    title: 'Dune',
    authors: ['Frank Herbert'],
    publishedDate: '1965-08-01',
    description: '<p>La novela de <b>ciencia ficción</b> más vendida.</p>',
    averageRating: 4.5,
    ratingsCount: 3100,
    pageCount: 688,
  },
}

export const DUNE_SCREENPLAY = {
  id: 'zpvysRGsBlwC',
  volumeInfo: {
    title: 'Dune',
    subtitle: 'The Screenplay',
    authors: ['Varios'],
    publishedDate: '2021',
  },
}

export type Route = (url: URL) => { status: number; body: unknown }

export function fakeBooks(route: Route) {
  const urls: URL[] = []
  const fetch = vi.fn<FetchLike>((raw) => {
    const url = new URL(raw)
    urls.push(url)
    const { status, body } = route(url)
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  })
  return { fetch, urls }
}

export const defaultRoute: Route = (url) => {
  const path = url.pathname.replace('/books/v1', '')
  if (path === '/volumes') {
    const query = url.searchParams.get('q') ?? ''
    return query.toLowerCase().includes('dune')
      ? { status: 200, body: { items: [DUNE_SCREENPLAY, DUNE_BOOK] } }
      : { status: 200, body: { totalItems: 0 } }
  }
  if (path === `/volumes/${DUNE_BOOK.id}`) return { status: 200, body: DUNE_BOOK }
  return { status: 404, body: { error: 'not found' } }
}
