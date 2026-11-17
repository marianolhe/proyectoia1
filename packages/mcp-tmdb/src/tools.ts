import {
  defineTool,
  fail,
  type ApiResult,
  type ToolDefinition,
  type ToolOutcome,
} from '@agichat/mcp-kit'
import { z } from 'zod'
import { GENRE_IDS, GENRE_NAMES } from './genres.js'
import { parseMovieDetails, parseMovieList, type MovieDetails } from './movie-parser.js'
import type { DiscoverSort, TmdbClient } from './tmdb-client.js'

/**
 * Herramientas MCP de peliculas.
 *
 * Mostrar el poster y abrir IMDb son herramientas propias y no un campo mas de
 * la ficha: asi es el agente quien decide cuando hacerlo, pero la URL la
 * construye este servidor a partir del identificador de TMDB.
 */

const MAX_RESULTS = 6
const ATTRIBUTION = 'Datos e imagenes de TMDB (themoviedb.org).'

const SORT_OPTIONS = {
  popularidad: 'popularity.desc',
  calificacion: 'vote_average.desc',
  recientes: 'primary_release_date.desc',
} as const satisfies Record<string, DiscoverSort>

const movieId = z.number().int().positive().describe('Identificador numerico de TMDB')

function apiFailure(result: Extract<ApiResult, { ok: false }>): ToolOutcome {
  if (result.code === 'http' && result.status === 404) {
    return fail('not_found', 'TMDB no tiene una pelicula con ese identificador.')
  }
  return fail(result.code, result.message)
}

function listOutcome(result: ApiResult): ToolOutcome {
  if (!result.ok) return apiFailure(result)
  const movies = parseMovieList(result.data, MAX_RESULTS)
  return { ok: true, data: { movies, count: movies.length, attribution: ATTRIBUTION } }
}

async function loadDetails(
  client: TmdbClient,
  id: number,
): Promise<
  { readonly ok: true; readonly movie: MovieDetails } | { readonly ok: false; outcome: ToolOutcome }
> {
  const result = await client.movieDetails(id)
  if (!result.ok) return { ok: false, outcome: apiFailure(result) }
  const movie = parseMovieDetails(result.data)
  if (movie === null) {
    return { ok: false, outcome: fail('invalid_response', 'TMDB devolvio una ficha incompleta.') }
  }
  return { ok: true, movie }
}

export function createTmdbTools(client: TmdbClient): ToolDefinition[] {
  return [
    defineTool({
      name: 'tmdb_search_movies',
      title: 'Buscar peliculas',
      description:
        'Busca peliculas por titulo en The Movie Database. Usela cuando el usuario mencione una pelicula concreta. Devuelve hasta 6 resultados con id, titulo, anio, sinopsis y calificacion (0 a 10).',
      inputSchema: {
        query: z.string().min(1).max(120).describe('Titulo o parte del titulo'),
        year: z.number().int().min(1880).max(2100).optional().describe('Anio de estreno'),
      },
      handler: async ({ query, year }) => listOutcome(await client.searchMovies(query, year)),
    }),

    defineTool({
      name: 'tmdb_discover_movies',
      title: 'Recomendar peliculas',
      description:
        'Encuentra peliculas para recomendar segun genero, anio y calificacion minima. Usela cuando el usuario pida una recomendacion sin nombrar una pelicula concreta.',
      inputSchema: {
        genre: z.enum(GENRE_NAMES).optional().describe('Genero de la pelicula'),
        year: z.number().int().min(1880).max(2100).optional().describe('Anio de estreno'),
        min_rating: z.number().min(0).max(10).optional().describe('Calificacion minima de 0 a 10'),
        sort_by: z
          .enum(['popularidad', 'calificacion', 'recientes'])
          .optional()
          .describe('Criterio de orden; por defecto, popularidad'),
      },
      handler: async ({ genre, year, min_rating, sort_by }) =>
        listOutcome(
          await client.discoverMovies({
            ...(genre === undefined ? {} : { genreId: GENRE_IDS[genre] }),
            ...(year === undefined ? {} : { year }),
            ...(min_rating === undefined ? {} : { minRating: min_rating }),
            sortBy: SORT_OPTIONS[sort_by ?? 'popularidad'],
          }),
        ),
    }),

    defineTool({
      name: 'tmdb_similar_movies',
      title: 'Peliculas parecidas',
      description:
        'Devuelve peliculas parecidas a una que al usuario ya le gusto. Requiere el id de TMDB de esa pelicula (obtengalo antes con tmdb_search_movies).',
      inputSchema: { movie_id: movieId },
      handler: async ({ movie_id }) => listOutcome(await client.similarMovies(movie_id)),
    }),

    defineTool({
      name: 'tmdb_movie_details',
      title: 'Ficha de una pelicula',
      description:
        'Devuelve la ficha completa de una pelicula: generos, duracion, calificacion, id de IMDb y `basedOnBook`, que indica si esta basada en un libro. Usela antes de comparar una pelicula con su libro.',
      inputSchema: { movie_id: movieId },
      handler: async ({ movie_id }) => {
        const loaded = await loadDetails(client, movie_id)
        if (!loaded.ok) return loaded.outcome
        return { ok: true, data: { movie: loaded.movie, attribution: ATTRIBUTION } }
      },
    }),

    defineTool({
      name: 'tmdb_show_poster',
      title: 'Mostrar el poster',
      description:
        'Muestra al usuario la imagen del poster de una pelicula dentro del chat. Llamela siempre para la pelicula que recomiende.',
      inputSchema: { movie_id: movieId },
      handler: async ({ movie_id }) => {
        const loaded = await loadDetails(client, movie_id)
        if (!loaded.ok) return loaded.outcome
        const { movie } = loaded
        if (movie.posterUrl === null) {
          return fail('no_poster', `TMDB no tiene poster para "${movie.title}".`)
        }
        return {
          ok: true,
          data: { shown: true, title: movie.title },
          ui: [{ type: 'image', url: movie.posterUrl, alt: `Póster de ${movie.title}` }],
        }
      },
    }),

    defineTool({
      name: 'tmdb_open_imdb',
      title: 'Abrir IMDb',
      description:
        'Abre en una pestania nueva del navegador del usuario la pagina de IMDb de una pelicula. Usela cuando el usuario quiera ver mas informacion o pida abrir IMDb.',
      inputSchema: { movie_id: movieId },
      handler: async ({ movie_id }) => {
        const loaded = await loadDetails(client, movie_id)
        if (!loaded.ok) return loaded.outcome
        const { movie } = loaded
        if (movie.imdbUrl === null) {
          return fail('no_imdb_id', `"${movie.title}" no tiene pagina de IMDb registrada en TMDB.`)
        }
        return {
          ok: true,
          data: { opened: true, title: movie.title, url: movie.imdbUrl },
          ui: [{ type: 'open_url', url: movie.imdbUrl, title: `IMDb: ${movie.title}` }],
        }
      },
    }),
  ]
}
