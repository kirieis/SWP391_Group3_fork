import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Search,
  LogOut,
  FileCode,
  ArrowRight,
  UploadCloud,
  FileArchive,
  AlertCircle,
  Loader2,
  X,
  RotateCw,
} from 'lucide-react';
import { apiRequest } from '../services/api';

export interface AssignmentItem {
  id: string;
  title: string;
  description?: string | null;
  classCode: string;
  language: string;
  deadline: string;
  rawDeadline: string;
  status: 'NOT_SUBMITTED' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SCORE_WITHHELD' | 'FAILED' | 'GRADED' | string;
  score?: number | null;
  latestSubmissionId?: string;
  astCheckStatus?: 'PENDING' | 'DONE' | 'FAILED' | 'NEEDS_REVIEW' | string;
}

// Hàm xác định nhãn, màu sắc và logic hiển thị trạng thái chuẩn SRS và Prisma schema
function getAssignmentStatusInfo(item: AssignmentItem): {
  badgeClass: string;
  label: string;
  showScore: boolean;
  isChecking: boolean;
} {
  if (item.status === 'NOT_SUBMITTED') {
    return {
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
      label: 'Not submitted',
      showScore: false,
      isChecking: false,
    };
  }

  // Quy tắc ADR-001 & SRS: SCORE_WITHHELD tuyệt đối không hiển thị điểm số
  if (item.status === 'SCORE_WITHHELD') {
    return {
      badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
      label: 'Awaiting lecturer review',
      showScore: false,
      isChecking: false,
    };
  }

  // Cần xem xét do lỗi cú pháp nhưng đã fallback phân tích Lexical
  if (item.astCheckStatus === 'NEEDS_REVIEW') {
    return {
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
      label: 'Review required (lexical analysis)',
      showScore: item.score !== undefined && item.score !== null,
      isChecking: false,
    };
  }

  // Thất bại trong pipeline chấm hoặc AST
  if (item.status === 'FAILED' || item.astCheckStatus === 'FAILED') {
    return {
      badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
      label: 'Syntax check failed',
      showScore: false,
      isChecking: false,
    };
  }

  // Đang trong hàng đợi hoặc đang kiểm tra AST / Sandbox
  if (item.status === 'PENDING' || item.status === 'RUNNING' || item.astCheckStatus === 'PENDING') {
    return {
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
      label: 'Checking...',
      showScore: false,
      isChecking: true,
    };
  }

  // Graded chính thức (phân loại màu sắc theo thang điểm)
  if (item.score !== undefined && item.score !== null) {
    const numScore = Number(item.score);
    const isPassing = numScore >= 5.0;
    const isZero = numScore === 0;

    return {
      badgeClass: isPassing
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : isZero
        ? 'bg-rose-50 text-rose-700 border border-rose-200'
        : 'bg-amber-50 text-amber-700 border border-amber-200',
      label: isPassing ? 'Graded' : isZero ? 'Failed (0 pts)' : 'Low score',
      showScore: true,
      isChecking: false,
    };
  }

  // Trạng thái trung tính khác (đảm bảo không làm vỡ giao diện)
  return {
    badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
    label: item.status || 'Submitted',
    showScore: false,
    isChecking: false,
  };
}

