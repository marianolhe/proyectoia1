import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('API publica de @agichat/guardrails', () => {
  it('expone las defensas de entrada, datos externos, salida y destinos', () => {
    expect(Object.keys(api).sort()).toEqual([
      'DEFAULT_MAX_INPUT_LENGTH',
      'EXTRACTION_PATTERNS',
      'IMAGE_HOSTS',
      'INJECTION_PATTERNS',
      'LINK_HOSTS',
      'OMITTED_MARKER',
      'OPEN_URL_HOSTS',
      'containsCanary',
      'createCanary',
      'decodeBase64Segments',
      'inspectOutput',
      'inspectUserInput',
      'isAllowedUrl',
      'normalizeForInspection',
      'quotesSystemPrompt',
      'sanitizeMarkdownUrls',
      'sanitizeUntrusted',
      'stripInvisible',
      'wrapUntrusted',
    ])
  })
})
