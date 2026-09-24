import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  // GitHub Pages sirve el sitio bajo /<repositorio>/; el workflow de deploy
  // fija DEMO_BASE. En local se sirve desde la raiz.
  base: process.env.DEMO_BASE ?? '/',
  // Las variables VITE_* se leen del .env de la raiz del monorepo.
  envDir: fromRoot(''),
  resolve: {
    // Igual que en las pruebas: la demo consume el codigo fuente de los
    // paquetes, asi que `pnpm dev` no exige compilarlos antes.
    alias: {
      '@agichat/core': fromRoot('packages/core/src/index.ts'),
      '@agichat/transport-ws': fromRoot('packages/transport-ws/src/index.ts'),
      '@agichat/mock-server/browser': fromRoot('packages/mock-server/src/browser.ts'),
      '@agichat/ui-react': fromRoot('packages/ui-react/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
})
