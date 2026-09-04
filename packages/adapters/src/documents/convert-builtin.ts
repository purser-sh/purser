import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { DocumentFormat } from "./formats.ts";

export async function convertPdf(absPath: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const buf = readFileSync(absPath);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (text.length === 0) {
      return "(PDF contained no extractable text.)";
    }
    return text;
  } finally {
    await parser.destroy();
  }
}

export async function convertDocx(absPath: string): Promise<string> {
  const buf = readFileSync(absPath);
  const result = await mammoth.extractRawText({ buffer: buf });
  const text = result.value.trim();
  if (text.length === 0) {
    return "(Word document contained no extractable text.)";
  }
  return text;
}

export function convertXlsx(absPath: string): string {
  const workbook = XLSX.readFile(absPath, { type: "file", cellDates: true });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined) {
      continue;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    parts.push(`## ${sheetName}\n\n${csv.trim()}`);
  }
  const joined = parts.join("\n\n").trim();
  if (joined.length === 0) {
    return "(Spreadsheet contained no data.)";
  }
  return joined;
}

export async function convertBuiltin(absPath: string, format: DocumentFormat): Promise<string> {
  switch (format) {
    case "pdf":
      return convertPdf(absPath);
    case "docx":
      return convertDocx(absPath);
    case "xlsx":
      return convertXlsx(absPath);
    default:
      throw new Error(`Built-in converter does not support ${format}.`);
  }
}
