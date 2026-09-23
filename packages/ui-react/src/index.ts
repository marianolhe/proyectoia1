// Los estilos se emiten como dist/index.css y se publican en
// "@agichat/ui-react/styles.css"; el integrador decide donde cargarlos
// (documento principal o Shadow DOM).
import './styles.css'

export {
  ChatWidget,
  type ChatConnectionProps,
  type ChatWidgetProps,
} from './components/chat-widget.js'
export { ChatPanel, type ChatPanelProps } from './components/chat-panel.js'
export { ChatHeader, type ChatHeaderProps } from './components/chat-header.js'
export { MessageList, type MessageListProps } from './components/message-list.js'
export { MessageBubble, type MessageBubbleProps } from './components/message-bubble.js'
export { MarkdownMessage, type MarkdownMessageProps } from './components/markdown-message.js'
export { TypingIndicator, type TypingIndicatorProps } from './components/typing-indicator.js'
export { Composer, type ComposerProps } from './components/composer.js'
export { Launcher, type LauncherProps } from './components/launcher.js'
export { ConnectionNotice, type ConnectionNoticeProps } from './components/connection-notice.js'

export { useChat, type UseChatResult } from './hooks/use-chat.js'
export { useOwnedClient } from './hooks/use-owned-client.js'
export { DEFAULT_LABELS, resolveLabels, type ChatLabels } from './labels.js'
