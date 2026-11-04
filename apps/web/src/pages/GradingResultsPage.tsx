import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  RotateCw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { LEVEL_STYLE, resolveLevel } from '../features/plagiarism/level';

// Kiểu dữ liệu test case từ backend
interface TestCaseItem {
  id?: string;
  inputData?: string;
  expectedOutput?: string;
  scoreWeight?: number;
  isHidden?: boolean;
  [key: string]: unknown;
}

// Kiểu pairs nghi vấn đạo văn
interface PlagiarismMatch {
  similarityPercent?: number;
  [key: string]: unknown;
}

// Error type từ backend classifyErrorType (US-04)
type ErrorType = 'PASSED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIMEOUT' | 'MLE' | 'MEMORY_LIMIT_EXCEEDED';

interface TestCaseResult {
  testCaseId?: string;
  passed: boolean;
  actualOutput?: string;
  expectedOutput?: string;
  inputData?: string | null;
  durationMs?: number;
  error?: string;
  errorType?: ErrorType;
  scoreWeight?: number;
  isHidden?: boolean;
  status?: string;
}

// Kiểu submission từ backend
// US-04: bổ sung automaticScore và lecturerScore
interface SubmissionData {
  id?: string;
  status?: string;
  astCheckStatus?: string;
  totalScore?: number | null;
  automaticScore?: number | null;
  lecturerScore?: number | null;
  manualScore?: number | null;
  aiFeedback?: string | null;
  lecturerFeedback?: Array<{ id: string; comment: string; score: number; createdAt: string; lecturerName: string }>;
  testResults?: TestCaseResult[];
  assignment?: {
    testCases?: TestCaseItem[];
    [key: string]: unknown;
  };
  plagiarismMatches1?: PlagiarismMatch[];
  plagiarismMatches2?: PlagiarismMatch[];
  [key: string]: unknown;
}

// =============================================================================
// US-04: DetailedTestResults Component
// Hiển thị danh sách test case chi tiết với diff view, error classification,
// và score breakdown (Automatic / Lecturer / Official)
// =============================================================================

// Helper: phân loại error badge style
function getErrorBadgeStyle(errorType: string | undefined, passed: boolean) {
  if (passed || errorType === 'PASSED') return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'PASSED' };
  switch (errorType) {
    case 'COMPILE_ERROR': return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'COMPILE ERROR' };
    case 'RUNTIME_ERROR': return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'RUNTIME ERROR' };
    case 'TIMEOUT':       return { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  label: 'TIMEOUT' };
    case 'MLE':
    case 'MEMORY_LIMIT_EXCEEDED': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'MEM LIMIT' };
    case 'WRONG_ANSWER':
    default:              return { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   label: 'WRONG ANSWER' };
  }
}

// Helper: diff line-by-line, trả về mảng {line, type: 'equal'|'expected'|'actual'}
function computeDiff(expected: string, actual: string) {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const maxLen = Math.max(expLines.length, actLines.length);
  const result: { exp: string | null; act: string | null; match: boolean }[] = [];
  for (let i = 0; i < maxLen; i++) {
    const e = expLines[i] ?? null;
    const a = actLines[i] ?? null;
    result.push({ exp: e, act: a, match: e === a });
  }
  return result;
}

interface DetailedTestResultsProps {
  testResults: TestCaseResult[];
  isPending: boolean;
  automaticScore?: number | null;
  lecturerScore?: number | null;
  totalScore?: number | null;
  isScoreWithheld: boolean;
}

