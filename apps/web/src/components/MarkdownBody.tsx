import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 font-mono text-[length:var(--text-xs)]">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const block = className !== undefined;
    if (block) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded-[var(--radius-control)] bg-surface-2 px-1 py-0.5 font-mono text-[length:var(--text-xs)]">
        {children}
      </code>
    );
  },
  a: ({ href, children }) => (
    <a className="text-info underline" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
};

export function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="text-[length:var(--text-sm)] leading-6 text-foreground">
      <Markdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </Markdown>
    </div>
  );
}
