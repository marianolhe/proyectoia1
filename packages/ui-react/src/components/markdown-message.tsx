import { memo, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { isAllowedUrl, usePolicy } from '../policy.js'

// Listas fijas fuera del componente: react-markdown compara los plugins por
// referencia, y recrearlas en cada delta obligaria a reconstruir el pipeline.
const REMARK_PLUGINS = [remarkGfm]

// react-markdown ya descarta el HTML crudo y limpia las URL peligrosas, pero
// el contenido viene de un agente que no controlamos. rehype-sanitize es la
// segunda barrera: si alguien agrega rehype-raw mas adelante, el HTML sigue
// pasando por una lista blanca antes de llegar al DOM.
const REHYPE_PLUGINS = [rehypeSanitize]

function buildComponents(imageHosts: readonly string[]): Components {
  return {
    // Un enlace de la respuesta no debe sacar al usuario del sitio del cliente
    // ni darle a la pagina destino acceso a window.opener.
    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
    // Una imagen se descarga sola al pintarse. Si el modelo fuera manipulado
    // para escribir una con datos en la URL, eso los filtraria a un tercero
    // sin que nadie haga clic: fuera de la lista solo queda el texto alterno.
    img: ({ node: _node, src, alt }) =>
      typeof src === 'string' && isAllowedUrl(src, imageHosts) ? (
        <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span>{alt}</span>
      ),
  }
}

export interface MarkdownMessageProps {
  readonly content: string
}

/** Renderiza Markdown del agente de forma segura. */
export const MarkdownMessage = memo(function MarkdownMessage({ content }: MarkdownMessageProps) {
  const { imageHosts } = usePolicy()
  const components = useMemo(() => buildComponents(imageHosts), [imageHosts])

  return (
    <div className="agc-markdown">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
})
