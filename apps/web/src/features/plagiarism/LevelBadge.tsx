import { LEVEL_STYLE, resolveLevel } from './level';

// Huy hiệu mức độ dùng chung cho màn hình sinh viên và giảng viên.
export default function LevelBadge({
  percent,
  level,
  solid = false,
  suffix = '',
}: {
  percent: number;
  level?: string | null;
  solid?: boolean;
  suffix?: string;
}) {
  const lv = resolveLevel(percent, level);
  const s = LEVEL_STYLE[lv];
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${solid ? s.solid : s.badge}`}>
      {s.label}
      {suffix}
    </span>
  );
}
