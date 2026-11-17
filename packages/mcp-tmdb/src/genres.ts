/**
 * Generos de pelicula de TMDB.
 *
 * Los identificadores son estables, asi que se fijan aqui en lugar de pedir
 * `/genre/movie/list`: es una peticion menos contra el cupo diario en cada
 * arranque en frio.
 */
export const GENRE_IDS = {
  accion: 28,
  aventura: 12,
  animacion: 16,
  comedia: 35,
  crimen: 80,
  documental: 99,
  drama: 18,
  familia: 10751,
  fantasia: 14,
  historia: 36,
  terror: 27,
  musica: 10402,
  misterio: 9648,
  romance: 10749,
  ciencia_ficcion: 878,
  suspenso: 53,
  belica: 10752,
  western: 37,
} as const

export type GenreName = keyof typeof GENRE_IDS

export const GENRE_NAMES = Object.keys(GENRE_IDS) as [GenreName, ...GenreName[]]
