/**
 * Patrones de ataque conocidos, en espaniol e ingles.
 *
 * Se aplican sobre texto ya normalizado (minusculas, sin acentos). No pretenden
 * ser exhaustivos: son la primera barrera, barata y determinista. Lo que se
 * escape lo contienen las demas capas (datos externos delimitados, canario y
 * revision de la salida), que no dependen de reconocer el ataque.
 */

export interface AttackPattern {
  readonly id: string
  readonly regex: RegExp
}

const EXTRACTION_TARGET =
  '(system prompt|prompt del sistema|prompt de sistema|prompt inicial|mensaje de sistema|mensaje del sistema|system message|' +
  'instrucciones (iniciales|originales|internas|ocultas|secretas|del sistema|de sistema|que te dieron|que recibiste)|' +
  '(initial|hidden|original|internal|secret) instructions|tus instrucciones|your instructions|' +
  'tu prompt|your prompt|tus reglas|your rules|configuracion interna)'

const EXTRACTION_VERB =
  '(muestra|muestrame|mostrar|revela|revelame|dime|dame|repite|repiteme|imprime|escribe|escribeme|traduce|resume|' +
  'cual es|cuales son|comparte|copia|filtra|codifica|ensename|deletrea|lista|' +
  'what is|what are|show|reveal|print|repeat|tell me|translate|summarize|output|display|share|leak|encode|spell)'

/** LLM01: intentos de reemplazar o anular las instrucciones del agente. */
export const INJECTION_PATTERNS: readonly AttackPattern[] = [
  {
    id: 'override-instructions',
    regex:
      /\b(ignora|ignore|olvida|olvidate|forget|disregard|omite|descarta|override|anula|desobedece|bypass|salta|saltate)\b.{0,50}\b(instrucciones|instructions|reglas|rules|indicaciones|directrices|guidelines|restricciones|restrictions|prompt|anterior|anteriores|previas|previous|prior|above)\b/,
  },
  {
    id: 'role-hijack',
    regex:
      /\b(you are now|ahora eres|a partir de ahora eres|desde ahora eres|from now on you are|actua como|act as|pretend to be|finge ser|hazte pasar por|roleplay as)\b.{0,80}\b(dan|sin restricciones|without restrictions|unrestricted|jailbreak|otro asistente|another ai|otra ia|evil|malvado|sin filtros|unfiltered|no rules|sin reglas|sin censura|uncensored)\b/,
  },
  {
    id: 'jailbreak-keyword',
    regex: /\b(developer mode|modo desarrollador|jailbreak|do anything now|god mode|modo dios)\b/,
  },
  {
    id: 'fake-system-turn',
    regex:
      /(\b(nuevas instrucciones|new instructions|system override|instrucciones del sistema|system message|mensaje del sistema)\s*:|\[\/?(system|inst|sistema)\]|#{2,}\s*(system|sistema)\b|<\/?\s*(system|sistema|instrucciones|datos_externos|assistant|tool_result)\b[^>]*>)/,
  },
]

/** LLM07: intentos de leer el system prompt o los secretos del despliegue. */
export const EXTRACTION_PATTERNS: readonly AttackPattern[] = [
  {
    id: 'ask-system-prompt',
    regex: new RegExp(`\\b${EXTRACTION_VERB}\\b.{0,80}\\b${EXTRACTION_TARGET}\\b`),
  },
  {
    id: 'system-prompt-verbatim',
    regex: new RegExp(
      `\\b${EXTRACTION_TARGET}\\b.{0,60}\\b(verbatim|literal|literalmente|palabra por palabra|word for word|completo|completas|textual|textualmente|en base64|in base64)\\b`,
    ),
  },
  {
    id: 'repeat-above',
    regex:
      /\b(repite|repeat|imprime|print|escribe|write|output|muestra|show|copia|copy)\b.{0,50}\b(todo lo anterior|everything above|text above|texto anterior|texto de arriba|lo que esta arriba|words above|primer mensaje|first message|inicio de (esta|la) conversacion|start of (this|the) conversation)\b/,
  },
  {
    id: 'ask-secrets',
    regex:
      /\b(canary|canario|token secreto|secret token|api[ _-]?key|clave de (la )?api|variables? de entorno|environment variables?|credenciales|credentials)\b/,
  },
]
