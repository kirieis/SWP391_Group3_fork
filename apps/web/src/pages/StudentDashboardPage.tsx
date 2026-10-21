import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Search,
  FileCode,
  ArrowRight,
  UploadCloud,
  FileArchive,
  AlertCircle,
  Loader2,
  X,
  RotateCw,
  ChevronDown,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { StudentHeader } from '../components/StudentHeader';
import { StatCard } from '../components/ui/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';

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
  isExpired: boolean;
}

// Hàm xác định nhãn, màu sắc và logic hiển thị trạng thái chuẩn SRS và Prisma schema
function getAssignmentStatusInfo(item: AssignmentItem): {
  badgeClass: string;
  label: string;
  showScore: boolean;
  isChecking: boolean;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
} {
  if (item.status === 'NOT_SUBMITTED' && item.isExpired) {
    return { badgeClass: '', label: 'N/A', showScore: false, isChecking: false, tone: 'neutral' };
  }

  if (item.status === 'NOT_SUBMITTED') {
    return { badgeClass: '', label: 'Not submitted', showScore: false, isChecking: false, tone: 'neutral' };
  }

  // Quy tắc ADR-001 & SRS: SCORE_WITHHELD tuyệt đối không hiển thị điểm số
  if (item.status === 'SCORE_WITHHELD') {
    return { badgeClass: '', label: 'Awaiting lecturer review', showScore: false, isChecking: false, tone: 'warning' };
  }

  // Cần xem xét do lỗi cú pháp nhưng đã fallback phân tích Lexical
  if (item.astCheckStatus === 'NEEDS_REVIEW') {
    return {
      badgeClass: '',
      label: 'Review required (lexical analysis)',
      showScore: item.score !== undefined && item.score !== null,
      isChecking: false,
      tone: 'warning',
    };
  }

  // Thất bại trong pipeline chấm hoặc AST
  if (item.status === 'FAILED' || item.astCheckStatus === 'FAILED') {
    return { badgeClass: '', label: 'Syntax check failed', showScore: false, isChecking: false, tone: 'danger' };
  }

  // Đang trong hàng đợi hoặc đang kiểm tra AST / Sandbox
  if (item.status === 'PENDING' || item.status === 'RUNNING' || item.astCheckStatus === 'PENDING') {
    return { badgeClass: '', label: 'Checking...', showScore: false, isChecking: true, tone: 'warning' };
  }

  // Graded chính thức (phân loại màu sắc theo thang điểm)
  if (item.score !== undefined && item.score !== null) {
    const numScore = Number(item.score);
    const isPassing = numScore >= 5.0;
    const isZero = numScore === 0;
    return {
      badgeClass: '',
      label: isPassing ? 'Graded' : isZero ? 'Failed (0 pts)' : 'Low score',
      showScore: true,
      isChecking: false,
      tone: isPassing ? 'success' : isZero ? 'danger' : 'warning',
    };
  }

  // Trạng thái trung tính khác (đảm bảo không làm vỡ giao diện)
  return { badgeClass: '', label: item.status || 'Submitted', showScore: false, isChecking: false, tone: 'neutral' };
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

// Thẻ mô tả assignment có thể thu gọn (clamp 2 dòng, Show more/less)
function DescriptionBox({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-xl bg-neutral-bg border border-line p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-3 mb-1">
        Description
      </p>
      <p className={`text-xs text-ink-2 whitespace-pre-wrap leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
        {text}
      </p>
      {text.length > 120 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
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
          isExpired: Boolean(item.deadline && Date.now() > new Date(item.deadline).getTime()),
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

  // Re-evaluate deadlines while the page stays open, so N/A and submit controls
  // update shortly after the deadline without requiring a manual reload.
  useEffect(() => {
    const deadlineTimer = setInterval(() => {
      const now = Date.now();
      setAssignments((current) => current.map((item) => ({
        ...item,
        isExpired: Boolean(item.rawDeadline && now > new Date(item.rawDeadline).getTime()),
      })));
      setSelectedAssignment((current) => current ? {
        ...current,
        isExpired: Boolean(current.rawDeadline && now > new Date(current.rawDeadline).getTime()),
      } : current);
    }, 5000);
    return () => clearInterval(deadlineTimer);
  }, []);

  // 3. Xử lý nộp assignments (.zip) thật
  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !fileToUpload) {
      setUploadError('Please select your submission ZIP file.');
      return;
    }

    if (selectedAssignment.isExpired || (selectedAssignment.rawDeadline && Date.now() > new Date(selectedAssignment.rawDeadline).getTime())) {
      setUploadError('The submission deadline has passed. Submissions and resubmissions are no longer accepted.');
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

  // Các tab lọc trạng thái
  const filterTabs = [
    { id: 'ALL', label: 'All', count: assignments.length },
    { id: 'NOT_SUBMITTED', label: 'Not submitted', count: assignments.filter(a => a.status === 'NOT_SUBMITTED').length },
    { id: 'PENDING', label: 'Checking', count: assignments.filter(a => getAssignmentStatusInfo(a).isChecking).length },
    { id: 'GRADED', label: 'Graded', count: assignments.filter(a => getAssignmentStatusInfo(a).showScore).length },
    { id: 'SCORE_WITHHELD', label: 'Awaiting review', count: assignments.filter(a => a.status === 'SCORE_WITHHELD').length },
  ];

  return (
    <div className="min-h-dvh bg-bg text-ink flex flex-col">
      {/* Header chung chuẩn cho phân hệ sinh viên */}
      <StudentHeader user={user} />

      {/* Nội dung chính */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ===== 3 StatCard thống kê ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total assignments"
            value={assignments.length}
            icon={BookOpen}
            tone="brand"
          />
          <StatCard
            label="Submitted"
            value={`${assignments.filter((a) => a.status !== 'NOT_SUBMITTED').length} / ${assignments.length}`}
            icon={CheckCircle}
            tone="success"
            caption="out of all assignments"
          />
          <StatCard
            label="Grading status"
            value={
              isPolling ? (
                <span className="flex items-center gap-2 text-2xl font-semibold">
                  <RotateCw size={20} className="animate-spin text-warning-text" aria-hidden="true" />
                  Updating...
                </span>
              ) : (
                'Ready'
              )
            }
            icon={Clock}
            tone={isPolling ? 'warning' : 'neutral'}
            caption={isPolling ? 'Checking for grading updates every 3s' : 'Ready for automatic grading'}
          />
        </div>

        {/* ===== Thanh tìm kiếm + Filter chips ===== */}
        <div className="bg-surface border border-line rounded-2xl shadow-sm p-3 sm:p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Ô tìm kiếm */}
          <div className="relative min-w-0 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" size={15} aria-hidden="true" />
            <input
              type="search"
              id="assignment-search"
              placeholder="Search assignments or class codes..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-bg border border-line rounded-xl pl-9 pr-4 py-2 text-xs text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
            />
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 flex-wrap sm:flex-nowrap sm:overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filterStatus === tab.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-neutral-bg text-ink-2 hover:text-ink hover:bg-slate-100 border border-line'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${
                    filterStatus === tab.id ? 'bg-white/25 text-white' : 'bg-slate-200 text-ink-2'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ===== TRẠNG THÁI 1: Đang tải dữ liệu ===== */}
        {loading && (
          <div className="p-16 text-center text-ink-3 text-xs flex flex-col items-center justify-center gap-3 bg-surface rounded-2xl border border-line shadow-sm">
            <Loader2 size={24} className="animate-spin text-brand-600" />
            <span>Loading assignments from the server...</span>
          </div>
        )}

        {/* ===== TRẠNG THÁI 2: Lỗi kết nối / Máy chủ ===== */}
        {!loading && errorMessage && (
          <div className="p-12 text-center bg-surface rounded-2xl border border-danger-border shadow-sm flex flex-col items-center justify-center gap-4">
            <div className="p-3 bg-danger-bg text-danger-text rounded-2xl">
              <AlertCircle size={28} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Unable to load assignments</h3>
              <p className="text-xs text-ink-3 max-w-md mt-1">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => loadAssignments(true)}
              className="mt-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-xl transition shadow-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* ===== TRẠNG THÁI 3: Danh sách rỗng thật ===== */}
        {!loading && !errorMessage && assignments.length === 0 && (
          <div className="p-16 text-center bg-surface rounded-2xl border border-line shadow-sm flex flex-col items-center justify-center gap-4">
            <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl">
              <BookOpen size={28} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">No assignments yet</h3>
              <p className="text-xs text-ink-3 max-w-sm mt-1">
                You are not enrolled in any assignments yet, or your lecturer has not published an assignment for your class.
              </p>
            </div>
          </div>
        )}

        {/* ===== TRẠNG THÁI 4: Danh sách assignments thật ===== */}
        {!loading && !errorMessage && assignments.length > 0 && (
          <div className="space-y-3">
            {filteredAssignments.length === 0 ? (
              <div className="p-10 text-center bg-surface rounded-2xl border border-line text-xs text-ink-3">
                No assignments match the current filters.
              </div>
            ) : (
              filteredAssignments.map((assignment) => {
                const statusInfo = getAssignmentStatusInfo(assignment);
                const displayScore =
                  statusInfo.showScore && typeof assignment.score === 'number'
                    ? assignment.score > 10
                      ? (assignment.score / 10).toFixed(1)
                      : assignment.score
                    : null;

                return (
                  <article
                    key={assignment.id}
                    className="bg-surface border border-line hover:border-brand-300 hover:shadow-md transition-all duration-150 rounded-2xl p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 group shadow-sm"
                  >
                    {/* Thông tin assignment */}
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Chip class + ngôn ngữ */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 font-mono text-[11px] font-semibold border border-brand-100">
                          {assignment.classCode}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-ink-2 bg-neutral-bg px-2 py-0.5 rounded-md border border-line">
                          <FileCode size={12} aria-hidden="true" />
                          {assignment.language}
                        </span>
                      </div>

                      <h3 className="font-semibold text-ink text-base leading-snug group-hover:text-brand-600 transition-colors">
                        {assignment.title}
                      </h3>

                      {/* Mô tả có thể thu gọn */}
                      {assignment.description?.trim() && (
                        <DescriptionBox text={assignment.description} />
                      )}

                      <p className="text-xs text-ink-3 flex items-center gap-1.5">
                        <Clock size={13} className="text-ink-3 shrink-0" aria-hidden="true" />
                        Deadline: <span className="text-ink-2 font-medium">{assignment.deadline}</span>
                      </p>
                    </div>

                    {/* Trạng thái & Thao tác */}
                    <div className="flex items-center gap-4 self-end md:self-start mt-2 md:mt-0 shrink-0 flex-wrap md:flex-nowrap">
                      {/* Điểm số (hiển thị to và nổi bật) */}
                      {displayScore !== null ? (
                        <div className="text-right min-w-[48px]">
                          <span className="text-[10px] text-ink-3 block">Result</span>
                          <span className={`text-2xl font-bold tabular-nums ${
                            statusInfo.tone === 'success' ? 'text-success-text' :
                            statusInfo.tone === 'danger' ? 'text-danger-text' : 'text-warning-text'
                          }`}>
                            {displayScore}
                          </span>
                        </div>
                      ) : assignment.isExpired && assignment.status === 'NOT_SUBMITTED' ? (
                        // Quiet N/A placeholder khi hết deadline và chưa nộp
                        <div className="text-right min-w-[48px]">
                          <span className="text-[10px] text-ink-3 block">Result</span>
                          <span className="text-2xl font-bold text-ink-3 tabular-nums">N/A</span>
                        </div>
                      ) : null}

                      {/* StatusBadge */}
                      <StatusBadge tone={statusInfo.tone} label={statusInfo.label} />

                      {/* Các nút hành động */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={assignment.isExpired}
                          title={assignment.isExpired ? 'The submission deadline has passed.' : undefined}
                          onClick={() => {
                            if (assignment.isExpired) return;
                            setSelectedAssignment(assignment);
                            setFileToUpload(null);
                            setUploadError('');
                            setUploadSuccessMessage('');
                          }}
                          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none whitespace-nowrap"
                        >
                          <UploadCloud size={14} aria-hidden="true" />
                          <span>
                            {assignment.isExpired
                              ? 'Deadline passed'
                              : assignment.latestSubmissionId
                                ? 'Resubmit'
                                : 'Submit (.zip)'}
                          </span>
                        </button>

                        {/* Xem kết quả submission chi tiết */}
                        {assignment.latestSubmissionId && (
                          <button
                            type="button"
                            onClick={() => navigate(`/submissions/${assignment.latestSubmissionId}/results`)}
                            className="flex items-center gap-1 bg-neutral-bg hover:bg-slate-100 text-ink-2 hover:text-ink font-medium text-xs px-3 py-2.5 rounded-xl transition-colors border border-line whitespace-nowrap"
                            title="View detailed results"
                          >
                            <span>Details</span>
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* ===== Modal Nộp bài (.zip) ===== */}
      {selectedAssignment && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedAssignment(null); }}
        >
          <div className="bg-surface border border-line rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="text-base font-bold text-ink">Submit assignment</h3>
                <p className="text-xs text-ink-3 mt-0.5 truncate">{selectedAssignment.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssignment(null)}
                className="p-1.5 text-ink-3 hover:text-ink rounded-xl hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cảnh báo hết deadline */}
            {selectedAssignment.isExpired && (
              <div className="rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-warning-text">
                The submission deadline has passed. Submissions and resubmissions are no longer accepted.
              </div>
            )}

            {/* Vùng kéo thả / chọn file */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                fileToUpload
                  ? 'border-brand-400 bg-brand-50/50'
                  : 'border-line hover:border-brand-400 hover:bg-neutral-bg'
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
              <div className="flex flex-col items-center gap-3">
                <div className={`p-3 rounded-2xl ${fileToUpload ? 'bg-brand-100 text-brand-700' : 'bg-neutral-bg text-ink-3'}`}>
                  {fileToUpload ? <FileArchive size={32} /> : <UploadCloud size={32} />}
                </div>
                {fileToUpload ? (
                  <div>
                    <p className="text-xs font-bold text-ink">{fileToUpload.name}</p>
                    <p className="text-[11px] text-brand-600 mt-0.5">
                      {(fileToUpload.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-ink">
                      Click to select your <span className="text-brand-600">.zip</span> file
                    </p>
                    <p className="text-[11px] text-ink-3 mt-1">
                      ZIP files only • 10 MB max • Up to 5 submissions (Risk R01)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Thông báo lỗi nếu có */}
            {uploadError && (
              <div className="p-3 bg-danger-bg border border-danger-border rounded-xl flex items-center gap-2 text-danger-text text-xs">
                <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Thông báo nộp thành công */}
            {uploadSuccessMessage && (
              <div className="p-3 bg-success-bg border border-success-border rounded-xl flex items-center gap-2 text-success-text text-xs">
                <CheckCircle size={15} className="shrink-0" aria-hidden="true" />
                <span>{uploadSuccessMessage}</span>
              </div>
            )}

            {/* Footer Modal */}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSelectedAssignment(null)}
                className="px-4 py-2.5 text-xs text-ink-2 hover:bg-neutral-bg rounded-xl transition-colors border border-line"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !fileToUpload || selectedAssignment.isExpired}
                onClick={handleSubmitAssignment}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={14} aria-hidden="true" />}
                <span>{submitting ? 'Uploading...' : 'Confirm submission'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
