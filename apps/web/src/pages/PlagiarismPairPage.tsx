import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, ShieldAlert, Info } from 'lucide-react';
import { apiRequest } from '../services/api';
import LevelBadge from '../features/plagiarism/LevelBadge';
import { LEVEL_STYLE, parseFragments, resolveLevel } from '../features/plagiarism/level';
import type { MatchedFragment } from '../features/plagiarism/level';
import { DEMO_PAIR } from '../features/plagiarism/demoPair';

// Trang giảng viên: so sánh song song hai assignments nghi trùng và tô sáng các matching lines.
//
// Hợp đồng API cần từ backend (xem CanSua / ghi chú gửi An):
//   GET /api/plagiarism/matches/:matchId   (chỉ giảng viên của lớp)
//   -> data: {
//        id, similarityPercent, level, mode,            // mode: 'ast' | 'lex'
//        matchedFragments,                              // chuỗi JSON hoặc mảng [{a_lines:[s,e], b_lines:[s,e]}]
//        submission1: { id, studentCode, fullName, code },   // a_lines thuộc submission1
//        submission2: { id, studentCode, fullName, code }    // b_lines thuộc submission2
//      }
// Not available endpoint thì mở /lecturer/plagiarism/demo để xem bằng dữ liệu mẫu.

interface PairSide {
  id?: string;
  studentCode?: string;
  fullName?: string;
  code: string;
}

interface PairData {
  id: string;
  similarityPercent: number;
  level?: string | null;
  mode?: string | null;
  fragments: MatchedFragment[];
  a: PairSide;
  b: PairSide;
}

// Chuẩn hóa phản hồi (chấp nhận vài cách đặt tên field) để trang không vỡ khi backend đổi nhẹ.
function normalize(raw: any): PairData | null {
  if (!raw) return null;
  const s1 = raw.submission1 ?? raw.submission_1;
  const s2 = raw.submission2 ?? raw.submission_2;
  if (!s1 || !s2) return null;
  const side = (s: any): PairSide => ({
    id: s.id,
    studentCode: s.studentCode ?? s.student?.studentCode,
    fullName: s.fullName ?? s.student?.fullName,
    code: String(s.code ?? s.sourceCode ?? ''),
  });
  return {
    id: String(raw.id),
    similarityPercent: Number(raw.similarityPercent ?? 0),
    level: raw.level,
    mode: raw.mode,
    fragments: parseFragments(raw.matchedFragments),
    a: side(s1),
    b: side(s2),
  };
}

// Tập số dòng được tô sáng từ danh sách đoạn trùng.
function highlightedLines(ranges: Array<[number, number]>): Set<number> {
  const set = new Set<number>();
  for (const [start, end] of ranges) {
    for (let i = start; i <= end; i++) set.add(i);
  }
  return set;
}

function CodePanel({
  title,
  subtitle,
  code,
  marked,
  markClass,
}: {
  title: string;
  subtitle: string;
  code: string;
  marked: Set<number>;
  markClass: string;
}) {
  const lines = useMemo(() => code.split(/\r?\n/), [code]);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-w-0">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <div className="overflow-auto max-h-[70vh] bg-slate-50">
        <pre className="text-xs font-mono leading-5 py-2 m-0 w-max min-w-full">
          {lines.map((text, i) => {
            const n = i + 1;
            const isMarked = marked.has(n);
            return (
              <div key={n} className={`flex ${isMarked ? markClass : ''}`}>
                <span className="select-none w-10 shrink-0 text-right pr-3 text-slate-400">{n}</span>
                <span className="whitespace-pre pr-4">{text || ' '}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

export default function PlagiarismPairPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [pair, setPair] = useState<PairData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      if (matchId === 'demo') {
        if (!cancelled) {
          setPair(normalize(DEMO_PAIR));
          setLoading(false);
        }
        return;
      }
      const res = await apiRequest<any>(`/plagiarism/matches/${matchId}`);
      if (cancelled) return;
      const parsed = res.success ? normalize(res.data) : null;
      if (!parsed) {
        setError(
          res.message ||
            'Unable to load the comparison data. The backend must provide GET /api/plagiarism/matches/:id with the source code for both submissions.'
        );
      }
      setPair(parsed);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const marksA = useMemo(() => highlightedLines(pair?.fragments.map((f) => f.a_lines) ?? []), [pair]);
  const marksB = useMemo(() => highlightedLines(pair?.fragments.map((f) => f.b_lines) ?? []), [pair]);

  const level = pair ? resolveLevel(pair.similarityPercent, pair.level) : 'SAFE';
  const markClass =
    level === 'DANGER' ? 'bg-rose-100 border-l-2 border-rose-400' : 'bg-amber-100 border-l-2 border-amber-400';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 flex flex-col items-center">
      <div className="max-w-7xl w-full space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-2 rounded-xl transition shadow-sm"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            <span>Loading suspected matching submissions...</span>
          </div>
        )}

        {!loading && error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-sm text-rose-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to open the comparison page</p>
              <p className="text-xs mt-1">{error}</p>
              <button
                onClick={() => navigate('/lecturer/plagiarism/demo')}
                className="text-xs text-indigo-700 underline mt-2"
              >
                View demo data
              </button>
            </div>
          </div>
        )}

        {!loading && pair && (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={`w-20 h-20 rounded-full border-8 border-slate-100 ${LEVEL_STYLE[level].ring} flex items-center justify-center`}
                >
                  <span className="text-lg font-extrabold text-slate-900">{pair.similarityPercent.toFixed(0)}%</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-bold text-slate-900">Compare two submissions</h1>
                    <LevelBadge percent={pair.similarityPercent} level={pair.level} solid />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {pair.a.studentCode} {pair.a.fullName} ↔ {pair.b.studentCode} {pair.b.fullName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {pair.mode === 'lex'
                      ? 'Compared by token sequence (syntax errors prevented AST construction).'
                      : 'Compared using normalized syntax trees; variable renaming, function order, and for/while changes can still be detected.'}
                  </p>
                </div>
              </div>

              {level === 'DANGER' && (
                <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">
                  <ShieldAlert size={16} />
                  <span>This submission’s score is withheld for lecturer review</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 text-[11px] text-slate-500">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p>
                Highlighted areas have matching code structures ({pair.fragments.length} sections). This is a reference for lecturer review
                not a plagiarism verdict: basic algorithms such as sorting and searching can naturally look similar.
                
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CodePanel
                title={`${pair.a.studentCode ?? ''} ${pair.a.fullName ?? 'Submission 1'}`.trim()}
                subtitle={`${marksA.size} matching lines`}
                code={pair.a.code}
                marked={marksA}
                markClass={markClass}
              />
              <CodePanel
                title={`${pair.b.studentCode ?? ''} ${pair.b.fullName ?? 'Submission 2'}`.trim()}
                subtitle={`${marksB.size} matching lines`}
                code={pair.b.code}
                marked={marksB}
                markClass={markClass}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
