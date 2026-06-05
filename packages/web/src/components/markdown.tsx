import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Thin wrapper around react-markdown with @tailwindcss/typography styling.
//
// `prose-*` variants ride typography's CSS-variable-driven defaults, which
// makes overriding the dark `pre` colour squirrelly: `prose-pre:text-gray-800`
// loses to `--tw-prose-pre-code` in some build chains. Use descendant
// selectors (`[&_pre]:…`) instead — they win cleanly and read top-to-bottom.
//
// Heading scale shrunk one step from prose-sm's article defaults so the bubble
// doesn't shout. Tighten vertical margins for chat density.
export const Markdown = ({ text }: { text: string }) => (
  <div
    className={[
      'prose prose-sm max-w-none break-words',
      'prose-headings:font-semibold',
      'prose-h1:text-lg prose-h1:mt-3 prose-h1:mb-1.5',
      'prose-h2:text-base prose-h2:mt-2.5 prose-h2:mb-1',
      'prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-0.5',
      'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
      'prose-blockquote:my-2 prose-blockquote:not-italic',
      // fenced code blocks: light bg, dark text — visible without dark mode
      '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-gray-200',
      '[&_pre]:bg-gray-50 [&_pre]:text-gray-800 [&_pre]:p-3 [&_pre]:text-xs',
      '[&_pre_code]:bg-transparent [&_pre_code]:text-gray-800',
      '[&_pre_code]:p-0 [&_pre_code]:font-normal',
      // inline code: subtle pill, drop prose's backtick pseudos
      '[&_:not(pre)>code]:bg-gray-100 [&_:not(pre)>code]:text-gray-800',
      '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5',
      '[&_:not(pre)>code]:font-normal [&_:not(pre)>code]:text-[0.85em]',
      'prose-code:before:hidden prose-code:after:hidden',
    ].join(' ')}
  >
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Open links in a new tab (the transcript is the app; don't navigate away).
        a: ({ node: _node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
)
