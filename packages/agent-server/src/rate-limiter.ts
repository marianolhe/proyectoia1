/**
 * Limite de mensajes por conexion (ventana deslizante).
 *
 * Cada mensaje cuesta llamadas al modelo y a las APIs con cupo diario. Sin
 * este limite, una sola pestania en bucle agotaria el cupo de todos.
 */
export class RateLimiter {
  readonly #limit: number
  readonly #windowMs: number
  readonly #now: () => number
  #timestamps: number[] = []

  constructor(limit: number, windowMs = 60_000, now: () => number = () => Date.now()) {
    this.#limit = limit
    this.#windowMs = windowMs
    this.#now = now
  }

  tryAcquire(): boolean {
    const now = this.#now()
    this.#timestamps = this.#timestamps.filter((at) => now - at < this.#windowMs)
    if (this.#timestamps.length >= this.#limit) return false
    this.#timestamps.push(now)
    return true
  }
}