interface RawAssignment {
  id: string;
  title: string;
  description?: string | null;
  language?: string;
  deadline?: string;
  class?: { classCode?: string };
  submissions?: Array<{
    id: string;
    status: string;
    totalScore?: number | null;
    astCheckStatus?: string;
  }>;
}

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const [user] = useState<{ fullName?: string; email?: string } | null>(() => {
    try {
      const rawUser = localStorage.getItem('aita_user');
      return rawUser ? JSON.parse(rawUser) : null;
    } catch {
      return null;
    }
  });
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Polling quản lý tiến trình chấm assignments
  const [isPolling, setIsPolling] = useState(false);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);

  // Modal nộp assignments
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopPolling = () => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setIsPolling(false);
    pollingCountRef.current = 0;
  };

  // 1. Tải danh sách assignments thật từ Backend API
  const loadAssignments = async (showInitialLoader = false) => {
    if (showInitialLoader) {
      setLoading(true);
    }
    setErrorMessage('');

    const res = await apiRequest<RawAssignment[]>('/assignments');
    if (showInitialLoader) {
      setLoading(false);
    }

    if (res.success && Array.isArray(res.data)) {
      const mapped: AssignmentItem[] = res.data.map((item) => {
        const latestSub = item.submissions?.[0];
        let status: AssignmentItem['status'] = 'NOT_SUBMITTED';
        let score: number | null = null;
        let latestSubmissionId = undefined;
        let astCheckStatus = undefined;

        if (latestSub) {
          latestSubmissionId = latestSub.id;
          status = latestSub.status;
          score = latestSub.totalScore ?? null;
          astCheckStatus = latestSub.astCheckStatus;
        }

        return {
          id: item.id,
          title: item.title,
          description: item.description ?? null,
          classCode: item.class?.classCode || 'UNASSIGNED CLASS',
          language: item.language || 'Java',
          rawDeadline: item.deadline || '',
          deadline: item.deadline ? new Date(item.deadline).toLocaleString('en-US') : 'No deadline',
          status,
          score,
          latestSubmissionId,
          astCheckStatus,
        };
      });

      setAssignments(mapped);

      // Kiểm tra xem có submission nào còn PENDING không để duy trì polling
      const hasPending = mapped.some(
        (a) => a.astCheckStatus === 'PENDING' || a.status === 'PENDING' || a.status === 'RUNNING'
      );
      if (hasPending && !isPolling) {
        startPolling();
      } else if (!hasPending && isPolling) {
        stopPolling();
      }
    } else {
      // Khi API lỗi -> Chuyển sang trạng thái Error rõ ràng (KHÔNG DÙNG FAKE DATA)
      setErrorMessage(res.message || 'Unable to load assignments from the server.');
      stopPolling();
    }
  };

  // Quản lý polling với giới hạn thời gian (tối đa 20 lần = ~60 giây)
  const startPolling = () => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    setIsPolling(true);
    pollingCountRef.current = 0;

    pollingTimerRef.current = setInterval(() => {
      pollingCountRef.current += 1;
      if (pollingCountRef.current > 20) {
        stopPolling();
        return;
      }
      loadAssignments(false);
    }, 3000);
  };

  useEffect(() => {
    // Tải danh sách assignments khi component mount - đây là side-effect chuẩn của useEffect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssignments(true);

    return () => {
      // Dừng polling khi người dùng rời trang
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. Xử lý nộp assignments (.zip) thật
  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !fileToUpload) {
      setUploadError('Please select your submission ZIP file.');
      return;
    }

    if (!fileToUpload.name.toLowerCase().endsWith('.zip')) {
      setUploadError('Only .zip files are accepted.');
      return;
    }

    if (fileToUpload.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds the 10 MB limit.');
      return;
    }

    setSubmitting(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('assignmentId', selectedAssignment.id);
    formData.append('file', fileToUpload);

    const res = await apiRequest<{ submissionId: string; attemptsLeft: number }>('/submissions', {
      method: 'POST',
      body: formData,
    });

    setSubmitting(false);

    if (res.success && res.data?.submissionId) {
      setUploadSuccessMessage(res.message || 'Submission uploaded successfully! Automatic grading has started.');
      setTimeout(() => {
        setSelectedAssignment(null);
        setFileToUpload(null);
        setUploadSuccessMessage('');
        loadAssignments(false);
        startPolling();
      }, 1000);
    } else {
      // Hiển thị chính xác thông báo lỗi từ backend (ví dụ: đã quá hạn nộp, quá số lần nộp cho phép Risk R01)
      setUploadError(res.message || 'Submission failed. Please try again.');
    }
  };

  // Lọc và tìm kiếm assignments trên dữ liệu thật
  const filteredAssignments = assignments.filter((item) => {
    const statusInfo = getAssignmentStatusInfo(item);
    const matchStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'NOT_SUBMITTED' && item.status === 'NOT_SUBMITTED') ||
      (filterStatus === 'PENDING' && statusInfo.isChecking) ||
      (filterStatus === 'GRADED' && statusInfo.showScore) ||
      (filterStatus === 'SCORE_WITHHELD' && item.status === 'SCORE_WITHHELD');

    const matchSearch =
      item.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      item.classCode.toLowerCase().includes(searchKeyword.toLowerCase());

    return matchStatus && matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center font-bold text-white shadow-md shadow-orange-500/20">
            A
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">AITA-Intelligent</h1>
            <p className="text-[11px] text-slate-500">Student Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-800">{user?.fullName || 'Student'}</p>
            <p className="text-[11px] text-slate-500">{user?.email || '@fpt.edu.vn'}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shadow-sm">
            {user?.fullName?.charAt(0) || 'SV'}
          </div>
          {/* Nút Sign out chuẩn */}
          <button
            onClick={() => {
              localStorage.removeItem('aita_token');
              localStorage.removeItem('aita_user');
              navigate('/login', { replace: true });
            }}
            className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Quick Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total assignments</p>
              <p className="text-2xl font-bold text-slate-900">{assignments.length} assignments</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Submitted</p>
              <p className="text-2xl font-bold text-emerald-600">
                {assignments.filter((a) => a.status !== 'NOT_SUBMITTED').length} / {assignments.length}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Grading status</p>
              <div className="flex items-center gap-1.5 mt-1">
                {isPolling && <RotateCw size={12} className="animate-spin text-amber-600" />}
                <p className="text-sm font-bold text-amber-600">
                  {isPolling ? 'Updating progress...' : 'Ready for automatic grading'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search assignments or class codes..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'NOT_SUBMITTED', label: 'Not submitted' },
              { id: 'PENDING', label: 'Checking' },
              { id: 'GRADED', label: 'Graded' },
              { id: 'SCORE_WITHHELD', label: 'Awaiting review' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStatus(st.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                  filterStatus === st.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* TRẠNG THÁI 1: Đang tải dữ liệu (Loading state) */}
        {loading && (
          <div className="p-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Loader2 size={24} className="animate-spin text-indigo-600" />
            <span>Loading assignments from the server...</span>
          </div>
        )}

        {/* TRẠNG THÁI 2: Lỗi kết nối / Máy chủ (Error state với nút Try again) */}
        {!loading && errorMessage && (
          <div className="p-12 text-center bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
              <AlertCircle size={28} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Unable to load assignments</h3>
            <p className="text-xs text-slate-500 max-w-md">{errorMessage}</p>
            <button
              onClick={() => loadAssignments(true)}
              className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl transition shadow-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* TRẠNG THÁI 3: Danh sách rỗng thật (Empty state) */}
        {!loading && !errorMessage && assignments.length === 0 && (
          <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <BookOpen size={28} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No assignments yet</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              You are not enrolled in any assignments yet, or your lecturer has not published an assignment for your class.
            </p>
          </div>
        )}

        {/* TRẠNG THÁI 4: Hiển thị danh sách assignments thật */}
        {!loading && !errorMessage && assignments.length > 0 && (
          <div className="space-y-4">
            {filteredAssignments.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-400">
                No assignments match the current filters.
              </div>
            ) : (
              filteredAssignments.map((assignment) => {
                const statusInfo = getAssignmentStatusInfo(assignment);

                return (
                  <div
                    key={assignment.id}
                    className="bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group shadow-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold">
                          {assignment.classCode}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          <FileCode size={12} />
                          {assignment.language}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 text-base group-hover:text-indigo-600 transition">
                        {assignment.title}
                      </h3>
                      {assignment.description?.trim() && (
                        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Assignment description</p>
                          <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{assignment.description}</p>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Clock size={14} className="text-slate-400" />
                        Deadline: <span className="text-slate-700 font-medium">{assignment.deadline}</span>
                      </p>
                    </div>

                    {/* Trạng thái & Thao tác */}
                    <div className="flex items-center gap-4 self-end md:self-center">
                      {/* Hiển thị điểm số thật (nếu có và không bị SCORE_WITHHELD) */}
                      {statusInfo.showScore && (
                        <div className="text-right">
                          <span className="text-xs text-slate-500 block">Result</span>
                          <span className={`text-xl font-bold ${
                            Number(assignment.score) >= 5.0
                              ? 'text-emerald-600'
                              : Number(assignment.score) === 0
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}>
                            {assignment.score}
                            <span className="text-xs text-slate-400 font-normal"> / 10</span>
                          </span>
                        </div>
                      )}

                      {/* Badge trạng thái */}
                      <span className={`px-3 py-1 text-xs rounded-full font-medium ${statusInfo.badgeClass}`}>
                        {statusInfo.label}
                      </span>

                      {/* Các nút hành động */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedAssignment(assignment);
                            setFileToUpload(null);
                            setUploadError('');
                            setUploadSuccessMessage('');
                          }}
                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                        >
                          <UploadCloud size={14} />
                          <span>{assignment.latestSubmissionId ? 'Resubmit' : 'Submit (.zip)'}</span>
                        </button>

                        {/* Xem kết quả submission chi tiết */}
                        {assignment.latestSubmissionId && (
                          <button
                            onClick={() => navigate(`/submissions/${assignment.latestSubmissionId}/results`)}
                            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs px-3 py-2.5 rounded-xl transition"
                            title="View detailed results"
                          >
                            <span>Details</span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* Modal Nộp assignments Upload (.zip) Thật */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Submit assignment online</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedAssignment.title}</p>
              </div>
              <button
                onClick={() => setSelectedAssignment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Khu vực chọn file */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                fileToUpload
                  ? 'border-indigo-500 bg-indigo-50/50'
                  : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setFileToUpload(e.target.files[0]);
                    setUploadError('');
                  }
                }}
              />
              <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                  {fileToUpload ? <FileArchive size={32} /> : <UploadCloud size={32} />}
                </div>
                {fileToUpload ? (
                  <div>
                    <p className="text-xs font-bold text-indigo-900">{fileToUpload.name}</p>
                    <p className="text-[11px] text-indigo-600 mt-0.5">
                      {(fileToUpload.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Click here to select your submission file <span className="text-indigo-600">.zip</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      ZIP files only • 10 MB max • Up to 5 submissions (Risk R01)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Thông báo lỗi nếu có */}
            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Thông báo nộp thành công */}
            {uploadSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700 text-xs">
                <CheckCircle size={15} className="shrink-0" />
                <span>{uploadSuccessMessage}</span>
              </div>
            )}

            {/* Footer Modal */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                disabled={submitting}
                onClick={() => setSelectedAssignment(null)}
                className="px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={submitting || !fileToUpload}
                onClick={handleSubmitAssignment}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>{submitting ? 'Uploading...' : 'Confirm submission'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
