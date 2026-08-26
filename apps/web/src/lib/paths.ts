/** Truncate from the left so the filename stays visible. */
export function truncatePathFromLeft(path: string, maxLen = 48): string {
  if (path.length <= maxLen) {
    return path;
  }
  return `…${path.slice(-(maxLen - 1))}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
