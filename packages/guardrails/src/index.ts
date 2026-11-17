export { createCanary, containsCanary, type RandomBytes } from './canary.js'
export {
  DEFAULT_MAX_INPUT_LENGTH,
  inspectUserInput,
  type InputCategory,
  type InputGuardOptions,
  type InputVerdict,
} from './input-guard.js'
export {
  inspectOutput,
  quotesSystemPrompt,
  type OutputCategory,
  type OutputGuardContext,
  type OutputVerdict,
} from './output-guard.js'
export { EXTRACTION_PATTERNS, INJECTION_PATTERNS, type AttackPattern } from './patterns.js'
export { decodeBase64Segments, normalizeForInspection, stripInvisible } from './text-normalize.js'
export {
  OMITTED_MARKER,
  sanitizeUntrusted,
  wrapUntrusted,
  type SanitizeOptions,
  type SanitizedData,
} from './untrusted-data.js'
export {
  IMAGE_HOSTS,
  LINK_HOSTS,
  OPEN_URL_HOSTS,
  isAllowedUrl,
  sanitizeMarkdownUrls,
  type MarkdownUrlPolicy,
  type SanitizedMarkdown,
} from './url-policy.js'
