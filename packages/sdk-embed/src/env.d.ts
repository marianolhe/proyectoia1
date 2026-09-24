// Vite entrega el CSS importado con ?inline como texto, listo para un <style>.
declare module '*.css?inline' {
  const css: string
  export default css
}
