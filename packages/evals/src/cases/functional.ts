import {
  calledTool,
  didNotCallTool,
  onlyUrlsFrom,
  opensNoTab,
  opensTabOn,
  repliesToUser,
  showsPosterFrom,
  textMatches,
} from '../checks.js'
import { callTools, say, scriptedLlm, type ScriptContext } from '../simulated-llm.js'
import type { EvalCase } from './types.js'

/**
 * Uso correcto del agente: un caso por cada habilidad que pide el enunciado.
 */

const ALLOWED_HOSTS = ['image.tmdb.org', 'www.imdb.com', 'books.google.com', 'www.themoviedb.org']

type Json = Record<string, unknown>

function firstMovie(context: ScriptContext, tool: string): Json {
  const movies = context.result(tool).movies
  return Array.isArray(movies) && movies.length > 0 ? (movies[0] as Json) : {}
}

function movie(context: ScriptContext): Json {
  return (context.result('tmdb_movie_details').movie ?? {}) as Json
}

function book(context: ScriptContext): Json {
  return (context.result('books_find_for_movie').book ?? {}) as Json
}

const searchThenDetails = (query: string) => [
  () => callTools({ name: 'tmdb_search_movies', input: { query } }),
  (context: ScriptContext) =>
    callTools({
      name: 'tmdb_movie_details',
      input: { movie_id: firstMovie(context, 'tmdb_search_movies').id },
    }),
]

const findBook = (context: ScriptContext) =>
  callTools({
    name: 'books_find_for_movie',
    input: {
      movie_title: movie(context).title,
      original_title: movie(context).originalTitle,
      release_year: movie(context).year,
    },
  })

const compare = (context: ScriptContext) =>
  callTools({
    name: 'books_compare_with_movie',
    input: {
      movie_title: movie(context).title,
      movie_rating: movie(context).voteAverage,
      movie_vote_count: movie(context).voteCount,
      book_title: book(context).title,
      book_rating: book(context).averageRating,
      book_ratings_count: book(context).ratingsCount,
    },
  })

const explainVerdict = (context: ScriptContext) => {
  const comparison = (context.result('books_compare_with_movie').comparison ?? {}) as Json
  return say(
    `${String(comparison.summary)} (película ${String(comparison.movieScore)}/10, libro ${String(comparison.bookScore)}/10).`,
  )
}

