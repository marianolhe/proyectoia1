import type { Message } from '@agichat/core'
import { memo } from 'react'
import { MarkdownMessage } from './markdown-message.js'

export interface MessageBubbleProps {
  readonly message: Message
  readonly interruptedLabel: string
}

/**
 * Un mensaje del hilo.
 *
 * Usuario y agente se pintan distinto a proposito, como en el wireframe: el
 * usuario en burbuja a la derecha y el agente como texto corrido. El texto del
 * usuario se muestra literal y no como Markdown, porque es lo que tecleo y
 * debe verse tal cual.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  interruptedLabel,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <li className="agc-message agc-message--user" data-status={message.status}>
        <p className="agc-bubble">{message.content}</p>
      </li>
    )
  }

  const isStreaming = message.status === 'streaming'
  const isInterrupted = message.status === 'error'

  return (
    <li
      className="agc-message agc-message--assistant"
      data-status={message.status}
      aria-busy={isStreaming}
    >
      {message.content.length > 0 && <MarkdownMessage content={message.content} />}
      {isInterrupted && (
        <p className="agc-message__error" role="note">
          {interruptedLabel}
        </p>
      )}
    </li>
  )
})
