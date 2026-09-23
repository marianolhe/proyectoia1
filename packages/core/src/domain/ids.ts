/**
 * Generacion de identificadores para mensajes y conversaciones.
 *
 * Se aisla en su propio modulo para poder inyectar un generador determinista
 * en las pruebas y para no depender de que `crypto.randomUUID` exista: Safari
 * antiguo y contextos no seguros no lo exponen, y el SDK corre en sitios de
 * terceros sobre los que no se controla el navegador.
 */

export type IdFactory = () => string

let fallbackCounter = 0

export const createId: IdFactory = () => {
  // Se describe la forma minima que hace falta en lugar de usar el tipo Crypto:
  // ese tipo vive en la libreria DOM, y el nucleo debe compilar sin ella para
  // poder correr igual en navegador, en Node y en un worker.
  const host = globalThis as { crypto?: { randomUUID?: () => string } }

  if (typeof host.crypto?.randomUUID === 'function') {
    return host.crypto.randomUUID()
  }

  fallbackCounter += 1
  const random = Math.random().toString(36).slice(2, 10)
  return `agichat-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${random}`
}
