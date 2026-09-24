import { defineConfig } from 'tsup'

/**
 * Dos entradas: la libreria (index) que consumen otros paquetes y el
 * proceso (cli) que arranca `pnpm mock`. Se compila en vez de ejecutar el .ts
 * directo porque Node no reescribe los imports `./x.js` hacia `./x.ts`.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: { entry: 'src/index.ts' },
  sourcemap: true,
  clean: true,
})
