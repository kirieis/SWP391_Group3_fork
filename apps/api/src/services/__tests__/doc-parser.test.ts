import { parseDocumentBuffer } from "../doc-parser.service.js";

async function runDocParserTest() {
  console.log("=== BẮT ĐẦU KIỂM THỬ DOC PARSER SERVICE ===");

  // 1. Test với văn bản có tiêu đề Chương / Bài
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

  console.log(`[Test 1 - Heading Detection] Tìm thấy ${res1.sections.length} phần:`);
  res1.sections.forEach((sec, idx) => {
    console.log(`  ${idx + 1}. [${sec.id}] ${sec.title} (${sec.charCount} ký tự)`);
  });

  if (res1.sections.length >= 3) {
    console.log("✅ Test 1 PASSED: Tách chương chính xác theo tiêu đề 'Chương X'.");
  } else {
    console.error("❌ Test 1 FAILED: Không tách đủ các chương.");
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

  console.log("\n🎉 TẤT CẢ CÁC CA KIỂM THỬ DOC PARSER THÀNH CÔNG RỰC RỠ!");
}

runDocParserTest().catch((err) => {
  console.error("Lỗi kiểm thử:", err);
  process.exit(1);
});
