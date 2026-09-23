import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library no limpia sola cuando las pruebas no usan globals de Jest.
afterEach(() => {
  cleanup()
})
