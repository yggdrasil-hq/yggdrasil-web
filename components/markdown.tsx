import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

/**
 * Renders agent- or human-authored markdown (chat messages, ADR documents).
 * No rehype-raw: content is semi-trusted (LLM-authored), so raw HTML embedded
 * in it must not be executed.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("markdown-body text-sm text-frost", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
