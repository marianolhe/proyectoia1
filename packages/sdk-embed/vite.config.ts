import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

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
  resolve: {
    // Se compila desde el codigo fuente de los paquetes. La hoja de estilos va
    // primero y como expresion regular para que tambien capture `?inline`.
    alias: [
      {
        find: /^@agichat\/ui-react\/styles\.css/,
        replacement: fromRoot('packages/ui-react/src/styles.css'),
      },
      { find: '@agichat/ui-react', replacement: fromRoot('packages/ui-react/src/index.ts') },
      {
        find: '@agichat/transport-ws',
        replacement: fromRoot('packages/transport-ws/src/index.ts'),
      },
      { find: '@agichat/core', replacement: fromRoot('packages/core/src/index.ts') },
    ],
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'AGIChat',
      formats: ['iife'],
      fileName: () => 'agichat.js',
    },
    // Vite tambien deja dist/sdk-embed.css por el import de estilos de
    // ui-react. El integrador no lo necesita: mount() inyecta los estilos en
    // el Shadow DOM desde el propio bundle.
    sourcemap: true,
    emptyOutDir: true,
  },
})
