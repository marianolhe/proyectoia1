import { describe, expect, it } from 'vitest'
import * as api from './index.js'

// Protege la API publica: renombrar o dejar de exportar algo rompe a los
// integradores aunque las pruebas internas sigan en verde.
describe('API publica de @agichat/ui-react', () => {
  it('expone componentes, hooks y textos', () => {
    expect(Object.keys(api).sort()).toEqual([
      'ActionNotices',
      'Attribution',
      'ChatHeader',
      'ChatPanel',
      'ChatWidget',
      'Composer',
      'ConnectionNotice',
      'DEFAULT_LABELS',
      'DEFAULT_POLICY',
      'Launcher',
      'MarkdownMessage',
      'MessageBubble',
      'MessageImages',
      'MessageList',
      'PolicyContext',
      'TypingIndicator',
      'isAllowedUrl',
      'openInNewTab',
      'resolveLabels',
      'resolvePolicy',
      'useChat',
      'useOpenUrlActions',
      'useOwnedClient',
      'usePolicy',
    ])
  })
})
