import { LEVEL_STYLE, resolveLevel } from './level';

// Huy hiệu mức độ nghi vấn AST dùng chung cho sinh viên và giảng viên
export default function LevelBadge({
  percent,
  level,
  solid = false,
  suffix = '',
  className = '',
}: {
  percent: number;
  level?: string | null;
  solid?: boolean;
  suffix?: string;
  className?: string;
}) {
  const lv = resolveLevel(percent, level);
  const s = LEVEL_STYLE[lv];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
        solid ? s.solid : s.badge
      } ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          lv === 'SAFE' ? 'bg-emerald-500' : lv === 'WARNING' ? 'bg-amber-500' : 'bg-rose-500'
        }`}
        aria-hidden="true"
      />
      <span>
        {s.label}
        {suffix}
      </span>
    </span>
  );
}
