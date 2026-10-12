# AST Engine — Phân hệ 4

Phát hiện đạo văn mã nguồn Java bằng **ANTLR4 → chuẩn hóa cây → Winnowing → so khớp** (Python 3.11 + FastAPI).

| Bước | Thư mục | Trạng thái |
|---|---|---|
| 1. Parse Java (ANTLR4) | `src/ast_engine/parsing` | ✅ xong |
| 2. Chuẩn hóa cây + dự phòng lexer | `src/ast_engine/normalization` | ⏳ |
| 3. Winnowing | `src/ast_engine/fingerprint` | ⏳ |
| 4. So khớp / similarity matrix | `src/ast_engine/similarity` | ⏳ |
| 5. API `/analyze`, `/compare` | `src/ast_engine/api` | ⏳ (mới có `/health`) |

Chạy thử: xem `docs/ast-engine/INTEGRATION.md`. Tham số (k=15, window=25, ngưỡng 30/60) nằm ở `config.py`.

> Parser trong repo được sinh bằng `antlr-ng`; hãy chạy `pnpm --filter @swp391/ast-engine generate:parser`
> trên máy có Java để đồng nhất với ANTLR 4.13.2 rồi chạy lại test.
