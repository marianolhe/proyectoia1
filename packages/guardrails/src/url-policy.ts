/**
 * Lista blanca de destinos.
 *
 * El agente puede abrir pestanias y mostrar imagenes sin que el usuario haga
 * clic. Esa capacidad es justo lo que un ataque de inyeccion querria secuestrar
 * (abrir un sitio de phishing, exfiltrar datos en la URL de una imagen), asi
 * que el destino se valida contra una lista fija y no se confia en el modelo.
 */

export const OPEN_URL_HOSTS: readonly string[] = ['www.imdb.com', 'books.google.com']
export const IMAGE_HOSTS: readonly string[] = ['image.tmdb.org', 'books.google.com']
export const LINK_HOSTS: readonly string[] = [
  ...OPEN_URL_HOSTS,
  'www.themoviedb.org',
  'image.tmdb.org',
]

export function isAllowedUrl(candidate: unknown, allowedHosts: readonly string[]): boolean {
  if (typeof candidate !== 'string') return false
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // user:pass@host es el truco clasico para que una URL parezca de otro sitio.
  if (url.username !== '' || url.password !== '') return false
  return allowedHosts.includes(url.hostname)
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)/g
const MARKDOWN_LINK = /(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)/g

export interface MarkdownUrlPolicy {
  readonly imageHosts: readonly string[]
  readonly linkHosts: readonly string[]
}

export interface SanitizedMarkdown {
  readonly text: string
  readonly removed: number
}

/**
 * Deja solo el texto visible de las imagenes y enlaces Markdown que apunten
 * fuera de la lista blanca. Una imagen Markdown se carga sola al pintarse: es
 * el canal de exfiltracion mas comun en ataques de inyeccion.
 */
export function sanitizeMarkdownUrls(
  markdown: string,
  policy: MarkdownUrlPolicy,
): SanitizedMarkdown {
  let removed = 0
  const replaceWith =
    (hosts: readonly string[]) =>
    (match: string, label: string, url: string): string => {
      if (isAllowedUrl(url, hosts)) return match
      removed += 1
      return label
    }

  const text = markdown
    .replace(MARKDOWN_IMAGE, replaceWith(policy.imageHosts))
    .replace(MARKDOWN_LINK, replaceWith(policy.linkHosts))
  return { text, removed }
}
