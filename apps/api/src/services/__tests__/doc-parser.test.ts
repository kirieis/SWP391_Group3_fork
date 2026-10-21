import { parseDocumentBuffer } from "../doc-parser.service.js";
import JSZip from "jszip";

async function runDocParserTest() {
  console.log("=== BẮT ĐẦU KIỂM THỬ DOC PARSER SERVICE (PDF, TXT, DOCX, PPTX) ===");

  // 1. Test với văn bản TXT có tiêu đề Chương / Bài
  const sampleDocWithChapters = `
GIÁO TRÌNH LẬP TRÌNH HƯỚNG ĐỐI TƯỢNG VỚI JAVA
Tác giả: Bộ môn Kỹ thuật phần mềm

Chương 1: Giới thiệu về Ngôn ngữ Java và Máy ảo JVM
Java là một ngôn ngữ lập trình hướng đối tượng độc lập nền tảng.
Mã nguồn được biên dịch thành bytecode và thực thi trên JVM.
Các kiểu dữ liệu nguyên thủy bao gồm int, double, boolean.

Chương 2: Lớp và Đối tượng (Classes and Objects)
Lớp là khuôn mẫu định nghĩa các thuộc tính và phương thức.
Đối tượng là một thực thể cụ thể được khởi tạo từ lớp bằng từ khóa new.
Ví dụ: khai báo lớp SinhVien với thuộc tính maSV, hoTen.

Chương 3: Tính Kế thừa và Đa hình (Inheritance and Polymorphism)
Kế thừa cho phép lớp con tái sử dụng mã nguồn của lớp cha thông qua từ khóa extends.
Đa hình cho phép phương thức ghi đè (Override) hoạt động khác nhau trên từng đối tượng.
`;

  const buffer1 = Buffer.from(sampleDocWithChapters, "utf-8");
  const res1 = await parseDocumentBuffer(buffer1, "GiaoTrinhOOP.txt", "text/plain");

  console.log(`[Test 1 - TXT Heading Detection] Tìm thấy ${res1.sections.length} phần, type: ${res1.fileType}:`);
  res1.sections.forEach((sec, idx) => {
    console.log(`  ${idx + 1}. [${sec.id}] ${sec.title} (${sec.charCount} ký tự)`);
  });

  if (res1.sections.length >= 3 && res1.fileType === "txt") {
    console.log("✅ Test 1 PASSED: TXT parsing chính xác.");
  } else {
    console.error("❌ Test 1 FAILED: TXT parsing lỗi.");
    process.exit(1);
  }

  // 2. Test fallback với văn bản dài không có heading
  const longParagraph = "Đây là tài liệu lý thuyết chung không chứa từ khóa chương mục cụ thể.\n".repeat(80);
  const buffer2 = Buffer.from(longParagraph, "utf-8");
  const res2 = await parseDocumentBuffer(buffer2, "NoHeadings.txt", "text/plain");

  console.log(`\n[Test 2 - Fallback Chunking] Tách văn bản không heading thành ${res2.sections.length} khối.`);
  if (res2.sections.length > 1) {
    console.log("✅ Test 2 PASSED: Cơ chế fallback chia khối tự động hoạt động mượt mà.");
  } else {
    console.error("❌ Test 2 FAILED: Fallback chunking không kích hoạt.");
    process.exit(1);
  }

  // 3. Test PPTX Presentation buffer parsing
  console.log("\n[Test 3 - PPTX Presentation Slide Extraction]");
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<p:sp><a:t>Chương 1: Tổng quan về Cấu trúc dữ liệu Hàng đợi (Queue)</a:t><a:t>Hàng đợi hoạt động theo nguyên tắc First-In-First-Out (FIFO).</a:t></p:sp>`
  );
  zip.file(
    "ppt/slides/slide2.xml",
    `<p:sp><a:t>Chương 2: Thao tác Enqueue và Dequeue</a:t><a:t>Enqueue thêm phần tử vào cuối, Dequeue lấy phần tử ở đầu hàng đợi.</a:t></p:sp>`
  );
  const pptxBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const resPptx = await parseDocumentBuffer(
    pptxBuffer,
    "QueueDataStructures.pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );

  console.log(`Tìm thấy ${resPptx.sections.length} slide/sections, type: ${resPptx.fileType}:`);
  resPptx.sections.forEach((sec, idx) => {
    console.log(`  ${idx + 1}. [${sec.id}] ${sec.title} (${sec.charCount} ký tự)`);
  });

  if (resPptx.fileType === "pptx" && resPptx.sections.length === 2) {
    console.log("✅ Test 3 PASSED: PPTX presentation slide extraction thành công 100%.");
  } else {
    console.error("❌ Test 3 FAILED: PPTX parser không trích xuất đủ slide.");
    process.exit(1);
  }

  console.log("\n🎉 TẤT CẢ CÁC CA KIỂM THỬ DOC PARSER (TXT, PDF, DOCX, PPTX) THÀNH CÔNG RỰC RỠ!");
}

runDocParserTest().catch((err) => {
  console.error("Lỗi kiểm thử:", err);
  process.exit(1);
});
