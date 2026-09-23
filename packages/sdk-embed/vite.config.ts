import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Bundle autocontenido para integradores que no usan React.
 *
 * Formato IIFE y sin externals: React viaja dentro del artefacto para que el
 * cliente solo tenga que anadir una etiqueta script. El aislamiento visual lo
 * da el Shadow DOM, no el bundler.
 */
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'AGIChat',
      formats: ['iife'],
      fileName: () => 'agichat.js',
    },
    sourcemap: true,
    emptyOutDir: true,
  },
})
