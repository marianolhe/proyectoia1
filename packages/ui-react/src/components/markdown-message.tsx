import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

// Listas fijas fuera del componente: react-markdown compara los plugins por
// referencia, y recrearlas en cada delta obligaria a reconstruir el pipeline.
const REMARK_PLUGINS = [remarkGfm]

// react-markdown ya descarta el HTML crudo y limpia las URL peligrosas, pero
// el contenido viene de un agente que no controlamos. rehype-sanitize es la
// segunda barrera: si alguien agrega rehype-raw mas adelante, el HTML sigue
// pasando por una lista blanca antes de llegar al DOM.
const REHYPE_PLUGINS = [rehypeSanitize]

const COMPONENTS: Components = {
  // Un enlace de la respuesta no debe sacar al usuario del sitio del cliente
  // ni darle a la pagina destino acceso a window.opener.
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

export interface MarkdownMessageProps {
  readonly content: string
}

/** Renderiza Markdown del agente de forma segura. */
export const MarkdownMessage = memo(function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="agc-markdown">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {content}
      </Markdown>
    </div>
  )
})
