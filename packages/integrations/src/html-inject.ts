/** Insert a window bootstrap script. Shared by Vite dev HTML and the companion binary. */
export function injectWindowBootstrap(html: string, globalName: string, value: unknown): string {
  const snippet = `<script>window.${globalName}=${JSON.stringify(value)};</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${snippet}</head>`);
  }
  return `${snippet}${html}`;
}
