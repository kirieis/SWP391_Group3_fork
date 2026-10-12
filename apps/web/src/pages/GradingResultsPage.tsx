import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  RotateCw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function GradingResultsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [currentStep] = useState<number>(6); // 6 = Complete
  const [showAppealModal, setShowAppealModal] = useState<boolean>(false);
  const [expandedTestCase, setExpandedTestCase] = useState<number | null>(null);

  const steps = [
    { label: 'Queued', desc: 'Redis Queue' },
    { label: 'Building', desc: 'Docker Image' },
    { label: 'Running Tests', desc: 'Sandbox 512MB' },
    { label: 'AST Analysis', desc: 'Winnowing AST' },
    { label: 'AI Review', desc: 'Clean Code' },
    { label: 'Complete', desc: 'Finished' },
  ];

  const mockTestCases = [
    { id: 1, name: 'Test Case 1: Standard Input / Output', passed: true, input: 'Car C01 Honda 2020', expected: 'Success: Added Car C01', actual: 'Success: Added Car C01' },
    { id: 2, name: 'Test Case 2: Boundary Value Check', passed: true, input: 'Car C02 Toyota -100', expected: 'Error: Invalid Price', actual: 'Error: Invalid Price' },
    { id: 3, name: 'Test Case 3: Memory Limit (Under 512MB)', passed: true, input: 'Batch Process 1000 items', expected: 'Processed 1000', actual: 'Processed 1000' },
    { id: 4, name: 'Test Case 4: Exception Handling on Null', passed: true, input: 'Car null null 0', expected: 'Exception: NullPointerHandled', actual: 'Exception: NullPointerHandled' },
    { id: 5, name: 'Test Case 5: Infinite Loop Timeout (30s max)', passed: false, input: 'Recursive Search invalid', expected: 'Output: Not Found', actual: 'Timeout: Exceeded 30s Execution Limit' },
  ];

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
            <span className="text-xs font-mono text-indigo-600 ml-1 font-semibold">{id || 'sub-98721'}</span>
          </div>
        </div>

        {/* Progress Stepper (SRS 6.7.3 - Top) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-6">
            Tiến trình chấm điểm tự động (Real-time Pipeline)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {steps.map((step, idx) => {
              const stepNumber = idx + 1;
              const isCompleted = stepNumber <= currentStep;
              const isActive = stepNumber === currentStep;

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

        {/* 3 Result Cards Row (SRS 6.7.3 - Middle) */}
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
                <span className="text-base font-bold text-emerald-600">80 / 100</span>
              </div>

              <div className="space-y-2">
                {mockTestCases.map((tc) => (
                  <div key={tc.id} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div
                      onClick={() => setExpandedTestCase(expandedTestCase === tc.id ? null : tc.id)}
                      className="p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        {tc.passed ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : (
                          <XCircle size={14} className="text-rose-500" />
                        )}
                        <span className={tc.passed ? 'text-slate-800' : 'text-rose-600 font-medium'}>
                          {tc.name}
                        </span>
                      </div>
                      {expandedTestCase === tc.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {expandedTestCase === tc.id && (
                      <div className="p-3 bg-white font-mono text-[11px] space-y-1 text-slate-600 border-t border-slate-200">
                        <p><span className="text-slate-400">StdIn:</span> {tc.input}</p>
                        <p><span className="text-slate-400">Expected:</span> {tc.expected}</p>
                        <p><span className={tc.passed ? 'text-emerald-600' : 'text-rose-600'}>
                          <span className="text-slate-400">Actual:</span> {tc.actual}
                        </span></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">4 / 5 Test cases đạt chuẩn StdIn/StdOut</p>
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
                <span className="text-base font-bold text-indigo-600">88 / 100</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                  <span>Cấu trúc mã nguồn đạt chuẩn Clean Code, đặt tên biến rõ nghĩa theo camelCase.</span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 flex items-start gap-2">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-blue-600" />
                  <span>Áp dụng đúng nguyên lý SOLID: Single Responsibility Principle (Tách biệt Model & Controller).</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>Cần tối ưu thuật toán tìm kiếm đệ quy để tránh lỗi Timeout 30 giây trong Sandbox.</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Đánh giá bởi mô hình LLM chuyên biệt</p>
          </div>

          {/* Card 3: AST Plagiarism Check (Winnowing) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">AST Plagiarism Check</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                  AN TOÀN
                </span>
              </div>

              <div className="flex flex-col items-center justify-center my-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full border-8 border-slate-100 border-t-emerald-500 -rotate-45 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-3xl font-extrabold text-slate-900">12.5%</span>
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
                Không phát hiện trùng lặp cấu trúc nhánh rẽ với bất kỳ bài nộp nào trong lớp.
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">So khớp vân tay số Winnowing k-grams</p>
          </div>
        </div>

        {/* Final Score Bar (SRS 6.7.3 - Bottom) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-extrabold text-2xl border border-emerald-200">
              8.5
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng điểm chính thức (Thang 10)</p>
              <h4 className="text-lg font-bold text-slate-900">ĐẠT KẾT QUẢ TỐT</h4>
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

        {/* Modal Khiếu nại */}
        {showAppealModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <h3 className="text-base font-bold text-slate-900">Gửi đơn khiếu nại điểm</h3>
              <p className="text-xs text-slate-500">
                Đơn khiếu nại của bạn sẽ được chuyển trực tiếp tới hộp thư của Giảng viên phụ trách lớp.
              </p>
              <textarea
                rows={4}
                placeholder="Nêu rõ lý do bạn cho rằng kết quả chấm điểm cần được xem xét lại..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              ></textarea>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAppealModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    alert('Đã gửi đơn phúc khảo thành công!');
                    setShowAppealModal(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700"
                >
                  Gửi đơn
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
