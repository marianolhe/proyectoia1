/**
 * Presupuesto diario de llamadas a una API externa.
 *
 * El cache reduce el consumo, pero no lo acota. Este contador si: cuando se
 * agota, la herramienta responde con un error claro en vez de dejar que la
 * API empiece a rechazar peticiones o que la cuenta quede bloqueada.
 */

export interface DailyBudgetOptions {
  readonly limit: number
  readonly now?: () => number
}

const DAY_MS = 24 * 60 * 60 * 1000

export class DailyBudget {
  readonly #limit: number
  readonly #now: () => number
  #day: number
  #used = 0

  constructor(options: DailyBudgetOptions) {
    this.#limit = options.limit
    this.#now = options.now ?? (() => Date.now())
    this.#day = this.#currentDay()
  }

  get remaining(): number {
    this.#rollOver()
    return Math.max(0, this.#limit - this.#used)
  }

  /** Reserva una llamada. Devuelve false si el cupo del dia ya se agoto. */
  tryConsume(): boolean {
    this.#rollOver()
    if (this.#used >= this.#limit) return false
    this.#used += 1
    return true
  }

  #currentDay(): number {
    return Math.floor(this.#now() / DAY_MS)
  }

  #rollOver(): void {
    const today = this.#currentDay()
    if (today !== this.#day) {
      this.#day = today
      this.#used = 0
    }
  }
}
