import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Thin wrapper around react-markdown — styling delegated to
// @tailwindcss/typography (`prose prose-sm`). Heading sizes from prose are
// intentionally a bit loud for an inline chat bubble; tune via overrides
// (e.g. `prose-headings:my-1 prose-h1:text-base`) when something looks off.
export const Markdown = ({ text }: { text: string }) => (
  <div className="prose prose-sm max-w-none prose-pre:my-2 prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:text-xs prose-code:before:hidden prose-code:after:hidden">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
)