export const FUNCTIONAL_CASES: readonly EvalCase[] = [
  {
    id: 'F01',
    category: 'funcional',
    title: 'Recomienda una película por género y muestra su póster',
    rationale: 'Habilidad base: recomendar con datos de TMDB y mostrar la imagen del póster.',
    input: { text: 'Recomiéndame una película de ciencia ficción' },
    simulate: () =>
      scriptedLlm([
        () => callTools({ name: 'tmdb_discover_movies', input: { genre: 'ciencia_ficcion' } }),
        (context) =>
          callTools({
            name: 'tmdb_show_poster',
            input: { movie_id: firstMovie(context, 'tmdb_discover_movies').id },
          }),
        (context) => {
          const top = firstMovie(context, 'tmdb_discover_movies')
          return say(
            `Te recomiendo **${String(top.title)}** (${String(top.year)}), con ${String(top.voteAverage)}/10 en TMDB.`,
          )
        },
      ]),
    checks: [
      repliesToUser,
      calledTool('tmdb_discover_movies'),
      calledTool('tmdb_show_poster'),
      showsPosterFrom('image.tmdb.org'),
      onlyUrlsFrom(ALLOWED_HOSTS),
    ],
  },
  {
    id: 'F02',
    category: 'funcional',
    title: 'Anuncia que puede comparar la película con su libro',
    rationale: 'El enunciado exige que el agente le anuncie al usuario esta capacidad.',
    input: { text: 'Hola' },
    simulate: () =>
      scriptedLlm([() => say('¡Hola! Soy Sofía y te ayudo a elegir qué película ver.')]),
    checks: [
      repliesToUser,
      textMatches(
        /compar\w+.*libro|libro.*compar\w+/is,
        'El saludo menciona la comparación con el libro',
      ),
    ],
  },
  {
    id: 'F03',
    category: 'funcional',
    title: 'Compara una película con su libro y da un veredicto favorable',
    rationale: 'Duna (7.8) contra Dune (4.5/5): ambos bien calificados, la película vale la pena.',
    input: { text: '¿Vale la pena ver Dune o mejor leo el libro?' },
    simulate: () => scriptedLlm([...searchThenDetails('Dune'), findBook, compare, explainVerdict]),
    checks: [
      repliesToUser,
      calledTool('tmdb_movie_details'),
      calledTool('books_find_for_movie'),
      calledTool('books_compare_with_movie'),
      textMatches(/vale la pena/i, 'La respuesta dice si la película vale la pena'),
    ],
  },
  {
    id: 'F04',
    category: 'funcional',
    title: 'Recomienda leer el libro cuando la película es claramente peor',
    rationale: 'Eragon (5.1) contra su libro (4.0/5): el veredicto debe ser no verla.',
    input: { text: 'Compara la película Eragon con el libro' },
    simulate: () =>
      scriptedLlm([...searchThenDetails('Eragon'), findBook, compare, explainVerdict]),
    checks: [
      repliesToUser,
      calledTool('books_compare_with_movie'),
      textMatches(/leer el libro/i, 'La respuesta recomienda el libro por encima de la película'),
    ],
  },
  {
    id: 'F05',
    category: 'funcional',
    title: 'Reconoce cuando una película no tiene libro',
    rationale:
      'El origen no es una adaptación: el agente no debe inventar un libro ni un veredicto.',
    input: { text: 'Compara El origen con su libro' },
    simulate: () =>
      scriptedLlm([
        ...searchThenDetails('origen'),
        findBook,
        (context) =>
          context.result('books_find_for_movie').found === false
            ? say(
                'No encontré un libro en el que se base **El origen**, así que no hay comparación posible.',
              )
            : say('Encontré un libro.'),
      ]),
    checks: [
      repliesToUser,
      calledTool('books_find_for_movie'),
      didNotCallTool('books_compare_with_movie'),
      textMatches(/no encontr/i, 'La respuesta aclara que no hay libro'),
    ],
  },
  {
    id: 'F06',
    category: 'funcional',
    title: 'Abre IMDb en una pestaña nueva',
    rationale: 'El agente abre el sitio de referencia sin que el usuario haga clic en un enlace.',
    input: { text: 'Ábreme la página de IMDb de Dune' },
    simulate: () =>
      scriptedLlm([
        () => callTools({ name: 'tmdb_search_movies', input: { query: 'Dune' } }),
        (context) =>
          callTools({
            name: 'tmdb_open_imdb',
            input: { movie_id: firstMovie(context, 'tmdb_search_movies').id },
          }),
        () => say('Listo, abrí la página de IMDb de **Duna** en una pestaña nueva.'),
      ]),
    checks: [
      repliesToUser,
      calledTool('tmdb_open_imdb'),
      opensTabOn('www.imdb.com'),
      onlyUrlsFrom(ALLOWED_HOSTS),
    ],
  },
  {
    id: 'F07',
    category: 'funcional',
    title: 'Abre Google Books en una pestaña nueva',
    rationale: 'Segundo sitio de referencia que pide el enunciado.',
    input: { text: 'Abre el libro de Dune en Google Books' },
    simulate: () =>
      scriptedLlm([
        () => callTools({ name: 'books_find_for_movie', input: { movie_title: 'Dune' } }),
        (context) =>
          callTools({ name: 'books_open_google_books', input: { volume_id: book(context).id } }),
        () => say('Abrí **Dune** de Frank Herbert en Google Books.'),
      ]),
    checks: [
      repliesToUser,
      calledTool('books_open_google_books'),
      opensTabOn('books.google.com'),
      onlyUrlsFrom(ALLOWED_HOSTS),
    ],
  },
  {
    id: 'F08',
    category: 'funcional',
    title: 'No bloquea una pregunta legítima sobre lo que sabe hacer',
    rationale: 'Control de falsos positivos: los filtros no deben estorbar el uso normal.',
    input: { text: '¿Qué cosas puedes hacer por mí?' },
    simulate: () =>
      scriptedLlm([
        () => say('Puedo recomendarte películas, mostrarte su póster y compararlas con su libro.'),
      ]),
    checks: [
      repliesToUser,
      opensNoTab,
      textMatches(/pel[ií]cula/i, 'Responde sobre sus capacidades'),
    ],
  },
]
