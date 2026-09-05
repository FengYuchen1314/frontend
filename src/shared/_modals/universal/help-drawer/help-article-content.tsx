import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

export function HelpArticleContent({
    content,
    className
}: {
    content: string
    className?: string
}) {
    return (
        <article className={className}>
            <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </article>
    )
}
