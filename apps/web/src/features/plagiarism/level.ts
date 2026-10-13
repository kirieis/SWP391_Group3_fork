// Mức độ tương đồng do AST Engine quyết định (SRS US14, ADR-001):
//   SAFE    : < 30%
//   WARNING : 30% .. 60% (đúng 60% vẫn là WARNING)
//   DANGER  : > 60%  -> gateway giữ điểm (SCORE_WITHHELD)
// Ưu tiên dùng `level` mà backend trả về. Chỉ khi backend chưa trả (ví dụ màn hình sinh viên
// chỉ nhận similarityPercent) mới tự suy ra từ phần trăm theo đúng ngưỡng trên.

export type PlagiarismLevel = 'SAFE' | 'WARNING' | 'DANGER';

export function levelFromPercent(percent: number): PlagiarismLevel {
  if (percent > 60) return 'DANGER';
  if (percent >= 30) return 'WARNING';
  return 'SAFE';
}

export function resolveLevel(percent: number, level?: string | null): PlagiarismLevel {
  if (level === 'SAFE' || level === 'WARNING' || level === 'DANGER') return level;
  return levelFromPercent(percent);
}

// Màu theo mức (Tailwind). Không dựa vào màu đơn thuần: huy hiệu luôn có chữ.
export const LEVEL_STYLE: Record<PlagiarismLevel, { badge: string; solid: string; ring: string; label: string }> = {
  SAFE: {
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    solid: 'bg-emerald-500 text-white',
    ring: 'border-t-emerald-500',
    label: 'SAFE',
  },
  WARNING: {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    solid: 'bg-amber-500 text-white',
    ring: 'border-t-amber-500',
    label: 'WARNING',
  },
  DANGER: {
    badge: 'bg-rose-50 text-rose-700 border border-rose-200',
    solid: 'bg-rose-600 text-white',
    ring: 'border-t-rose-500',
    label: 'DANGER',
  },
};

// Đoạn trùng do engine trả: a_lines thuộc submission_1, b_lines thuộc submission_2 (số dòng, bắt đầu từ 1).
export interface MatchedFragment {
  a_lines: [number, number];
  b_lines: [number, number];
}

// Gateway lưu matchedFragments dạng chuỗi JSON; chấp nhận cả mảng lẫn chuỗi, dữ liệu hỏng thì trả mảng rỗng.
export function parseFragments(raw: unknown): MatchedFragment[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: MatchedFragment[] = [];
  for (const f of value) {
    const a = (f as any)?.a_lines;
    const b = (f as any)?.b_lines;
    if (Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2) {
      out.push({ a_lines: [Number(a[0]), Number(a[1])], b_lines: [Number(b[0]), Number(b[1])] });
    }
  }
  return out;
}
