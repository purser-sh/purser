export type DocumentFormat = "pdf" | "docx" | "xlsx" | "pptx" | "image" | "unknown";

const EXTENSIONS: Record<string, DocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pptx: "pptx",
  ppt: "pptx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  tiff: "image",
  tif: "image",
  bmp: "image",
};

export function detectDocumentFormat(path: string): DocumentFormat {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[ext] ?? "unknown";
}

export function formatLabel(format: DocumentFormat): string {
  switch (format) {
    case "pdf":
      return "PDF";
    case "docx":
      return "Word";
    case "xlsx":
      return "Excel";
    case "pptx":
      return "PowerPoint";
    case "image":
      return "Image";
    case "unknown":
      return "Unknown";
  }
}

export function isDocumentPath(path: string): boolean {
  return detectDocumentFormat(path) !== "unknown";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
