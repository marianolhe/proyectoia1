import { describe, expect, it } from 'vitest'
import * as api from './index.js'

// Es lo que queda en window.AGIChat: cualquier cambio rompe a los integradores.
describe('API publica de @agichat/sdk-embed', () => {
  it('solo expone mount', () => {
    expect(Object.keys(api)).toEqual(['mount'])
  })
})
