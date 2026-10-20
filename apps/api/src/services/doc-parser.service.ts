import pdfParse from "pdf-parse";

export interface DocumentSection {
  id: string;
  title: string;
  summary: string;
  content: string;
  charCount: number;
}

export interface ParseDocumentResult {
  fileName: string;
  fileType: "pdf" | "txt";
  totalLength: number;
  sections: DocumentSection[];
}

/**
 * Parses and extracts document content into logical sections/chapters.
 * Supports PDF and TXT with automatic fallback chunking.
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  fileName: string,
  mimetype: string
): Promise<ParseDocumentResult> {
  let fullText = "";
  const isPdf =
    mimetype === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const parseFn: any = (pdfParse as any).default || pdfParse;
    const parsed = await parseFn(buffer);
    fullText = parsed.text || "";
  } else {
    fullText = buffer.toString("utf-8");
  }

  // Normalize line breaks
  fullText = fullText.replace(/\r\n/g, "\n").trim();

  if (!fullText) {
    throw new Error("Document does not contain text or text could not be extracted.");
  }

  const sections = splitIntoSections(fullText);

  return {
    fileName,
    fileType: isPdf ? "pdf" : "txt",
    totalLength: fullText.length,
    sections,
  };
}

/**
 * Tách văn bản thành các mục/chương logic:
 * 1. Nhận diện các tiêu đề chuẩn: "Chapter X", "Chương X", "Bài X", "Phần X", "X. Tiêu đề"
 * 2. Fallback: Nếu không tìm thấy chương, chia theo độ dài khối (~2000 ký tự)
 */
function splitIntoSections(text: string): DocumentSection[] {
  const lines = text.split("\n");
  const rawSections: { title: string; lines: string[] }[] = [];

  // Regex bắt các tiêu đề chương/bài phổ biến trong tài liệu giáo trình
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

  // Fallback: nếu tài liệu không có heading chuẩn hoặc chỉ tách được 1 khối quá dài
  if (rawSections.length <= 1 && text.length > 3000) {
    return chunkTextEqually(text);
  }

  // Lọc các section rỗng (< 80 ký tự) do trang mục lục hoặc header lặp
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
 * Chia đều văn bản thành các phần vừa phải (~2500 - 3000 ký tự) khi không có tiêu đề rõ ràng
 */
function chunkTextEqually(text: string): DocumentSection[] {
  // Tách theo đoạn văn hoặc dòng
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
        title: `Phần ${partIndex}`,
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
      title: `Phần ${partIndex}`,
      summary: content.slice(0, 180).replace(/\s+/g, " ") + "...",
      content,
      charCount: content.length,
    });
  }

  return sections;
}
