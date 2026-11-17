import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('API publica de @agichat/mcp-kit', () => {
  it('expone cache, cupo, cliente HTTP y arranque de servidores', () => {
    expect(Object.keys(api).sort()).toEqual([
      'ApiClient',
      'DailyBudget',
      'TtlCache',
      'createMcpServer',
      'defineTool',
      'fail',
      'runMcpServer',
      'startMcpHttpServer',
    ])
  })
})
