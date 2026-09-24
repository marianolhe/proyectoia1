import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.js'
import './demo.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Falta el elemento #root en index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
