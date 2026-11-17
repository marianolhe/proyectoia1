import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, isAllowedUrl, resolvePolicy } from './policy.js'

describe('politica de destinos del widget', () => {
  it('por defecto permite TMDB, IMDb y Google Books', () => {
    expect(DEFAULT_POLICY).toEqual({
      imageHosts: ['image.tmdb.org', 'books.google.com'],
      openUrlHosts: ['www.imdb.com', 'books.google.com'],
    })
  })

  it('combina la politica del integrador con la de defecto', () => {
    expect(resolvePolicy(undefined)).toBe(DEFAULT_POLICY)
    expect(resolvePolicy({ imageHosts: ['cdn.example'] })).toEqual({
      imageHosts: ['cdn.example'],
      openUrlHosts: DEFAULT_POLICY.openUrlHosts,
    })
  })

  it.each([
    ['https://www.imdb.com/title/tt1/', true],
    ['http://www.imdb.com/title/tt1/', false],
    ['https://user@www.imdb.com/', false],
    ['https://evil.example/', false],
    ['no es una url', false],
  ])('isAllowedUrl(%s) = %s', (url, expected) => {
    expect(isAllowedUrl(url, DEFAULT_POLICY.openUrlHosts)).toBe(expected)
  })

  it('una URL ausente no esta permitida', () => {
    expect(isAllowedUrl(undefined, DEFAULT_POLICY.openUrlHosts)).toBe(false)
  })
})