function DetailedTestResults({
  testResults,
  isPending,
  automaticScore,
  lecturerScore,
  totalScore,
  isScoreWithheld,
}: DetailedTestResultsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState<Record<number, boolean>>({});

  const passedCount = testResults.filter((r) => r.passed).length;
  const totalWeight = testResults.reduce((sum, r) => sum + (r.scoreWeight ?? 1), 0);
  const passedWeight = testResults.filter((r) => r.passed).reduce((sum, r) => sum + (r.scoreWeight ?? 1), 0);

  const normalizeScore = (s: number | null | undefined): string => {
    if (s === null || s === undefined) return '---';
    const n = Number(s);
    // Nếu score > 10, chuẩn hóa về thang 10 (legacy: một số nơi lưu thang 100)
    return (n > 10 ? n / 10 : n).toFixed(1);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Detailed Test Results</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isPending ? 'Grading in progress...' : `${passedCount} / ${testResults.length} test cases passed`}
              </p>
            </div>
          </div>
          {/* Pass rate bar */}
          {!isPending && testResults.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(passedCount / testResults.length) * 100}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600">
                {Math.round((passedCount / testResults.length) * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Test Case List */}
      <div className="divide-y divide-slate-100">
        {testResults.map((result, idx) => {
          const badge = getErrorBadgeStyle(result.errorType, result.passed);
          const isHidden = Boolean(result.isHidden);
          const isExpanded = expandedIdx === idx;
          const isDiffShown = showDiff[idx] ?? false;
          const hasExpectedAndActual =
            result.expectedOutput !== undefined && result.expectedOutput !== null &&
            result.actualOutput !== undefined && result.actualOutput !== null;
          const diffLines = hasExpectedAndActual
            ? computeDiff(result.expectedOutput ?? '', result.actualOutput ?? '')
            : [];
          const hasDiff = diffLines.some((d) => !d.match);

          return (
            <div key={result.testCaseId || idx}>
              {/* Row header */}
              <button
                type="button"
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition text-left"
              >
                {/* Status icon */}
                {result.passed ? (
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                ) : result.errorType === 'TIMEOUT' ? (
                  <Clock size={16} className="text-amber-500 shrink-0" />
                ) : (
                  <XCircle size={16} className="text-rose-500 shrink-0" />
                )}

                <span className="text-xs font-semibold text-slate-700 min-w-[90px]">
                  Test Case #{idx + 1}
                </span>

                {/* Error badge */}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                  {badge.label}
                </span>

                {/* Score weight */}
                <span className="ml-auto text-[11px] text-slate-400 mr-2">
                  Weight: {result.scoreWeight ?? 1} pt{(result.scoreWeight ?? 1) > 1 ? 's' : ''}
                </span>

                {/* Duration */}
                {result.durationMs !== undefined && (
                  <span className="text-[10px] text-slate-400 font-mono mr-2">{result.durationMs} ms</span>
                )}

                {isExpanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100 p-5 space-y-4 text-xs">
                  {/* Test Case ID */}
                  {result.testCaseId && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-28 shrink-0">Test Case ID</span>
                      <span className="font-mono text-indigo-600 break-all">{result.testCaseId}</span>
                    </div>
                  )}

                  {isHidden ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                      <p className="font-semibold">Hidden test case</p>
                      <p className="mt-1">Test data and program output are hidden for student privacy.</p>
                    </div>
                  ) : (
                    <>
                  {isHidden ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                      <p className="font-semibold">Hidden test case</p>
                      <p className="mt-1">Test data and program output are hidden for student privacy.</p>
                    </div>
                  ) : (
                    <>
                  {/* Input */}
                  {result.inputData !== null && result.inputData !== undefined && (
                    <div>
                      <span className="text-slate-400 block mb-1">Input</span>
                      <pre className="bg-white border border-slate-200 rounded-xl p-3 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                        {result.inputData || '(empty)'}
                      </pre>
                    </div>
                  )}

                  {/* Expected vs Actual Output with optional diff */}
                  {!result.passed && hasExpectedAndActual ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400">Output Comparison</span>
                        {hasDiff && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowDiff((prev) => ({ ...prev, [idx]: !isDiffShown })); }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline"
                          >
                            {isDiffShown ? 'Show side-by-side' : 'Show diff'}
                          </button>
                        )}
                      </div>

                      {isDiffShown ? (
                        // Diff view: line by line highlight
                        <div className="border border-slate-200 rounded-xl overflow-hidden font-mono text-[10px]">
                          <div className="grid grid-cols-2 divide-x divide-slate-200">
                            <div className="bg-emerald-50 px-2 py-1 text-emerald-700 font-semibold text-[10px]">Expected</div>
                            <div className="bg-rose-50 px-2 py-1 text-rose-700 font-semibold text-[10px]">Actual</div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {diffLines.map((d, li) => (
                              <div key={li} className="grid grid-cols-2 divide-x divide-slate-200">
                                <div className={`px-2 py-0.5 whitespace-pre-wrap break-words ${d.match ? 'text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>
                                  {d.exp ?? ''}
                                </div>
                                <div className={`px-2 py-0.5 whitespace-pre-wrap break-words ${d.match ? 'text-slate-600' : 'bg-rose-50 text-rose-800'}`}>
                                  {d.act ?? ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        // Side-by-side plain view
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-[10px] font-semibold text-emerald-600 block mb-1">Expected Output</span>
                            <pre className="bg-white border border-emerald-200 rounded-xl p-3 text-[11px] text-slate-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                              {result.expectedOutput || '(empty)'}
                            </pre>
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-rose-600 block mb-1">Actual Output</span>
                            <pre className="bg-white border border-rose-200 rounded-xl p-3 text-[11px] text-slate-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                              {result.actualOutput || '(empty)'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : result.passed ? (
                    <div>
                      <span className="text-slate-400 block mb-1">Actual Output</span>
                      <pre className="bg-white border border-emerald-200 rounded-xl p-3 font-mono text-[11px] text-emerald-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                        {result.actualOutput || '(empty)'}
                      </pre>
                    </div>
                  ) : null}

                  {/* Error Message + Error Analysis */}
                  {result.error && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle size={12} className="text-rose-500 shrink-0" />
                        <span className="text-rose-600 font-semibold">Error Analysis</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </div>
                      {/* User-friendly error explanation */}
                      <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px]">
                        {result.errorType === 'COMPILE_ERROR' && '⚠️ Compilation failed — the code could not be compiled. Check syntax errors and missing imports.'}
                        {result.errorType === 'RUNTIME_ERROR' && '💥 Runtime exception — the program crashed during execution. Check for null references, array bounds, or divide-by-zero.'}
                        {result.errorType === 'TIMEOUT' && '⏱️ Time Limit Exceeded — the program ran longer than the allowed time limit. Check for infinite loops or slow algorithms.'}
                        {(result.errorType === 'MLE' || result.errorType === 'MEMORY_LIMIT_EXCEEDED') && '💾 Memory Limit Exceeded — the program consumed more memory than allowed. Check for memory leaks or oversized data structures.'}
                        {result.errorType === 'WRONG_ANSWER' && '❌ Wrong Answer — output does not match expected. Check your logic and edge cases.'}
                      </div>
                      <pre className="bg-white border border-rose-200 rounded-xl p-3 font-mono text-[10px] text-rose-800 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                        {result.error}
                      </pre>
                    </div>
                  )}

                    </>
                  )}

                    </>
                  )}

                  {/* Execution Time + Score Weight summary */}
                  <div className="flex items-center gap-6 text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    {result.durationMs !== undefined && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> Execution time: <span className="font-mono font-semibold text-slate-700">{result.durationMs} ms</span>
                      </span>
                    )}
                    <span>Score weight: <span className="font-semibold text-slate-700">{result.scoreWeight ?? 1} pt</span></span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Score Breakdown Footer */}
      <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Score Breakdown</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Automatic Score */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 mb-1">Automatic Score</p>
            <p className={`text-xl font-extrabold ${automaticScore !== null && automaticScore !== undefined ? 'text-indigo-600' : 'text-slate-300'}`}>
              {normalizeScore(automaticScore)}
            </p>
            <p className="text-[10px] text-slate-400">/ 10</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {passedWeight}/{totalWeight} pts · Sandbox grading
            </p>
          </div>

          {/* Lecturer Score */}
          <div className={`border rounded-xl p-3 text-center ${lecturerScore !== null && lecturerScore !== undefined ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className="text-[10px] text-slate-400 mb-1">Lecturer Score</p>
            <p className={`text-xl font-extrabold ${lecturerScore !== null && lecturerScore !== undefined ? 'text-amber-600' : 'text-slate-300'}`}>
              {normalizeScore(lecturerScore)}
            </p>
            <p className="text-[10px] text-slate-400">/ 10</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {lecturerScore !== null && lecturerScore !== undefined ? 'Manual override by lecturer' : 'No manual override'}
            </p>
          </div>

          {/* Official Score */}
          <div className={`border rounded-xl p-3 text-center ${isScoreWithheld ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <p className="text-[10px] text-slate-400 mb-1">Official Score</p>
            {isScoreWithheld ? (
              <>
                <p className="text-lg font-extrabold text-rose-600">Withheld</p>
                <p className="text-[10px] text-rose-500 mt-1">Under plagiarism review</p>
              </>
            ) : (
              <>
                <p className={`text-xl font-extrabold ${totalScore !== null && totalScore !== undefined ? 'text-emerald-700' : 'text-slate-300'}`}>
                  {normalizeScore(totalScore)}
                </p>
                <p className="text-[10px] text-slate-400">/ 10</p>
                <p className="text-[10px] text-emerald-600 mt-1 font-medium">Latest official score</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default function GradingResultsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Modal khiếu nại (Appeal)
  const [showAppealModal, setShowAppealModal] = useState<boolean>(false);
  const [appealReason, setAppealReason] = useState<string>('');
  const [appealSending, setAppealSending] = useState<boolean>(false);
  const [appealError, setAppealError] = useState<string>('');
  const [appealSuccess, setAppealSuccess] = useState<string>('');
  const [expandedTestCase, setExpandedTestCase] = useState<number | null>(null);

  // 1. Tải kết quả submission từ Backend API thật
  const loadSubmission = useCallback(async (initial = false) => {
    if (!id) return;
    if (initial) setLoading(true);
    setErrorMessage('');

    const res = await apiRequest<SubmissionData>(`/submissions/${id}`);
    if (initial) setLoading(false);

    if (res.success && res.data) {
      setSubmission(res.data);
    } else {
      setErrorMessage(res.message || 'Unable to load submission results.');
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSubmission(true);
  }, [loadSubmission]);

  useEffect(() => {
    const isProcessing =
      !submission ||
      submission?.astCheckStatus === 'PENDING' ||
      ['PENDING', 'QUEUED', 'RUNNING', 'RUNNING_TESTS'].includes(submission?.status || '');

    if (!isProcessing) return;

    const interval = setInterval(() => {
      loadSubmission(false);
    }, 2000);

    return () => clearInterval(interval);
  }, [submission, loadSubmission]);

  // WebSocket real-time progress update (SRS 6.7.3 Screen 3)
  useEffect(() => {
    if (!id) return;
    const socketUrl = import.meta.env.VITE_API_URL
      ? new URL(import.meta.env.VITE_API_URL).origin
      : 'http://localhost:5000';

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.emit('join_submission', id);

    socket.on('grading_progress', (data: any) => {
      if (data && data.submissionId === id) {
        loadSubmission(false);
      }
    });

    // Member 1 - Task 5: Tự động cập nhật điểm khi Giảng viên Manual Regrade qua WebSocket
    socket.on('score_updated', (data: any) => {
      if (data && data.submissionId === id) {
        loadSubmission(false);
      }
    });

    return () => {
      socket.emit('leave_submission', id);
      socket.disconnect();
    };
  }, [id, loadSubmission]);

  // Xử lý gửi khiếu nại (Appeal) thật qua POST /submissions/appeal
  const handleSendAppeal = async () => {
    if (!appealReason.trim()) {
      setAppealError('Please enter a reason for the appeal.');
      return;
    }
    setAppealSending(true);
    setAppealError('');
    setAppealSuccess('');

    const res = await apiRequest('/submissions/appeal', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: id,
        reason: appealReason.trim(),
      }),
    });
    setAppealSending(false);

    if (res.success) {
      setAppealSuccess('Your appeal has been sent to the lecturer successfully!');
      setTimeout(() => {
        setShowAppealModal(false);
        setAppealReason('');
        setAppealSuccess('');
        loadSubmission(false);
      }, 1200);
    } else {
      setAppealError(res.message || 'Error submitting the appeal.');
    }
  };

  // isPending = còn đang trong pipeline chấm (hiển thị spinner)
  const TERMINAL_STATUSES = ['COMPLETED', 'SCORE_WITHHELD', 'GRADED', 'AI_REVIEW_PENDING', 'COMPILATION_ERROR', 'TIMEOUT', 'SECURITY_VIOLATION', 'FAILED'];
  const isPending = !submission || (!TERMINAL_STATUSES.includes(submission.status || '') && submission.astCheckStatus === 'PENDING') || submission.status === 'PENDING' || submission.status === 'RUNNING' || submission.status === 'RUNNING_TESTS';
  const isScoreWithheld = submission?.status === 'SCORE_WITHHELD';

  // Lấy test cases thật từ assignment trong kết quả backend (hoặc từ testResults đã chấm)
  const rawTestCases: TestCaseItem[] = submission?.assignment?.testCases || [];
  const testResults: TestCaseResult[] = Array.isArray(submission?.testResults) ? submission.testResults : [];
  const testCases: TestCaseItem[] =
    rawTestCases.length > 0
      ? rawTestCases
      : testResults.map((tr, index) => ({
          id: tr.testCaseId || `tc-${index + 1}`,
          inputData: '',
          expectedOutput: tr.expectedOutput || '',
          scoreWeight: 1,
        }));
  const getTestResult = (tc: TestCaseItem, index: number) =>
    (tc.id ? testResults.find((result) => result.testCaseId === tc.id) : undefined) ?? testResults[index];

  // Tính tỷ lệ đạo văn từ kết quả Plagiarism Matches thật
  const allMatches = [
    ...(submission?.plagiarismMatches1 || []),
    ...(submission?.plagiarismMatches2 || []),
  ];
  const maxSimilarity = allMatches.reduce((max: number, m: PlagiarismMatch) => Math.max(max, m.similarityPercent || 0), 0);

  // Mức độ tương đồng AST
  const plagLevel = isScoreWithheld ? 'DANGER' : resolveLevel(maxSimilarity);

  // AI review thật (nếu có từ aiFeedback)
  const hasAiFeedback = Boolean(submission?.aiFeedback && String(submission.aiFeedback).trim().length > 0);

  // Kiểm tra từng bước tiến trình thực tế (Stepper) dựa trên dữ liệu thật của backend
  const stepStates = [
    {
      label: 'Queued',
      desc: 'Grading queue',
      status: submission ? 'DONE' : 'PENDING',
    },
    {
      label: 'Building',
      desc: 'Docker environment',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD' || (submission?.totalScore !== null && submission?.totalScore !== undefined)
          ? 'DONE'
          : submission?.status === 'RUNNING' || submission?.status === 'RUNNING_TESTS'
          ? 'ACTIVE'
          : 'NEUTRAL',
    },
    {
      label: 'Running Tests',
      desc: 'Sandbox tests',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD' || (submission?.totalScore !== null && submission?.totalScore !== undefined)
          ? 'DONE'
          : submission?.status === 'RUNNING' || submission?.status === 'RUNNING_TESTS'
          ? 'ACTIVE'
          : 'NEUTRAL',
    },
    {
      label: 'AST Analysis',
      desc: 'Winnowing AST',
      status:
        submission?.astCheckStatus === 'DONE' || submission?.astCheckStatus === 'NEEDS_REVIEW' ||
          ((submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD') && submission?.astCheckStatus !== 'FAILED')
          ? 'DONE'
          : submission?.astCheckStatus === 'PENDING'
            ? 'ACTIVE'
            : submission?.astCheckStatus === 'FAILED'
              ? 'FAILED'
              : 'NEUTRAL',
    },
    {
      label: 'AI Review',
      desc: 'AI review',
      status: hasAiFeedback || submission?.status === 'COMPLETED' ? 'DONE' : 'NEUTRAL',
    },
    {
      label: 'Complete',
      desc: isScoreWithheld ? 'Score withheld' : 'Completed',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD'
          ? 'DONE'
          : submission?.status === 'FAILED'
          ? 'FAILED'
          : 'NEUTRAL',
    },
  ];

  // Back đúng trang phân hệ người dùng
  const handleGoBack = () => {
    try {
      const rawUser = localStorage.getItem('aita_user');
      const u = rawUser ? JSON.parse(rawUser) : null;
      if (u?.role === 'LECTURER' || u?.role === 'ADMIN') {
        navigate('/lecturer/dashboard');
        return;
      }
    } catch {
      // ignore
    }
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-500 text-xs">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-indigo-600" />
          <span>Loading submission results...</span>
        </div>
      </div>
    );
  }

  if (errorMessage && !submission) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
        <div className="bg-white border border-rose-200 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-base font-bold text-slate-900">Results not found</h2>
          <p className="text-xs text-slate-500">{errorMessage}</p>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 flex flex-col items-center">
      <div className="max-w-6xl w-full space-y-6">
        {/* Header navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-2 rounded-xl transition shadow-sm"
          >
            <ArrowLeft size={14} />
            <span>Back to dashboard</span>
          </button>
          <div className="text-right">
            <span className="text-xs text-slate-500">Submission ID:</span>
            <span className="text-xs font-mono text-indigo-600 ml-1 font-semibold">{id}</span>
          </div>
        </div>

        {/* Cảnh báo nếu submission bị giữ điểm do DANGER */}
        {isScoreWithheld && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-900">High similarity detected (DANGER flag)</h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  The AST algorithm detected high similarity ({maxSimilarity.toFixed(1)}%). The score is temporarily withheld for manual lecturer review.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded-xl whitespace-nowrap">
              SCORE_WITHHELD
            </span>
          </div>
        )}

        {/* Progress Stepper (SRS 6.7.3) dựa trên trạng thái thật */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Automatic grading progress (real-time pipeline)
            </h2>
            {isPending && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-lg">
                <RotateCw size={12} className="animate-spin" />
                Processing in the background...
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {stepStates.map((step, idx) => {
              const stepNumber = idx + 1;
              const isDone = step.status === 'DONE';
              const isActive = step.status === 'ACTIVE';
              const isFailed = step.status === 'FAILED';

              return (
                <div
                  key={step.label}
                  className={`p-3 rounded-xl border flex flex-col items-center text-center transition ${isDone
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isActive
                        ? 'bg-amber-50 border-amber-300 text-amber-700 animate-pulse'
                        : isFailed
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                >
                  <div className="mb-2">
                    {isDone ? (
                      <CheckCircle2 size={18} />
                    ) : isActive ? (
                      <RotateCw size={18} className="animate-spin" />
                    ) : isFailed ? (
                      <AlertCircle size={18} />
                    ) : (
                      <span className="text-xs font-bold">{stepNumber}</span>
                    )}
                  </div>
                  <span className="text-xs font-bold block">{step.label}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{step.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3 Result Cards Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Test Cases (Docker Sandbox) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${
                    submission?.totalScore !== null && submission?.totalScore !== undefined
                      ? Number(submission.totalScore) >= 5.0
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-rose-50 text-rose-600'
                      : 'bg-blue-50 text-blue-600'
                  }`}>
                    {submission?.totalScore !== null && submission?.totalScore !== undefined && Number(submission.totalScore) < 5.0 ? (
                      <XCircle size={18} />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">Sandbox test case grading</h3>
                </div>
                <span className={`text-base font-bold ${
                  submission?.totalScore !== null && submission?.totalScore !== undefined
                    ? Number(submission.totalScore) >= 5.0
                      ? 'text-emerald-600'
                      : Number(submission.totalScore) === 0
                      ? 'text-rose-600'
                      : 'text-amber-600'
                    : 'text-emerald-600'
                }`}>
                  {isScoreWithheld ? (
                    <span className="text-xs text-rose-600 font-semibold">Score withheld</span>
                  ) : submission?.totalScore !== null && submission?.totalScore !== undefined ? (
                    `${Number(submission.totalScore > 10 ? submission.totalScore / 10 : submission.totalScore).toFixed(1)} / 10`
                  ) : (
                    'Waiting for Sandbox'
                  )}
                </span>
              </div>

              {testCases.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No test cases available
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {testCases.map((tc: TestCaseItem, index: number) => {
                    const result = getTestResult(tc, index);
                    const passed = result?.passed === true;
                    const failed = result?.passed === false;
                    return (
                      <div key={tc.id || index} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setExpandedTestCase(expandedTestCase === index ? null : index)}
                          className="w-full p-3 bg-slate-50 hover:bg-slate-100 text-left flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {passed ? (
                              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            ) : failed ? (
                              <XCircle size={14} className="text-rose-600 shrink-0" />
                            ) : (
                              <Clock size={14} className="text-slate-400 shrink-0" />
                            )}
                            <span className="text-slate-800 font-medium">Test Case #{index + 1}</span>
                            <span className={`font-semibold ${passed ? 'text-emerald-700' : failed ? 'text-rose-700' : 'text-slate-500'}`}>
                              {passed ? 'PASS' : failed ? 'FAIL' : isPending ? 'Running' : 'No data available'}
                            </span>
                          </div>
                          {expandedTestCase === index ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {expandedTestCase === index && (
                          <div className="p-3 bg-white font-mono text-[11px] space-y-2 text-slate-600 border-t border-slate-200 break-words">
                            <p className="whitespace-pre-wrap"><span className="text-slate-400">Input:</span> {tc.inputData || '(None)'}</p>
                            <p className="whitespace-pre-wrap"><span className="text-slate-400">Expected:</span> {tc.expectedOutput || '(None)'}</p>
                            {result && <p className="whitespace-pre-wrap"><span className="text-slate-400">Actual output:</span> {result.actualOutput !== undefined && result.actualOutput !== '' ? result.actualOutput : '(Empty output)'}</p>}
                            {result?.error && <p className="text-rose-700 whitespace-pre-wrap"><span className="text-rose-500">Error:</span> {result.error}</p>}
                            {result?.durationMs !== undefined && <p><span className="text-slate-400">Duration:</span> {result.durationMs} ms</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Docker Sandbox: 512 MB RAM limit, network disabled</p>
          </div>

          {/* Card 2: AI Code Quality Review (Dữ liệu thật từ aiFeedback hoặc Trạng thái No data available) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Sparkles size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">AI Code Quality Review</h3>
                </div>
                {!hasAiFeedback && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                    Coming soon
                  </span>
                )}
              </div>

              {hasAiFeedback ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl text-indigo-900 leading-relaxed whitespace-pre-wrap">
                    {submission?.aiFeedback}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                  <Clock size={24} className="mx-auto text-slate-400" />
                  <p className="text-xs font-semibold text-slate-700">No data available</p>
                  <p className="text-[11px] text-slate-400">
                    The AI semantic code review model is being developed for upcoming assignments.
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Subsystem 3: LLM Semantic Code Review</p>
          </div>

          {/* Card 3: AST Plagiarism Check (Winnowing Thật) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">AST Plagiarism Check</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${LEVEL_STYLE[plagLevel].badge}`}>
                  {LEVEL_STYLE[plagLevel].label}
                </span>
              </div>

              <div className="flex flex-col items-center justify-center my-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <div
                    className={`w-32 h-32 rounded-full border-8 border-slate-100 flex items-center justify-center ${LEVEL_STYLE[plagLevel].ring
                      }`}
                  >
                    <div className="text-center">
                      <span className="text-3xl font-extrabold text-slate-900">{maxSimilarity.toFixed(1)}%</span>
                      <span className="text-[10px] text-slate-500 block">AST similarity</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-2">
                  <span className="flex items-center gap-1 text-emerald-600">● 0-30% Safe</span>
                  <span className="flex items-center gap-1 text-amber-600">● 30-60% Warn</span>
                  <span className="flex items-center gap-1 text-rose-600">● &gt;60% Danger</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                {plagLevel === 'DANGER'
                  ? 'High structural similarity with another submission was detected.'
                  : plagLevel === 'WARNING'
                    ? 'Some code sections have similar syntax structures and may need lecturer review.'
                    : 'No significant duplication was detected against other submissions.'}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Winnowing k-gram = 15, window = 25 (Subsystem 4)</p>
          </div>
        </div>


        {/* ===================================================================== */}
        {/* US-04: Detailed Test Results - Sinh viên xem chi tiết từng test case  */}
        {/* ===================================================================== */}
        {testResults.length > 0 && (
          <DetailedTestResults
            testResults={testResults}
            isPending={isPending}
            automaticScore={submission?.automaticScore}
            lecturerScore={submission?.manualScore ?? submission?.lecturerScore}
            totalScore={submission?.totalScore}
            isScoreWithheld={isScoreWithheld}
          />
        )}
        {/* Lecturer feedback from the latest manual grading events */}
        {Array.isArray(submission?.lecturerFeedback) && submission.lecturerFeedback.length > 0 && (
          <section className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={17} className="text-amber-600" />
              <h3 className="font-semibold text-slate-900 text-sm">Lecturer Feedback</h3>
            </div>
            <div className="space-y-3">
              {submission.lecturerFeedback.map((feedback) => (
                <article key={feedback.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-700">{feedback.lecturerName}</span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(feedback.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{feedback.comment}</p>
                  <p className="text-[11px] text-amber-700 font-medium mt-2">Score at this review: {Number(feedback.score).toFixed(1)}/10</p>
                </article>
              ))}
            </div>
          </section>
        )}
        {/* Lecturer feedback from the latest manual grading events */}
        {Array.isArray(submission?.lecturerFeedback) && submission.lecturerFeedback.length > 0 && (
          <section className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={17} className="text-amber-600" />
              <h3 className="font-semibold text-slate-900 text-sm">Lecturer Feedback</h3>
            </div>
            <div className="space-y-3">
              {submission.lecturerFeedback.map((feedback) => (
                <article key={feedback.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-700">{feedback.lecturerName}</span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(feedback.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{feedback.comment}</p>
                  <p className="text-[11px] text-amber-700 font-medium mt-2">Score at this review: {Number(feedback.score).toFixed(1)}/10</p>
                </article>
              ))}
            </div>
          </section>
        )}
        {/* Final Score Bar: Không bao giờ hiển thị điểm nếu submission bị SCORE_WITHHELD */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-2xl border ${
              submission?.totalScore !== null && submission?.totalScore !== undefined
                ? Number(submission.totalScore) >= 5.0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : Number(submission.totalScore) === 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              {isScoreWithheld
                ? '---'
                : submission?.totalScore !== null && submission?.totalScore !== undefined
                  ? Number(submission.totalScore > 10 ? submission.totalScore / 10 : submission.totalScore).toFixed(1)
                  : '---'}
            </div>
            <div>
              <p className="text-xs text-slate-500">Final score (out of 10)</p>
              <h4 className="text-lg font-bold text-slate-900">
                {isScoreWithheld
                  ? 'SCORE WITHHELD FOR REVIEW'
                  : submission?.totalScore !== null && submission?.totalScore !== undefined
                    ? 'RESULTS AVAILABLE'
                    : 'AWAITING GRADING'}
              </h4>
            </div>
          </div>

          <button
            onClick={() => {
              setAppealError('');
              setAppealSuccess('');
              setShowAppealModal(true);
            }}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl text-xs font-semibold transition border border-slate-200"
          >
            <MessageSquare size={16} />
            <span>Score appeal / review</span>
          </button>
        </div>

        {/* Modal Khiếu nại Thật */}
        {showAppealModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Submit a score appeal</h3>
                <button
                  onClick={() => setShowAppealModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Your appeal will be sent directly to the lecturer responsible for your class.
              </p>
              <textarea
                rows={4}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Explain why you believe the grading result should be reviewed..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />

              {appealError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{appealError}</span>
                </div>
              )}

              {appealSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{appealSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  disabled={appealSending}
                  onClick={() => setShowAppealModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  disabled={appealSending}
                  onClick={handleSendAppeal}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  {appealSending ? <Loader2 size={14} className="animate-spin" /> : null}
                  <span>{appealSending ? 'Sending...' : 'Submit appeal'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
