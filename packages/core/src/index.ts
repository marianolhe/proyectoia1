export type {
  AgentEvent,
  ChatTransport,
  OutboundMessage,
  TransportEvent,
  TransportListener,
  TransportStatus,
  TransportStatusEvent,
  Unsubscribe,
} from './ports/transport.js'

export type { ConversationError, Message, MessageRole, MessageStatus } from './domain/types.js'
export { createId, type IdFactory } from './domain/ids.js'

export {
  canSubmit,
  conversationReducer,
  createInitialState,
  isAgentResponding,
  type ConversationAction,
  type ConversationState,
} from './state/conversation.js'
export { createStore, type Reducer, type Store } from './state/store.js'

export { ChatClient, type ChatClientOptions, type SendResult } from './chat-client.js'

export { InMemoryTransport, type InMemoryTransportOptions } from './testing/in-memory-transport.js'
