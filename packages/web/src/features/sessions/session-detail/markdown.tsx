import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Thin wrapper around react-markdown with @tailwindcss/typography styling.
// Heading scale + margins overridden inline because prose-sm defaults assume
// long-form articles and look too loud inside a chat bubble:
//   h1/h2/h3 sized just one step above body, font-semibold (not bold),
//   vertical rhythm tightened to my-2 / mb-1.
// `max-w-none` is required because the parent bubble already caps width.
export const Markdown = ({ text }: { text: string }) => (
  <div
    className={[
      'prose prose-sm max-w-none',
      'prose-headings:font-semibold',
      'prose-h1:text-lg prose-h1:mt-3 prose-h1:mb-1.5',
      'prose-h2:text-base prose-h2:mt-2.5 prose-h2:mb-1',
      'prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-0.5',
      'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
      // prose's default pre is dark (bg-gray-900); override both bg AND text
      // so the code is readable on the light bubble.
      'prose-pre:my-2 prose-pre:bg-gray-50 prose-pre:text-gray-800',
      'prose-pre:border prose-pre:border-gray-200 prose-pre:text-xs',
      // inline code: drop prose's surrounding backticks (`code`)
      'prose-code:before:hidden prose-code:after:hidden',
      'prose-code:bg-gray-100 prose-code:text-gray-800 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:font-normal',
      'prose-blockquote:my-2 prose-blockquote:not-italic',
    ].join(' ')}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
)
