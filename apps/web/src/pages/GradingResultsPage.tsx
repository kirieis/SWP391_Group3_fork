import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { StudentHeader } from '../components/StudentHeader';

// Kiểu dữ liệu test case từ backend
interface TestCaseItem {
  id?: string;
  inputData?: string;
  expectedOutput?: string;
  scoreWeight?: number;
  [key: string]: unknown;
}

// Kiểu pairs nghi vấn đạo văn
interface PlagiarismMatch {
  similarityPercent?: number;
  [key: string]: unknown;
}

interface TestCaseResult {
  testCaseId?: string;
  passed: boolean;
  actualOutput?: string;
  expectedOutput?: string;
  durationMs?: number;
  error?: string;
}

// Kiểu submission từ backend
interface SubmissionData {
  id?: string;
  status?: string;
  astCheckStatus?: string;
  totalScore?: number | null;
  aiFeedback?: string | null;
  testResults?: TestCaseResult[];
  assignment?: {
    testCases?: TestCaseItem[];
    [key: string]: unknown;
  };
  plagiarismMatches1?: PlagiarismMatch[];
  plagiarismMatches2?: PlagiarismMatch[];
  [key: string]: unknown;
}

// Stepper ngang cho pipeline chấm bài
function PipelineStepper({ steps, isPending }: {
  steps: { label: string; desc: string; status: string }[];
  isPending: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-widest">
          Automatic grading pipeline (real-time)
        </h2>
        {isPending && (
          <span className="flex items-center gap-1.5 text-xs text-warning-text font-medium bg-warning-bg border border-warning-border px-2.5 py-1 rounded-xl">
            <RotateCw size={12} className="animate-spin" aria-hidden="true" />
            Processing...
          </span>
        )}
      </div>

      {/* Stepper ngang với đường nối */}
      <div className="flex items-start gap-0 overflow-x-auto">
        {steps.map((step, idx) => {
          const isDone = step.status === 'DONE';
          const isActive = step.status === 'ACTIVE';
          const isFailed = step.status === 'FAILED';
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.label} className="flex items-start flex-1 min-w-0">
              {/* Step + label */}
              <div className="flex flex-col items-center text-center flex-1 min-w-0 px-1">
                {/* Vòng tròn step */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all shrink-0 ${
                  isDone
                    ? 'bg-success-bg text-success-text border-success-border'
                    : isActive
                    ? 'bg-warning-bg text-warning-text border-warning-border animate-pulse'
                    : isFailed
                    ? 'bg-danger-bg text-danger-text border-danger-border'
                    : 'bg-neutral-bg text-ink-3 border-line'
                }`}>
                  {isDone ? (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  ) : isActive ? (
                    <RotateCw size={16} className="animate-spin" aria-hidden="true" />
                  ) : isFailed ? (
                    <XCircle size={16} aria-hidden="true" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
                {/* Nhãn và mô tả */}
                <div className="mt-2">
                  <p className={`text-xs font-semibold ${isDone ? 'text-success-text' : isActive ? 'text-warning-text' : isFailed ? 'text-danger-text' : 'text-ink-3'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-ink-3 mt-0.5 truncate">{step.desc}</p>
                </div>
              </div>

              {/* Đường nối giữa các bước */}
              {!isLast && (
                <div className={`h-0.5 flex-1 mt-[18px] mx-1 rounded-full transition-colors ${
                  isDone ? 'bg-success-border' : 'bg-line'
                }`} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GradingResultsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [user] = useState<{ fullName?: string; email?: string } | null>(() => {
    try {
      const rawUser = localStorage.getItem('aita_user');
      return rawUser ? JSON.parse(rawUser) : null;
    } catch {
      return null;
    }
  });

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
      desc: 'Docker env',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD' || (submission?.totalScore !== null && submission?.totalScore !== undefined)
          ? 'DONE'
          : submission?.status === 'RUNNING' || submission?.status === 'RUNNING_TESTS'
          ? 'ACTIVE'
          : 'NEUTRAL',
    },
    {
      label: 'Tests',
      desc: 'Sandbox',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD' || (submission?.totalScore !== null && submission?.totalScore !== undefined)
          ? 'DONE'
          : submission?.status === 'RUNNING' || submission?.status === 'RUNNING_TESTS'
          ? 'ACTIVE'
          : 'NEUTRAL',
    },
    {
      label: 'AST',
      desc: 'Winnowing',
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
      desc: 'LLM',
      status: hasAiFeedback || submission?.status === 'COMPLETED' ? 'DONE' : 'NEUTRAL',
    },
    {
      label: 'Done',
      desc: isScoreWithheld ? 'Withheld' : 'Completed',
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

  // Định dạng điểm số hiển thị (scale về 10 nếu cần)
  const formatScore = (raw: number | null | undefined): string => {
    if (raw === null || raw === undefined) return '---';
    const v = raw > 10 ? raw / 10 : raw;
    return v.toFixed(1);
  };

  // Màu cho điểm số
  const scoreColorClass = (raw: number | null | undefined): string => {
    if (raw === null || raw === undefined) return 'text-brand-600';
    const v = raw > 10 ? raw / 10 : raw;
    if (v >= 5.0) return 'text-success-text';
    if (v === 0) return 'text-danger-text';
    return 'text-warning-text';
  };

  const scoreBgClass = (raw: number | null | undefined): string => {
    if (raw === null || raw === undefined) return 'bg-brand-50 border-brand-100';
    const v = raw > 10 ? raw / 10 : raw;
    if (v >= 5.0) return 'bg-success-bg border-success-border';
    if (v === 0) return 'bg-danger-bg border-danger-border';
    return 'bg-warning-bg border-warning-border';
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center p-6 text-ink-3 text-xs">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-brand-600" aria-hidden="true" />
          <span>Loading submission results...</span>
        </div>
      </div>
    );
  }

  if (errorMessage && !submission) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center p-6 text-ink">
        <div className="bg-surface border border-danger-border rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="p-3 bg-danger-bg text-danger-text rounded-2xl w-fit mx-auto">
            <AlertCircle size={28} aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-ink">Results not found</h2>
          <p className="text-xs text-ink-3">{errorMessage}</p>
          <button
            type="button"
            onClick={handleGoBack}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-medium hover:bg-brand-700 transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-ink flex flex-col">
      <StudentHeader user={user} />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ===== Thanh điều hướng ===== */}
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex items-center gap-2 text-xs font-medium text-ink-2 hover:text-ink bg-surface border border-line px-3 py-2 rounded-xl transition-colors shadow-sm"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Back to dashboard</span>
          </button>
          <div className="text-right">
            <span className="text-xs text-ink-3">Submission ID:</span>
            <span className="text-xs font-mono text-brand-600 ml-1 font-semibold">{id}</span>
          </div>
        </div>

        {/* ===== Banner SCORE_WITHHELD ===== */}
        {isScoreWithheld && (
          <div className="p-4 bg-danger-bg border border-danger-border rounded-2xl flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-danger-text/10 text-danger-text rounded-xl shrink-0">
                <ShieldAlert size={22} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-danger-text">High similarity detected (DANGER flag)</h3>
                <p className="text-xs text-danger-text/80 mt-0.5">
                  The AST algorithm detected high similarity ({maxSimilarity.toFixed(1)}%). The score is temporarily withheld for manual lecturer review.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-danger-text text-white font-bold text-xs rounded-xl whitespace-nowrap shrink-0">
              SCORE WITHHELD
            </span>
          </div>
        )}

        {/* ===== Stepper pipeline ===== */}
        <PipelineStepper steps={stepStates} isPending={isPending} />

        {/* ===== 3 Result Cards ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Card 1: Test Cases (Docker Sandbox) */}
          <div className="bg-surface border border-line rounded-2xl p-5 flex flex-col shadow-sm min-h-[340px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl border ${
                    submission?.totalScore !== null && submission?.totalScore !== undefined
                      ? Number(submission.totalScore) >= 5.0
                        ? 'bg-success-bg text-success-text border-success-border'
                        : 'bg-danger-bg text-danger-text border-danger-border'
                      : 'bg-brand-50 text-brand-600 border-brand-100'
                  }`}>
                    {submission?.totalScore !== null && submission?.totalScore !== undefined && Number(submission.totalScore) < 5.0 ? (
                      <XCircle size={17} aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={17} aria-hidden="true" />
                    )}
                  </div>
                  <h3 className="font-semibold text-ink text-sm">Sandbox test cases</h3>
                </div>
                <span className={`text-base font-bold tabular-nums ${scoreColorClass(submission?.totalScore)}`}>
                  {isScoreWithheld ? (
                    <span className="text-xs text-danger-text font-semibold">Score withheld</span>
                  ) : submission?.totalScore !== null && submission?.totalScore !== undefined ? (
                    `${formatScore(submission.totalScore)} / 10`
                  ) : (
                    <span className="text-xs text-ink-3">Awaiting...</span>
                  )}
                </span>
              </div>

              {testCases.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-3 bg-neutral-bg rounded-xl border border-dashed border-line">
                  No test cases available
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {testCases.map((tc: TestCaseItem, index: number) => {
                    const result = getTestResult(tc, index);
                    const passed = result?.passed === true;
                    const failed = result?.passed === false;
                    return (
                      <div key={tc.id || index} className="border border-line rounded-xl overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setExpandedTestCase(expandedTestCase === index ? null : index)}
                          className="w-full p-3 bg-neutral-bg hover:bg-slate-100 text-left flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {passed ? (
                              <CheckCircle2 size={14} className="text-success-text shrink-0" aria-hidden="true" />
                            ) : failed ? (
                              <XCircle size={14} className="text-danger-text shrink-0" aria-hidden="true" />
                            ) : (
                              <Clock size={14} className="text-ink-3 shrink-0" aria-hidden="true" />
                            )}
                            <span className="text-ink font-medium">Test Case #{index + 1}</span>
                            <span className={`font-semibold ${passed ? 'text-success-text' : failed ? 'text-danger-text' : 'text-ink-3'}`}>
                              {passed ? 'PASS' : failed ? 'FAIL' : isPending ? 'Running' : 'No data'}
                            </span>
                          </div>
                          {expandedTestCase === index ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                        </button>

                        {expandedTestCase === index && (
                          <div className="p-3 bg-surface font-mono text-[11px] space-y-2 text-ink-2 border-t border-line break-words">
                            <p className="whitespace-pre-wrap"><span className="text-ink-3">Input:</span> {tc.inputData || '(None)'}</p>
                            <p className="whitespace-pre-wrap"><span className="text-ink-3">Expected:</span> {tc.expectedOutput || '(None)'}</p>
                            {result && <p className="whitespace-pre-wrap"><span className="text-ink-3">Actual:</span> {result.actualOutput !== undefined && result.actualOutput !== '' ? result.actualOutput : '(Empty output)'}</p>}
                            {result?.error && <p className="text-danger-text whitespace-pre-wrap"><span className="text-danger-text/60">Error:</span> {result.error}</p>}
                            {result?.durationMs !== undefined && <p><span className="text-ink-3">Duration:</span> {result.durationMs} ms</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-ink-3 mt-4 text-center">Docker Sandbox: 512 MB RAM, network disabled</p>
          </div>

          {/* Card 2: AI Code Quality Review */}
          <div className="bg-surface border border-line rounded-2xl p-5 flex flex-col shadow-sm min-h-[340px]">
            <div className="flex-1">
              <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-brand-50 text-brand-600 border border-brand-100 rounded-xl">
                    <Sparkles size={17} aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold text-ink text-sm">AI Code Quality Review</h3>
                </div>
                {!hasAiFeedback && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-bg text-ink-3 font-medium border border-line">
                    Coming soon
                  </span>
                )}
              </div>

              {hasAiFeedback ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-brand-50 border border-brand-100 rounded-xl text-ink leading-relaxed whitespace-pre-wrap">
                    {submission?.aiFeedback}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-neutral-bg rounded-xl border border-dashed border-line space-y-2">
                  <Clock size={24} className="mx-auto text-ink-3" aria-hidden="true" />
                  <p className="text-xs font-semibold text-ink">No data available</p>
                  <p className="text-[11px] text-ink-3">
                    The AI semantic code review model is being developed for upcoming assignments.
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-ink-3 mt-4 text-center">Subsystem 3: LLM Semantic Code Review</p>
          </div>

          {/* Card 3: AST Plagiarism Check (Winnowing) */}
          <div className="bg-surface border border-line rounded-2xl p-5 flex flex-col shadow-sm min-h-[340px]">
            <div className="flex-1">
              <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-success-bg text-success-text border border-success-border rounded-xl">
                    <ShieldCheck size={17} aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold text-ink text-sm">AST Plagiarism Check</h3>
                </div>
                {/* Dùng LevelBadge hiện tại từ LEVEL_STYLE */}
                <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs border ${LEVEL_STYLE[plagLevel].badge}`}>
                  {LEVEL_STYLE[plagLevel].label}
                </span>
              </div>

              {/* Ring gauge AST tương đồng */}
              <div className="flex flex-col items-center justify-center my-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <div
                    className={`w-32 h-32 rounded-full border-[10px] border-line flex items-center justify-center ${LEVEL_STYLE[plagLevel].ring}`}
                    role="img"
                    aria-label={`AST similarity: ${maxSimilarity.toFixed(1)}%`}
                  >
                    <div className="text-center">
                      <span className="text-3xl font-extrabold text-ink tabular-nums">{maxSimilarity.toFixed(1)}%</span>
                      <span className="text-[10px] text-ink-3 block mt-0.5">AST similarity</span>
                    </div>
                  </div>
                </div>
                {/* Chú thích legend */}
                <div className="flex items-center gap-4 text-[10px] text-ink-3 mt-2">
                  <span className="flex items-center gap-1 text-success-text">● 0–30% Safe</span>
                  <span className="flex items-center gap-1 text-warning-text">● 30–60% Warn</span>
                  <span className="flex items-center gap-1 text-danger-text">● &gt;60% Danger</span>
                </div>
              </div>

              <p className="text-xs text-ink-2 bg-neutral-bg p-3 rounded-xl border border-line text-center">
                {plagLevel === 'DANGER'
                  ? 'High structural similarity with another submission was detected.'
                  : plagLevel === 'WARNING'
                    ? 'Some code sections have similar syntax structures and may need lecturer review.'
                    : 'No significant duplication was detected against other submissions.'}
              </p>
            </div>
            <p className="text-[11px] text-ink-3 mt-4 text-center">Winnowing k-gram = 15, window = 25 (Subsystem 4)</p>
          </div>
        </div>

        {/* ===== Final Score Bar ===== */}
        {/* Tuyệt đối không bao giờ hiển thị điểm nếu submission bị SCORE_WITHHELD */}
        <div className="bg-surface border border-line rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-2xl border-2 tabular-nums ${scoreBgClass(isScoreWithheld ? null : submission?.totalScore)} ${scoreColorClass(isScoreWithheld ? null : submission?.totalScore)}`}>
              {isScoreWithheld
                ? '—'
                : formatScore(submission?.totalScore)}
            </div>
            <div>
              <p className="text-xs text-ink-3">Final score (out of 10)</p>
              <h4 className="text-lg font-bold text-ink">
                {isScoreWithheld
                  ? 'SCORE WITHHELD FOR REVIEW'
                  : submission?.totalScore !== null && submission?.totalScore !== undefined
                    ? 'RESULTS AVAILABLE'
                    : 'AWAITING GRADING'}
              </h4>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setAppealError('');
              setAppealSuccess('');
              setShowAppealModal(true);
            }}
            className="flex items-center gap-2 bg-neutral-bg hover:bg-slate-100 text-ink border border-line px-5 py-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <MessageSquare size={16} aria-hidden="true" />
            <span>Score appeal / review</span>
          </button>
        </div>

        {/* ===== Modal Khiếu nại ===== */}
        {showAppealModal && (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAppealModal(false); }}
          >
            <div className="bg-surface border border-line rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <h3 className="text-base font-bold text-ink">Submit a score appeal</h3>
                <button
                  type="button"
                  onClick={() => setShowAppealModal(false)}
                  className="p-1.5 text-ink-3 hover:text-ink rounded-xl hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  aria-label="Close appeal modal"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <p className="text-xs text-ink-3">
                Your appeal will be sent directly to the lecturer responsible for your class.
              </p>
              <textarea
                rows={4}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Explain why you believe the grading result should be reviewed..."
                className="w-full bg-neutral-bg border border-line rounded-xl p-3 text-xs text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition resize-none"
              />

              {appealError && (
                <div className="p-3 bg-danger-bg border border-danger-border rounded-xl text-danger-text text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                  <span>{appealError}</span>
                </div>
              )}

              {appealSuccess && (
                <div className="p-3 bg-success-bg border border-success-border rounded-xl text-success-text text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
                  <span>{appealSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={appealSending}
                  onClick={() => setShowAppealModal(false)}
                  className="px-4 py-2 text-xs text-ink-2 hover:bg-neutral-bg rounded-xl transition-colors border border-line"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={appealSending}
                  onClick={handleSendAppeal}
                  className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-medium hover:bg-brand-700 transition-colors flex items-center gap-1.5"
                >
                  {appealSending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
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
