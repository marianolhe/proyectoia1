import type { Message } from '@agichat/core'
import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble.js'
import { TypingIndicator } from './typing-indicator.js'

export interface MessageListProps {
  readonly messages: readonly Message[]
  readonly showTyping: boolean
  readonly typingLabel: string
  readonly interruptedLabel: string
  readonly regionLabel: string
}

export function MessageList({
  messages,
  showTyping,
  typingLabel,
  interruptedLabel,
  regionLabel,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Cada delta cambia la lista; bajar al final en cada cambio mantiene a la
  // vista el texto que se esta escribiendo, como en cualquier chat.
  useEffect(() => {
    const element = scrollRef.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [messages, showTyping])

  return (
    <div className="agc-messages" ref={scrollRef}>
      {/* role=log anuncia a lectores de pantalla solo lo que se agrega. */}
      <ol className="agc-messages__list" role="log" aria-live="polite" aria-label={regionLabel}>
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} interruptedLabel={interruptedLabel} />
        ))}
      </ol>
      {showTyping && <TypingIndicator label={typingLabel} />}
    </div>
  )
}
