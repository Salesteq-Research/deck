import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mt-2.5 mb-1.5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-[1.625] text-white/80">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 space-y-1.5 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1.5">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 items-baseline leading-snug text-white/80">
      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1c69d4]/60" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/50">{children}</em>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="block bg-white/[0.06] rounded-md p-3 my-2 text-sm overflow-x-auto font-mono text-white/70">
          {children}
        </code>
      )
    }
    return (
      <code className="bg-white/[0.08] rounded px-1.5 py-0.5 text-sm font-mono text-white/70">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#4d8fe0] underline underline-offset-2 hover:text-[#4d8fe0]/80">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-white/10 px-3 py-1.5 bg-white/[0.06] font-semibold text-left text-white/80">{children}</th>,
  td: ({ children }) => <td className="border border-white/10 px-3 py-1.5 text-white/70">{children}</td>,
}

interface MarkdownMessageProps {
  content: string
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="text-sm text-white/80">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
