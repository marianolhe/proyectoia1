import type { ConversationState } from '@agichat/core'
import type { UseChatResult } from '../hooks/use-chat.js'
import type { ChatLabels } from '../labels.js'
import { ChatHeader } from './chat-header.js'
import { Composer } from './composer.js'
import { ConnectionNotice } from './connection-notice.js'
import { MessageList } from './message-list.js'

export interface ChatPanelProps {
  readonly chat: UseChatResult
  readonly labels: ChatLabels
  readonly avatarSrc?: string
  readonly id?: string
}

/**
 * Los puntos solo aparecen mientras no hay texto que mirar. En cuanto llega el
 * primer delta, el propio mensaje creciendo ya comunica que el agente escribe.
 */
function shouldShowTyping(state: ConversationState): boolean {
  if (state.phase === 'sending') return true
  if (state.phase !== 'streaming') return false
  const last = state.messages.at(-1)
  return last === undefined || last.role !== 'assistant' || last.content.length === 0
}

/** Panel del wireframe: encabezado, hilo, avisos y composer, de arriba abajo. */
export function ChatPanel({ chat, labels, avatarSrc, id }: ChatPanelProps) {
  const { state } = chat

  return (
    <section className="agc-panel" id={id} aria-label={labels.assistantName}>
      <ChatHeader
        title={labels.title}
        subtitle={labels.subtitle}
        assistantName={labels.assistantName}
        {...(avatarSrc === undefined ? {} : { avatarSrc })}
      />
      <MessageList
        messages={chat.messages}
        showTyping={shouldShowTyping(state)}
        typingLabel={labels.typing}
        interruptedLabel={labels.interrupted}
        regionLabel={labels.messagesRegion}
      />
      <ConnectionNotice connection={state.connection} error={state.error} labels={labels} />
      <Composer
        canSubmit={chat.canSubmit}
        placeholder={labels.placeholder}
        sendLabel={labels.send}
        onSend={chat.sendMessage}
      />
    </section>
  )
}
