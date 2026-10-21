import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import JSZip from "jszip";
import { parseOffice } from "officeparser";

export interface DocumentSection {
  id: string;
  title: string;
  summary: string;
  content: string;
  charCount: number;
}

export type SupportedFileType = "pdf" | "txt" | "docx" | "pptx";

export interface ParseDocumentResult {
  fileName: string;
  fileType: SupportedFileType;
  totalLength: number;
  sections: DocumentSection[];
}

/**
 * Parses and extracts document content into logical sections/chapters.
 * Supports PDF, TXT, DOCX, and PPTX with automatic fallback chunking.
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  fileName: string,
  mimetype: string
): Promise<ParseDocumentResult> {
  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimetype || "").toLowerCase();

  const isPdf = lowerMime.includes("pdf") || lowerName.endsWith(".pdf");
  const isDocx =
    lowerMime.includes("wordprocessingml") ||
    lowerMime.includes("msword") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc");
  const isPptx =
    lowerMime.includes("presentationml") ||
    lowerMime.includes("powerpoint") ||
    lowerName.endsWith(".pptx") ||
    lowerName.endsWith(".ppt");

  let detectedType: SupportedFileType = "txt";
  let fullText = "";
  let sections: DocumentSection[] = [];

  if (isPdf) {
    detectedType = "pdf";
    const parseFn: any = (pdfParse as any).default || pdfParse;
    const parsed = await parseFn(buffer);
    fullText = (parsed.text || "").replace(/\r\n/g, "\n").trim();
    if (!fullText) {
      throw new Error("PDF document does not contain text or text could not be extracted.");
    }
    sections = splitIntoSections(fullText);
  } else if (isDocx) {
    detectedType = "docx";
    const docxResult = await parseDocxBuffer(buffer);
    fullText = docxResult.fullText;
    sections = docxResult.sections;
  } else if (isPptx) {
    detectedType = "pptx";
    const pptxResult = await parsePptxBuffer(buffer);
    fullText = pptxResult.fullText;
    sections = pptxResult.sections;
  } else {
    // TXT default fallback
    detectedType = "txt";
    fullText = buffer.toString("utf-8").replace(/\r\n/g, "\n").trim();
    if (!fullText) {
      throw new Error("Text document is empty or text could not be extracted.");
    }
    sections = splitIntoSections(fullText);
  }

  if (sections.length === 0 && fullText.trim()) {
    sections = chunkTextEqually(fullText);
  }

  return {
    fileName,
    fileType: detectedType,
    totalLength: fullText.length,
    sections,
  };
}

/**
 * Extracts DOCX content using mammoth.
 * Converts to plain text and detects headings from Word structure or regex.
 */
async function parseDocxBuffer(
  buffer: Buffer
): Promise<{ fullText: string; sections: DocumentSection[] }> {
  try {
    const rawResult = await mammoth.extractRawText({ buffer });
    let text = (rawResult.value || "").replace(/\r\n/g, "\n").trim();

    if (!text) {
      throw new Error("DOCX document has no readable text content.");
    }

    const sections = splitIntoSections(text);
    return { fullText: text, sections };
  } catch (error: any) {
    // Fallback: Try with officeparser if mammoth encounters a special format
    try {
      const parsedText: any = await parseOffice(buffer);
      const text = String(parsedText || "").replace(/\r\n/g, "\n").trim();
      if (!text) throw new Error("Empty extracted office text");
      return { fullText: text, sections: splitIntoSections(text) };
    } catch {
      throw new Error(`Failed to parse DOCX document: ${error?.message || "Unknown error"}`);
    }
  }
}

/**
 * Extracts PowerPoint (.pptx) content:
 * Reads each slide from the OpenXML ZIP package to preserve slide order and independent context.
 */
