import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

/**
 * Renders agent- or human-authored markdown (chat messages, ADR documents).
 * No rehype-raw: content is semi-trusted (LLM-authored), so raw HTML embedded
 * in it must not be executed.
 */

/**
 * Demotes every markdown heading by one level.
 *
 * **Why.** This markdown is embedded *inside* a page that already has its own
 * `<h1>` (the feature or project title from the shell). An ADR document
 * conventionally opens with `# Title`, so rendering it verbatim produced two
 * `<h1>`s on one page — reproduced on the Spec tab, which showed both
 * "Project initialization" and "ADR 001: Project Init — Luffy's Portfolio" as
 * top-level headings, making the document look like a sibling of the page
 * rather than its content. It also broke the heading outline a screen reader
 * reads out.
 *
 * An `h6` has nowhere further to go, so it stays an `h6` rather than wrapping
 * around to `h1` — the outline would be worse, not better, and nothing in this
 * app writes deeper than `####`.
 *
 * The visual effect is a mild size reduction for a document's title (the
 * `.markdown-body` rules in `globals.css` style `h1` at 1.25em and `h2` at
 * 1.15em). That is the right trade: the page's own `h1` is the heading, and the
 * document's title is a section within it.
 */
const headingComponents: Components = {
  h1: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
  h2: ({ children, ...props }) => <h3 {...props}>{children}</h3>,
  h3: ({ children, ...props }) => <h4 {...props}>{children}</h4>,
  h4: ({ children, ...props }) => <h5 {...props}>{children}</h5>,
  h5: ({ children, ...props }) => <h6 {...props}>{children}</h6>,
  h6: ({ children, ...props }) => <h6 {...props}>{children}</h6>,
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("markdown-body text-sm text-frost", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={headingComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
