import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-border bg-black/40 p-3 text-xs">{children}</pre>
  ),
  code: ({ children, className }) => {
    const block = className !== undefined;
    if (block) {
      return <code className={className}>{children}</code>;
    }
    return <code className="rounded bg-black/40 px-1 py-0.5 text-[12px]">{children}</code>;
  },
  a: ({ href, children }) => (
    <a className="text-primary underline" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
};

export function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="prose-invert text-sm leading-6">
      <Markdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </Markdown>
    </div>
  );
}