async function parsePptxBuffer(
  buffer: Buffer
): Promise<{ fullText: string; sections: DocumentSection[] }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideEntries = Object.keys(zip.files)
      .filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/i.test(filePath))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });

    const slideSections: DocumentSection[] = [];
    const allTexts: string[] = [];

    for (let i = 0; i < slideEntries.length; i++) {
      const entryName = slideEntries[i];
      const xml = await zip.files[entryName].async("string");

      // Extract text strings from <a:t>...</a:t> tags
      const textMatches: string[] = [];
      const tagRegex = /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/gi;
      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(xml)) !== null) {
        const decoded = decodeXmlEntities(match[1].trim());
        if (decoded) textMatches.push(decoded);
      }

      if (textMatches.length === 0) continue;

      const slideTitle = textMatches[0].slice(0, 90);
      const slideBody = textMatches.join("\n").trim();
      allTexts.push(slideBody);

      slideSections.push({
        id: `slide-${i + 1}`,
        title: `Slide ${i + 1}: ${slideTitle}`,
        summary: slideBody.slice(0, 180).replace(/\s+/g, " ") + "...",
        content: slideBody,
        charCount: slideBody.length,
      });
    }

    if (slideSections.length > 0) {
      const fullText = allTexts.join("\n\n");
      return { fullText, sections: slideSections };
    }

    // Fallback: if individual slide XML cannot be read, use officeparser
    const parsedText: any = await parseOffice(buffer);
    const text = String(parsedText || "").replace(/\r\n/g, "\n").trim();
    if (!text) {
      throw new Error("PPTX document has no readable text content.");
    }
    return { fullText: text, sections: splitIntoSections(text) };
  } catch (error: any) {
    throw new Error(`Failed to parse PPTX presentation: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Decodes common XML entity characters
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Splits text into logical sections/chapters:
 * 1. Detects standard headings: "Chapter X", "Chương X", "Bài X", "Phần X", "X. Title"
 * 2. Fallback: If no chapters found, splits by block length (~2200 characters)
 */
function splitIntoSections(text: string): DocumentSection[] {
  const lines = text.split("\n");
  const rawSections: { title: string; lines: string[] }[] = [];

  // Regex to match common chapter/lesson headings in textbook documents
  const headingRegex =
    /^(chương|chapter|bài|phần|section|unit|module)\s+([0-9ivxlcdm]+|\d+)([\s:\.\-—]+.*)?$/i;
  const numberedHeadingRegex = /^(\d{1,2}\.[\d\.]*\s+[A-ZÀ-Ỹ\w\s]{3,})$/;

  let currentTitle = "Introduction / Overview";
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentLines.push(line);
      continue;
    }

    const isMatch = headingRegex.test(trimmed) || (trimmed.length < 90 && numberedHeadingRegex.test(trimmed));

    if (isMatch) {
      if (currentLines.some((l) => l.trim())) {
        rawSections.push({ title: currentTitle, lines: currentLines });
      }
      currentTitle = trimmed;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.some((l) => l.trim())) {
    rawSections.push({ title: currentTitle, lines: currentLines });
  }

  // Fallback: if the document has no standard headings or only one oversized block
  if (rawSections.length <= 1 && text.length > 3000) {
    return chunkTextEqually(text);
  }

  // Filter out empty sections (< 80 chars) caused by table-of-contents pages or repeated headers
  const filtered = rawSections.filter((sec) => sec.lines.join("\n").trim().length >= 80);
  const activeSections = filtered.length > 0 ? filtered : rawSections;

  return activeSections.map((sec, idx) => {
    const content = sec.lines.join("\n").trim();
    const snippet = content.replace(/\s+/g, " ").slice(0, 180);
    return {
      id: `sec-${idx + 1}`,
      title: sec.title.slice(0, 120),
      summary: snippet ? `${snippet}...` : "Chapter content",
      content,
      charCount: content.length,
    };
  });
}

/**
 * Splits text evenly into manageable parts (~2200-3000 characters) when no clear headings exist
 */
function chunkTextEqually(text: string): DocumentSection[] {
  // Split by paragraphs or lines
  const blocks = text.includes("\n\n") ? text.split(/\n\s*\n/) : text.split("\n");
  const sections: DocumentSection[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;
  let partIndex = 1;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (currentLength + trimmed.length > 2200 && currentChunk.length > 0) {
      const content = currentChunk.join("\n\n");
      sections.push({
        id: `sec-${partIndex}`,
        title: `Part ${partIndex}`,
        summary: content.slice(0, 180).replace(/\s+/g, " ") + "...",
        content,
        charCount: content.length,
      });
      partIndex++;
      currentChunk = [trimmed];
      currentLength = trimmed.length;
    } else {
      currentChunk.push(trimmed);
      currentLength += trimmed.length;
    }
  }

  if (currentChunk.length > 0) {
    const content = currentChunk.join("\n\n");
    sections.push({
      id: `sec-${partIndex}`,
      title: `Part ${partIndex}`,
      summary: content.slice(0, 180).replace(/\s+/g, " ") + "...",
      content,
      charCount: content.length,
    });
  }

  return sections;
}
