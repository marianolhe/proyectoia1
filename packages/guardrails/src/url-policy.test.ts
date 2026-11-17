import { describe, expect, it } from 'vitest'
import {
  IMAGE_HOSTS,
  LINK_HOSTS,
  OPEN_URL_HOSTS,
  isAllowedUrl,
  sanitizeMarkdownUrls,
} from './url-policy.js'

describe('isAllowedUrl', () => {
  it.each([
    'https://www.imdb.com/title/tt1160419/',
    'https://books.google.com/books?id=B1hSG45JCX4C',
  ])('permite %s', (url) => {
    expect(isAllowedUrl(url, OPEN_URL_HOSTS)).toBe(true)
  })

  it.each([
    ['otro sitio', 'https://evil.example/premio'],
    ['http sin cifrar', 'http://www.imdb.com/title/tt1160419/'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['esquema data', 'data:text/html,<script>alert(1)</script>'],
    ['credenciales para disfrazar el host', 'https://www.imdb.com@evil.example/'],
    ['usuario en la URL', 'https://user:pass@www.imdb.com/'],
    ['subdominio parecido', 'https://www.imdb.com.evil.example/'],
    ['dominio que solo termina igual', 'https://notimdb.com/'],
    ['texto que no es URL', 'no soy una url'],
  ])('rechaza %s', (_name, url) => {
    expect(isAllowedUrl(url, OPEN_URL_HOSTS)).toBe(false)
  })

  it('rechaza valores que no son texto', () => {
    expect(isAllowedUrl(undefined, OPEN_URL_HOSTS)).toBe(false)
    expect(isAllowedUrl(42, OPEN_URL_HOSTS)).toBe(false)
  })
})

describe('sanitizeMarkdownUrls', () => {
  const policy = { imageHosts: IMAGE_HOSTS, linkHosts: LINK_HOSTS }

  it('conserva imagenes y enlaces de la lista permitida', () => {
    const markdown =
      '![Duna](https://image.tmdb.org/t/p/w342/a.jpg) y [IMDb](https://www.imdb.com/title/tt1160419/)'
    expect(sanitizeMarkdownUrls(markdown, policy)).toEqual({ text: markdown, removed: 0 })
  })

  it('reemplaza una imagen externa por su texto alterno', () => {
    expect(
      sanitizeMarkdownUrls('Mira ![poster](https://evil.example/c.png?d=secreto) esto', policy),
    ).toEqual({ text: 'Mira poster esto', removed: 1 })
  })

  it('reemplaza un enlace externo por su texto visible', () => {
    expect(
      sanitizeMarkdownUrls('Entra a [IMDb](https://evil.example/imdb "titulo")', policy),
    ).toEqual({ text: 'Entra a IMDb', removed: 1 })
  })

  it('quita enlaces con esquemas peligrosos', () => {
    expect(sanitizeMarkdownUrls('[clic](javascript:alert(1))', policy).removed).toBe(1)
  })

  it('cuenta cada URL retirada', () => {
    const result = sanitizeMarkdownUrls(
      '![a](https://x.example/1.png) [b](https://y.example) [c](<https://z.example>)',
      policy,
    )
    expect(result).toEqual({ text: 'a b c', removed: 3 })
  })

  it('no toca texto sin Markdown', () => {
    expect(
      sanitizeMarkdownUrls('Una película [de 2021] muy buena (en serio).', policy).removed,
    ).toBe(0)
  })
})
