import {
  defineTool,
  fail,
  type ApiResult,
  type ToolDefinition,
  type ToolOutcome,
} from '@agichat/mcp-kit'
import { z } from 'zod'
import { rankBooks, type MovieReference } from './book-matcher.js'
import { isVolumeId, parseBook, parseBookList, type BookSummary } from './book-parser.js'
import type { BooksClient } from './books-client.js'
import { compareMovieWithBook } from './compare.js'

/**
 * Herramientas MCP de libros.
 *
 * Este servidor no conoce TMDB: la comparacion recibe las calificaciones de la
 * pelicula como argumentos. Asi los dos servidores se despliegan y escalan por
 * separado, y otro agente puede usar este con cualquier fuente de peliculas.
 */

const MAX_ALTERNATIVES = 3

const volumeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{6,24}$/)
  .describe('Identificador del volumen en Google Books')

function apiFailure(result: Extract<ApiResult, { ok: false }>): ToolOutcome {
  if (result.code === 'http' && result.status === 404) {
    return fail('not_found', 'Google Books no tiene un libro con ese identificador.')
  }
  return fail(result.code, result.message)
}

async function loadBook(
  client: BooksClient,
  id: string,
): Promise<
  { readonly ok: true; readonly book: BookSummary } | { readonly ok: false; outcome: ToolOutcome }
> {
  const result = await client.volume(id)
  if (!result.ok) return { ok: false, outcome: apiFailure(result) }
  const book = parseBook(result.data)
  if (book === null) {
    return {
      ok: false,
      outcome: fail('invalid_response', 'Google Books devolvio una ficha incompleta.'),
    }
  }
  return { ok: true, book }
}

export function createBooksTools(client: BooksClient): ToolDefinition[] {
  return [
    defineTool({
      name: 'books_find_for_movie',
      title: 'Buscar el libro de una pelicula',
      description:
        'Busca en Google Books el libro en el que se basa una pelicula. Devuelve `found: false` si no hay un libro que coincida; en ese caso digale al usuario que la pelicula no tiene libro y no invente uno.',
      inputSchema: {
        movie_title: z.string().min(1).max(160).describe('Titulo de la pelicula'),
        original_title: z
          .string()
          .min(1)
          .max(160)
          .optional()
          .describe('Titulo original, si es distinto'),
        release_year: z
          .number()
          .int()
          .min(1880)
          .max(2100)
          .optional()
          .describe('Anio de estreno de la pelicula'),
      },
      handler: async ({ movie_title, original_title, release_year }) => {
        const movie: MovieReference = {
          title: movie_title,
          ...(original_title === undefined ? {} : { originalTitle: original_title }),
          ...(release_year === undefined ? {} : { releaseYear: release_year }),
        }
        // El titulo original suele ser el del libro; se intenta primero y el
        // traducido solo si hace falta, para no gastar dos consultas siempre.
        const queries = [...new Set([original_title ?? movie_title, movie_title])]

        for (const query of queries) {
          const result = await client.searchByTitle(query)
          if (!result.ok) return apiFailure(result)
          const [best, ...rest] = rankBooks(parseBookList(result.data), movie)
          if (best !== undefined) {
            return {
              ok: true,
              data: {
                found: true,
                book: best.book,
                alternatives: rest.slice(0, MAX_ALTERNATIVES).map((match) => match.book),
              },
            }
          }
        }
        return {
          ok: true,
          data: {
            found: false,
            message: `No se encontro en Google Books un libro que corresponda a "${movie_title}".`,
          },
        }
      },
    }),

    defineTool({
      name: 'books_details',
      title: 'Ficha de un libro',
      description:
        'Devuelve la ficha de un libro de Google Books: autores, sinopsis, calificacion (0 a 5), numero de calificaciones y enlace.',
      inputSchema: { volume_id: volumeId },
      handler: async ({ volume_id }) => {
        const loaded = await loadBook(client, volume_id)
        return loaded.ok ? { ok: true, data: { book: loaded.book } } : loaded.outcome
      },
    }),

    defineTool({
      name: 'books_compare_with_movie',
      title: 'Comparar pelicula y libro',
      description:
        'Compara la calificacion de una pelicula (TMDB, 0 a 10) con la de su libro (Google Books, 0 a 5) y devuelve un veredicto sobre si vale la pena ver la pelicula. Use los datos de tmdb_movie_details y books_find_for_movie; no invente calificaciones.',
      inputSchema: {
        movie_title: z.string().min(1).max(160),
        movie_rating: z.number().min(0).max(10).describe('voteAverage de TMDB'),
        movie_vote_count: z.number().int().min(0).describe('voteCount de TMDB'),
        book_title: z.string().min(1).max(200),
        book_rating: z
          .number()
          .min(0)
          .max(5)
          .optional()
          .describe('averageRating de Google Books; omitalo si es null'),
        book_ratings_count: z.number().int().min(0).optional(),
      },
      handler: async (args) => ({
        ok: true,
        data: {
          comparison: compareMovieWithBook({
            movieTitle: args.movie_title,
            movieRating: args.movie_rating,
            movieVoteCount: args.movie_vote_count,
            bookTitle: args.book_title,
            ...(args.book_rating === undefined ? {} : { bookRating: args.book_rating }),
            ...(args.book_ratings_count === undefined
              ? {}
              : { bookRatingsCount: args.book_ratings_count }),
          }),
        },
      }),
    }),

    defineTool({
      name: 'books_open_google_books',
      title: 'Abrir Google Books',
      description:
        'Abre en una pestania nueva del navegador del usuario la pagina de Google Books de un libro. Usela cuando el usuario quiera ver el libro o pida abrir Google Books.',
      inputSchema: { volume_id: volumeId },
      handler: async ({ volume_id }) => {
        // El esquema ya lo valida; se repite porque `handler` tambien se
        // puede invocar sin pasar por el SDK.
        if (!isVolumeId(volume_id)) return fail('invalid_id', 'Identificador de libro invalido.')
        const loaded = await loadBook(client, volume_id)
        if (!loaded.ok) return loaded.outcome
        const { book } = loaded
        return {
          ok: true,
          data: { opened: true, title: book.title, url: book.googleBooksUrl },
          ui: [
            { type: 'open_url', url: book.googleBooksUrl, title: `Google Books: ${book.title}` },
          ],
        }
      },
    }),
  ]
}
