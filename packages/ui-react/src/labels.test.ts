import { describe, expect, it } from 'vitest'
import { DEFAULT_LABELS, resolveLabels } from './labels.js'

describe('resolveLabels', () => {
  it('usa los textos por defecto sin sobrescrituras', () => {
    expect(resolveLabels(undefined)).toBe(DEFAULT_LABELS)
  })

  it('mezcla solo los textos que el integrador cambia', () => {
    const labels = resolveLabels({ assistantName: 'Ana' })
    expect(labels.assistantName).toBe('Ana')
    expect(labels.title).toBe(DEFAULT_LABELS.title)
  })
})
