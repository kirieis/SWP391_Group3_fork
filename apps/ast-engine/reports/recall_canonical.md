# Kết quả đo recall (k=15, window=25)

Dataset: 3 nhóm — 15 cặp ĐẠO VĂN, 306 cặp KHÔNG đạo văn.

## 1. Similarity trung bình theo mức ngụy trang

| Mức | Kỹ thuật | AST+LEX (pipeline) | Chỉ LEX | Min (pipeline) |
|---|---|---|---|---|
| L1 | đổi tên | 100% | 100% | 100% |
| L2 | + comment, đổi literal | 100% | 100% | 100% |
| L3 | + đảo thứ tự hàm | 100% | 55% | 100% |
| L4 | AI viết lại (for→while, i++→i+=1, đảo if/else, tách hàm) | 63% | 36% | 58% |
| L5 | AI viết lại mạnh (lambda, đệ quy, lớp phụ, code thừa) | 27% | 12% | 14% |

## 2. Chi tiết từng cặp đạo văn (pipeline)

| Cặp | Similarity | Mức | Chế độ |
|---|---|---|---|
| bank:l1_rename | 100% | DANGER | ast |
| bank:l2_comments | 100% | DANGER | ast |
| bank:l3_reorder | 100% | DANGER | ast |
| bank:l4_ai_restyle | 58% | WARNING | ast |
| bank:l5_ai_heavy | 31% | WARNING | ast |
| sorting:l1_rename | 100% | DANGER | ast |
| sorting:l2_comments | 100% | DANGER | ast |
| sorting:l3_reorder | 100% | DANGER | ast |
| sorting:l4_ai_restyle | 70% | DANGER | ast |
| sorting:l5_ai_heavy | 14% | SAFE | ast |
| stack:l1_rename | 100% | DANGER | ast |
| stack:l2_comments | 100% | DANGER | ast |
| stack:l3_reorder | 100% | DANGER | ast |
| stack:l4_ai_restyle | 61% | DANGER | ast |
| stack:l5_ai_heavy | 36% | WARNING | ast |

## 3. Tổng hợp

| | Pipeline (AST+LEX) | Chỉ LEX |
|---|---|---|
| Recall mức DANGER (>60%) | 11/15 = 73% | 8/15 = 53% |
| Recall mức WARNING+ (≥30%) | 14/15 = 93% | 11/15 = 73% |
| Báo nhầm mức DANGER | 1/306 = 0% | 0/306 = 0% |
| Báo nhầm mức WARNING+ | 13/306 = 4% | 3/306 = 1% |

## 4. Các cặp KHÔNG đạo văn có điểm đáng chú ý (≥ 10%)

| Cặp | Similarity | Mức |
|---|---|---|
| sorting:independent~independent2 | 66% | DANGER |
| bank:l4_ai_restyle~independent2 | 55% | WARNING |
| sorting:l1_rename~independent2 | 54% | WARNING |
| sorting:l2_comments~independent2 | 54% | WARNING |
| sorting:l3_reorder~independent2 | 54% | WARNING |
| sorting:original~independent2 | 54% | WARNING |
| sorting:l4_ai_restyle~independent2 | 45% | WARNING |
| sorting:independent~independent3 | 33% | WARNING |
| stack:l1_rename~independent3 | 30% | WARNING |
| stack:l2_comments~independent3 | 30% | WARNING |
| stack:l3_reorder~independent3 | 30% | WARNING |
| stack:l5_ai_heavy~independent3 | 30% | WARNING |
| stack:original~independent3 | 30% | WARNING |
| bank:l1_rename~independent2 | 27% | SAFE |
| bank:l2_comments~independent2 | 27% | SAFE |
| bank:l3_reorder~independent2 | 27% | SAFE |
| bank:original~independent2 | 27% | SAFE |
| sorting:l1_rename~independent | 22% | SAFE |
| sorting:l2_comments~independent | 22% | SAFE |
| sorting:l3_reorder~independent | 22% | SAFE |
| sorting:l4_ai_restyle~independent | 22% | SAFE |
| sorting:original~independent | 22% | SAFE |
| bank:l5_ai_heavy~independent2 | 21% | SAFE |
| bank:l1_rename~independent | 20% | SAFE |
| bank:l2_comments~independent | 20% | SAFE |
| bank:l3_reorder~independent | 20% | SAFE |
| bank:l4_ai_restyle~independent | 20% | SAFE |
| bank:original~independent | 20% | SAFE |
| stack:l4_ai_restyle~independent3 | 20% | SAFE |
| stack:independent~independent2 | 17% | SAFE |
| stack:independent~independent3 | 17% | SAFE |
| sorting:l4_ai_restyle~independent3 | 14% | SAFE |
| sorting:l5_ai_heavy~independent3 | 14% | SAFE |
| bank:independent~independent3 | 13% | SAFE |
| stack:l1_rename~independent | 11% | SAFE |
| stack:l2_comments~independent | 11% | SAFE |
| stack:l3_reorder~independent | 11% | SAFE |
| stack:l5_ai_heavy~independent | 11% | SAFE |
| stack:original~independent | 11% | SAFE |
| bank:l1_rename~independent3 | 10% | SAFE |
| bank:l2_comments~independent3 | 10% | SAFE |
| bank:l3_reorder~independent3 | 10% | SAFE |
| bank:l4_ai_restyle~independent3 | 10% | SAFE |
| bank:original~independent3 | 10% | SAFE |
| stack:independent2~independent3 | 10% | SAFE |

## 5. Quét tham số (k, window)

| k | window | ngưỡng đảm bảo (w+k-1) | Recall DANGER | Recall WARNING+ | Báo nhầm DANGER | Báo nhầm WARNING+ | Recall L4 | Recall L5 |
|---|---|---|---|---|---|---|---|---|
| 15 | 25 | 39 | 11/15 = 73% | 14/15 = 93% | 1/306 = 0% | 13/306 = 4% | 2/3 = 67% | 0/3 = 0% |
| 25 | 40 | 64 | 9/15 = 60% | 12/15 = 80% | 1/306 = 0% | 6/306 = 2% | 0/3 = 0% | 0/3 = 0% |
| 10 | 15 | 24 | 12/15 = 80% | 14/15 = 93% | 6/306 = 2% | 22/306 = 7% | 3/3 = 100% | 0/3 = 0% |
| 8 | 12 | 19 | 12/15 = 80% | 15/15 = 100% | 11/306 = 4% | 26/306 = 8% | 3/3 = 100% | 0/3 = 0% |
| 5 | 8 | 12 | 14/15 = 93% | 15/15 = 100% | 17/306 = 6% | 87/306 = 28% | 3/3 = 100% | 2/3 = 67% |

## Giới hạn của phép đo (đọc trước khi trích số liệu)

- Mẫu NHỎ: số cặp đạo văn ít nên mỗi % thay đổi rất lớn; chưa đủ để kết luận thống kê.
- Biến thể L4/L5 do người viết tay mô phỏng cách AI ngụy trang, KHÔNG phải bài thật của đối thủ. Cần thay/bổ sung bằng biến thể AI sinh thật và bài nhóm khác nộp thử lúc P2P.
- Cặp ÂM chủ yếu là các chương trình khác đề (dễ). Chỉ có vài cặp 'cùng đề, viết độc lập' (khó) nên tỉ lệ báo nhầm ở đây đang bị đánh giá THẤP hơn thực tế.
- Recall tổng gộp cả L1-L3 (dễ) nên cao hơn recall trên riêng L4/L5; hãy xem bảng theo từng mức.
