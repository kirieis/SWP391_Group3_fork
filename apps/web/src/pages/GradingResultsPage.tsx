import { useState, useEffect } from 'react';
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

// Kiểu dữ liệu test case từ backend
interface TestCaseItem {
  id?: string;
  inputData?: string;
  expectedOutput?: string;
  scoreWeight?: number;
  [key: string]: unknown;
}

// Kiểu cặp nghi vấn đạo văn
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

// Kiểu bài nộp từ backend
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

  // 1. Tải kết quả bài nộp từ Backend API thật
  const loadSubmission = async (initial = false) => {
    if (!id) return;
    if (initial) setLoading(true);
    setErrorMessage('');

    const res = await apiRequest<SubmissionData>(`/submissions/${id}`);
    if (initial) setLoading(false);

    if (res.success && res.data) {
      setSubmission(res.data);
    } else {
      setErrorMessage(res.message || 'Không thể tải kết quả bài nộp.');
    }
  };

  useEffect(() => {
    // Tải kết quả bài nộp từ backend khi component mount hoặc id thay đổi
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSubmission(true);

    // Tự động polling cập nhật mỗi 2 giây nếu bài nộp chưa có hoặc vẫn đang trong tiến trình chấm
    const interval = setInterval(() => {
<<<<<<< HEAD
      if (
        !submission ||
        submission?.astCheckStatus === 'PENDING' ||
        submission?.status === 'PENDING' ||
        submission?.status === 'RUNNING' ||
        submission?.status === 'RUNNING_TESTS'
      ) {
=======
      if (submission?.astCheckStatus === 'PENDING' || ['PENDING', 'QUEUED', 'RUNNING', 'RUNNING_TESTS'].includes(submission?.status || '')) {
>>>>>>> 62df7651041695ebc9f399bb9713021ebc5f0a72
        loadSubmission(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [id, submission?.astCheckStatus, submission?.status]);

  // Xử lý gửi khiếu nại (Appeal) thật qua POST /submissions/appeal
  const handleSendAppeal = async () => {
    if (!appealReason.trim()) {
      setAppealError('Vui lòng nhập lý do khiếu nại.');
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
      setAppealSuccess('Đã gửi đơn khiếu nại thành công đến Giảng viên!');
      setTimeout(() => {
        setShowAppealModal(false);
        setAppealReason('');
        setAppealSuccess('');
        loadSubmission(false);
      }, 1200);
    } else {
      setAppealError(res.message || 'Lỗi khi gửi đơn khiếu nại.');
    }
  };

  // isPending = còn đang trong pipeline chấm (hiển thị spinner)
  const TERMINAL_STATUSES = ['COMPLETED', 'SCORE_WITHHELD', 'GRADED', 'AI_REVIEW_PENDING', 'COMPILATION_ERROR', 'TIMEOUT', 'SECURITY_VIOLATION', 'FAILED'];
  const isPending = !submission || (!TERMINAL_STATUSES.includes(submission.status || '') && submission.astCheckStatus === 'PENDING') || submission.status === 'PENDING' || submission.status === 'RUNNING' || submission.status === 'RUNNING_TESTS';
  const isScoreWithheld = submission?.status === 'SCORE_WITHHELD';

  // Lấy test cases thật từ assignment trong kết quả backend (KHÔNG DÙNG FAKE FALLBACK)
  const testCases: TestCaseItem[] = submission?.assignment?.testCases || [];
  const testResults: TestCaseResult[] = Array.isArray(submission?.testResults) ? submission.testResults : [];
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

  // Đánh giá AI thật (nếu có từ aiFeedback)
  const hasAiFeedback = Boolean(submission?.aiFeedback && String(submission.aiFeedback).trim().length > 0);

  // Kiểm tra từng bước tiến trình thực tế (Stepper) dựa trên dữ liệu thật của backend
  const stepStates = [
    {
      label: 'Queued',
      desc: 'Hàng đợi chấm',
      status: submission ? 'DONE' : 'PENDING',
    },
    {
      label: 'Building',
      desc: 'Môi trường Docker',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD' || (submission?.totalScore !== null && submission?.totalScore !== undefined)
          ? 'DONE'
          : submission?.status === 'RUNNING' || submission?.status === 'RUNNING_TESTS'
          ? 'ACTIVE'
          : 'NEUTRAL',
    },
    {
      label: 'Running Tests',
      desc: 'Sandbox kiểm thử',
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
      desc: 'Đánh giá AI',
      status: hasAiFeedback || submission?.status === 'COMPLETED' ? 'DONE' : 'NEUTRAL',
    },
    {
      label: 'Complete',
      desc: isScoreWithheld ? 'Giữ điểm' : 'Hoàn tất',
      status:
        submission?.status === 'COMPLETED' || submission?.status === 'SCORE_WITHHELD'
          ? 'DONE'
          : submission?.status === 'FAILED'
          ? 'FAILED'
          : 'NEUTRAL',
    },
  ];

  // Quay lại đúng trang phân hệ người dùng
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
          <span>Đang tải kết quả bài nộp từ hệ thống...</span>
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
          <h2 className="text-base font-bold text-slate-900">Không tìm thấy kết quả</h2>
          <p className="text-xs text-slate-500">{errorMessage}</p>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition"
          >
            Quay lại trang chính
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
            <span>Quay lại Dashboard</span>
          </button>
          <div className="text-right">
            <span className="text-xs text-slate-500">Mã bài nộp:</span>
            <span className="text-xs font-mono text-indigo-600 ml-1 font-semibold">{id}</span>
          </div>
        </div>

        {/* Cảnh báo nếu bài nộp bị giữ điểm do DANGER */}
        {isScoreWithheld && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-900">Phát hiện nghi vấn tương đồng cao (Cờ DANGER)</h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Thuật toán AST đã phát hiện bài nộp có mức tương đồng cao ({maxSimilarity.toFixed(1)}%). Điểm số tạm thời được giữ lại để Giảng viên đối chiếu thủ công theo quy định.
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
              Tiến trình chấm điểm tự động (Real-time Pipeline)
            </h2>
            {isPending && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-lg">
                <RotateCw size={12} className="animate-spin" />
                Đang xử lý nền...
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
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <CheckCircle2 size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">Chấm Sandbox Test Cases</h3>
                </div>
                <span className="text-base font-bold text-emerald-600">
                  {isScoreWithheld ? (
                    <span className="text-xs text-rose-600 font-semibold">Tạm giữ điểm</span>
                  ) : submission?.totalScore !== null && submission?.totalScore !== undefined ? (
<<<<<<< HEAD
                    `${(submission.totalScore > 10 ? submission.totalScore / 10 : submission.totalScore).toFixed(1)} / 10`
=======
                    `${Number(submission.totalScore).toFixed(1)} / 10`
>>>>>>> 62df7651041695ebc9f399bb9713021ebc5f0a72
                  ) : (
                    'Chờ Sandbox'
                  )}
                </span>
              </div>

              {testCases.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Chưa có test case
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
                              {passed ? 'PASS' : failed ? 'FAIL' : isPending ? 'Đang chạy' : 'Không có dữ liệu'}
                            </span>
                          </div>
                          {expandedTestCase === index ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {expandedTestCase === index && (
                          <div className="p-3 bg-white font-mono text-[11px] space-y-2 text-slate-600 border-t border-slate-200 break-words">
                            <p><span className="text-slate-400">Input:</span> {tc.inputData || '(Không có)'}</p>
                            <p><span className="text-slate-400">Expected:</span> {tc.expectedOutput || '(Không có)'}</p>
                            {result && <p><span className="text-slate-400">Actual:</span> {result.actualOutput || '(Output rỗng)'}</p>}
                            {result?.error && <p className="text-rose-700"><span className="text-rose-500">Lỗi:</span> {result.error}</p>}
                            {result?.durationMs !== undefined && <p><span className="text-slate-400">Thời gian:</span> {result.durationMs} ms</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Docker Sandbox: Giới hạn 512MB RAM, Network None</p>
          </div>

          {/* Card 2: AI Code Quality Review (Dữ liệu thật từ aiFeedback hoặc Trạng thái Chưa có dữ liệu) */}
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
                    Sắp có
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
                  <p className="text-xs font-semibold text-slate-700">Chưa có dữ liệu</p>
                  <p className="text-[11px] text-slate-400">
                    Mô hình AI Semantic Code Review đang được hoàn thiện cho các bài tập tiếp theo.
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Phân hệ 3: LLM Semantic Code Review</p>
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
                      <span className="text-[10px] text-slate-500 block">Tương đồng AST</span>
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
                  ? 'Phát hiện tương đồng cấu trúc cây cú pháp cao với bài nộp khác.'
                  : plagLevel === 'WARNING'
                    ? 'Có một số đoạn tương đồng cấu trúc cú pháp, giảng viên có thể xem lại.'
                    : 'Không phát hiện trùng lặp đáng kể với các bài nộp khác.'}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Winnowing k-gram = 15, window = 25 (Phân hệ 4)</p>
          </div>
        </div>

        {/* Final Score Bar: Không bao giờ hiển thị điểm nếu bài nộp bị SCORE_WITHHELD */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-extrabold text-2xl border border-indigo-200">
              {isScoreWithheld
                ? '---'
                : submission?.totalScore !== null && submission?.totalScore !== undefined
<<<<<<< HEAD
                  ? (submission.totalScore > 10 ? submission.totalScore / 10 : submission.totalScore).toFixed(1)
                  : '---'}
=======
                ? Number(submission.totalScore).toFixed(1)
                : '---'}
>>>>>>> 62df7651041695ebc9f399bb9713021ebc5f0a72
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng điểm chính thức (Thang 10)</p>
              <h4 className="text-lg font-bold text-slate-900">
                {isScoreWithheld
                  ? 'TẠM GIỮ ĐIỂM ĐỐI CHIẾU'
                  : submission?.totalScore !== null && submission?.totalScore !== undefined
                    ? 'ĐÃ CÓ KẾT QUẢ'
                    : 'ĐANG CHỜ CHẤM ĐIỂM'}
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
            <span>Khiếu nại / Phúc khảo điểm (Appeal)</span>
          </button>
        </div>

        {/* Modal Khiếu nại Thật */}
        {showAppealModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Gửi đơn khiếu nại điểm</h3>
                <button
                  onClick={() => setShowAppealModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Đơn khiếu nại của bạn sẽ được chuyển trực tiếp tới hộp thư của Giảng viên phụ trách lớp.
              </p>
              <textarea
                rows={4}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Nêu rõ lý do bạn cho rằng kết quả chấm điểm cần được xem xét lại..."
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
                  Hủy
                </button>
                <button
                  disabled={appealSending}
                  onClick={handleSendAppeal}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  {appealSending ? <Loader2 size={14} className="animate-spin" /> : null}
                  <span>{appealSending ? 'Đang gửi...' : 'Gửi đơn'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
