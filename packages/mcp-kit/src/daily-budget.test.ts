import { describe, expect, it } from 'vitest'
import { DailyBudget } from './daily-budget.js'

const DAY = 24 * 60 * 60 * 1000

describe('DailyBudget', () => {
  it('permite consumir hasta el limite del dia', () => {
    const budget = new DailyBudget({ limit: 2, now: () => 0 })

    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
    expect(budget.remaining).toBe(0)
  })

  it('se reinicia al cambiar de dia', () => {
    let now = DAY - 1
    const budget = new DailyBudget({ limit: 1, now: () => now })
    budget.tryConsume()
    expect(budget.remaining).toBe(0)

    now = DAY
    expect(budget.remaining).toBe(1)
    expect(budget.tryConsume()).toBe(true)
  })

  it('usa el reloj del sistema por defecto', () => {
    expect(new DailyBudget({ limit: 5 }).remaining).toBe(5)
  })
})
