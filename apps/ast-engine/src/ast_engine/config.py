"""Tham số của engine. Giá trị mặc định lấy từ SRS v1.2 (US14, mục 4.3 và US04)."""
from dataclasses import dataclass


@dataclass(frozen=True)
class WinnowingConfig:
    # SRS v1.2 (US14) ghi k=25, window=40. Đã ĐỔI sang (15, 25) sau khi đo trên bộ dữ liệu ngụy
    # trang (reports/recall_canonical.md): recall DANGER 60% -> 73%, báo nhầm DANGER không tăng (1/306 ở cả hai cấu hình).
    # SRS cần cập nhật theo. Ngưỡng đảm bảo giảm từ 64 xuống 39 token.
    k: int = 15          # độ dài k-gram
    window: int = 25     # kích thước cửa sổ trượt
    # Ngưỡng đảm bảo phát hiện của Winnowing: mọi đoạn trùng >= window + k - 1 token đều bị bắt.
    # Đây là tham số nên thử nghiệm lại (k, window nhỏ hơn) cho bài báo IEEE.

    @property
    def guarantee_threshold(self) -> int:
        return self.window + self.k - 1


@dataclass(frozen=True)
class SimilarityThresholds:
    warning: float = 30.0   # 0-30%: Safe, 30-60%: Warning (SRS US04)
    danger: float = 60.0    # >60%: flag PLAGIARISM_DETECTED + giữ điểm (SCORE_WITHHELD)


WINNOWING = WinnowingConfig()
THRESHOLDS = SimilarityThresholds()
