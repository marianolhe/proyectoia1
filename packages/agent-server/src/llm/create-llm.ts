import type { LlmConfig } from '../config.js'
import type { LlmClient } from '../ports/llm.js'
import { AnthropicLlm } from './anthropic-llm.js'
import { OpenAiCompatibleLlm } from './openai-compatible-llm.js'

/** Unico punto del backend que decide que adaptador de modelo se usa. */
export function createLlm(config: LlmConfig): LlmClient {
  if (config.provider === 'openai-compatible') {
    return new OpenAiCompatibleLlm({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    })
  }
  return new AnthropicLlm(config.model === undefined ? {} : { model: config.model })
}
