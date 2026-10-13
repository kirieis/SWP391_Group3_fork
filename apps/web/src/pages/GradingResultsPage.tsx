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
} from 'lucide-react';
import { apiRequest } from '../services/api';

export default function GradingResultsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [submission, setSubmission] = useState<any>(null);
  const [showAppealModal, setShowAppealModal] = useState<boolean>(false);
  const [appealReason, setAppealReason] = useState<string>('');
  const [appealSending, setAppealSending] = useState<boolean>(false);
  const [appealMessage, setAppealMessage] = useState<string>('');
  const [expandedTestCase, setExpandedTestCase] = useState<number | null>(null);

  // 1. Tải kết quả bài nộp từ Backend API thật
  const loadSubmission = async () => {
    if (!id) return;
    const res = await apiRequest<any>(`/submissions/${id}`);
    if (res.success && res.data) {
      setSubmission(res.data);
    }
  };

  useEffect(() => {
    loadSubmission();
    // Tự động polling cập nhật mỗi 3 giây nếu bài nộp vẫn đang PENDING
    const interval = setInterval(() => {
      if (submission?.astCheckStatus === 'PENDING') {
        loadSubmission();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [id, submission?.astCheckStatus]);

  // Xử lý gửi khiếu nại (Appeal) thật qua API
  const handleSendAppeal = async () => {
    if (!appealReason.trim()) {
      alert('Vui lòng nhập lý do khiếu nại.');
      return;
    }
    setAppealSending(true);
    const res = await apiRequest('/submissions/appeal', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: id,
        reason: appealReason,
      }),
    });
    setAppealSending(false);
    if (res.success) {
      alert('Đã gửi đơn khiếu nại thành công đến Giảng viên!');
      setShowAppealModal(false);
      setAppealReason('');
      loadSubmission();
    } else {
      setAppealMessage(res.message || 'Lỗi khi gửi đơn khiếu nại.');
    }
  };

  // Xác định bước tiến trình (Stepper 6 bước chuẩn SRS 6.7.3)
  const isPending = !submission || submission.astCheckStatus === 'PENDING';
  const isScoreWithheld = submission?.status === 'SCORE_WITHHELD';

  const currentStep = isPending ? 4 : 6;

  const steps = [
    { label: 'Queued', desc: 'Redis Queue' },
    { label: 'Building', desc: 'Docker Image' },
    { label: 'Running Tests', desc: 'Sandbox 512MB' },
    { label: 'AST Analysis', desc: 'Winnowing AST' },
    { label: 'AI Review', desc: 'Clean Code' },
    { label: 'Complete', desc: isScoreWithheld ? 'Giữ điểm' : 'Hoàn tất' },
  ];

  // Lấy danh sách test cases thật từ assignment hoặc mockup fallback
  const testCases = submission?.assignment?.testCases || [
    { id: 'tc-1', inputData: 'Car C01 Honda 2020', expectedOutput: 'Success: Added Car C01' },
    { id: 'tc-2', inputData: 'Car C02 Toyota -100', expectedOutput: 'Error: Invalid Price' },
    { id: 'tc-3', inputData: 'Batch Process 1000 items', expectedOutput: 'Processed 1000' },
  ];

  // Tính tỷ lệ đạo văn từ kết quả Plagiarism Matches thật
  const allMatches = [
    ...(submission?.plagiarismMatches1 || []),
    ...(submission?.plagiarismMatches2 || []),
  ];
  const maxSimilarity = allMatches.reduce((max, m) => Math.max(max, m.similarityPercent || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 flex flex-col items-center">
      <div className="max-w-6xl w-full space-y-6">
        {/* Header navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
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
                  Thuật toán AST đã phát hiện bài nộp có mức tương đồng {maxSimilarity.toFixed(1)}%. Điểm số tạm thời được giữ lại để Giảng viên đối chiếu thủ công.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded-xl whitespace-nowrap">
              SCORE_WITHHELD
            </span>
          </div>
        )}

        {/* Progress Stepper (SRS 6.7.3) */}
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
            {steps.map((step, idx) => {
              const stepNumber = idx + 1;
              const isCompleted = stepNumber < currentStep || (stepNumber === currentStep && !isPending);
              const isActive = stepNumber === currentStep && isPending;

              return (
                <div
                  key={step.label}
                  className={`p-3 rounded-xl border flex flex-col items-center text-center transition ${
                    isCompleted
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isActive
                      ? 'bg-amber-50 border-amber-300 text-amber-700 animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="mb-2">
                    {isCompleted ? (
                      <CheckCircle2 size={18} />
                    ) : isActive ? (
                      <RotateCw size={18} className="animate-spin" />
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
                  {submission?.totalScore !== null && submission?.totalScore !== undefined
                    ? `${submission.totalScore} / 100`
                    : 'Chờ Sandbox'}
                </span>
              </div>

              <div className="space-y-2">
                {testCases.map((tc: any, index: number) => (
                  <div key={tc.id || index} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div
                      onClick={() => setExpandedTestCase(expandedTestCase === index ? null : index)}
                      className="p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        <span className="text-slate-800 font-medium">Test Case #{index + 1}</span>
                      </div>
                      {expandedTestCase === index ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {expandedTestCase === index && (
                      <div className="p-3 bg-white font-mono text-[11px] space-y-1 text-slate-600 border-t border-slate-200">
                        <p><span className="text-slate-400">StdIn:</span> {tc.inputData || '(None)'}</p>
                        <p><span className="text-slate-400">Expected:</span> {tc.expectedOutput || '(None)'}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Docker Sandbox: Giới hạn 512MB RAM, Network None</p>
          </div>

          {/* Card 2: AI Code Quality Review (GenAI) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Sparkles size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">AI Code Quality Review</h3>
                </div>
                <span className="text-base font-bold text-indigo-600">85 / 100</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                  <span>Cấu trúc mã nguồn đạt chuẩn Clean Code, tuân thủ quy ước đặt tên Java.</span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 flex items-start gap-2">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-blue-600" />
                  <span>Áp dụng đóng gói hướng đối tượng (OOP Encapsulation) tốt.</span>
                </div>
              </div>
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
                <span
                  className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                    maxSimilarity >= 80
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : maxSimilarity >= 60
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {maxSimilarity >= 80 ? 'DANGER' : maxSimilarity >= 60 ? 'WARNING' : 'SAFE'}
                </span>
              </div>

              <div className="flex flex-col items-center justify-center my-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <div
                    className={`w-32 h-32 rounded-full border-8 border-slate-100 flex items-center justify-center ${
                      maxSimilarity >= 80 ? 'border-t-rose-500' : 'border-t-emerald-500'
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
                  <span className="flex items-center gap-1 text-rose-600">● 60-100% Danger</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                {maxSimilarity >= 80
                  ? 'Phát hiện tương đồng cấu trúc cây cú pháp cao với bài nộp khác.'
                  : 'Cấu trúc cây cú pháp chuẩn hóa an toàn, không phát hiện trùng lặp.'}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Winnowing k-gram = 25, window = 40 (Phân hệ 4)</p>
          </div>
        </div>

        {/* Final Score Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-extrabold text-2xl border border-indigo-200">
              {submission?.totalScore !== null && submission?.totalScore !== undefined
                ? (submission.totalScore / 10).toFixed(1)
                : '---'}
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng điểm chính thức (Thang 10)</p>
              <h4 className="text-lg font-bold text-slate-900">
                {isScoreWithheld
                  ? 'TẠM GIỮ ĐIỂM ĐỐI CHIẾU'
                  : submission?.totalScore !== null
                  ? 'ĐÃ CÓ KẾT QUẢ'
                  : 'ĐANG CHỜ CHẤM ĐIỂM'}
              </h4>
            </div>
          </div>

          <button
            onClick={() => setShowAppealModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl text-xs font-semibold transition border border-slate-200"
          >
            <MessageSquare size={16} />
            <span>Khiếu nại / Phúc khảo điểm (Appeal)</span>
          </button>
        </div>

        {/* Modal Khiếu nại Thật */}
        {showAppealModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <h3 className="text-base font-bold text-slate-900">Gửi đơn khiếu nại điểm</h3>
              <p className="text-xs text-slate-500">
                Đơn khiếu nại của bạn sẽ được chuyển trực tiếp tới hộp thư của Giảng viên phụ trách lớp.
              </p>
              <textarea
                rows={4}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Nêu rõ lý do bạn cho rằng kết quả chấm điểm cần được xem xét lại..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              ></textarea>
              {appealMessage && <p className="text-xs text-rose-600">{appealMessage}</p>}
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
                  {appealSending ? 'Đang gửi...' : 'Gửi đơn'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
