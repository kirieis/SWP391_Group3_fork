import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  TrendingUp,
  AlertOctagon,
  PlusCircle,
  Upload,
  GitBranch,
  MessageSquare,
  LogOut,
  ChevronRight,
  ExternalLink,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Trash2,
  GraduationCap,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { LEVEL_STYLE, resolveLevel } from '../features/plagiarism/level';

// Kiểu dữ liệu lớp học từ backend
interface ClassItem {
  id: string;
  classCode: string;
  _count?: { students?: number };
  [key: string]: unknown;
}

// Kiểu dữ liệu bài tập từ backend
interface AssignmentItem {
  id: string;
  title: string;
  [key: string]: unknown;
}

// Kiểu dữ liệu cặp nghi vấn đạo văn từ analytics
interface PlagiarismMatchItem {
  id: string;
  similarityPercent: number;
  level?: string;
  student1?: { studentCode?: string; fullName?: string };
  student2?: { studentCode?: string; fullName?: string };
}

// Kiểu dữ liệu đơn khiếu nại (Appeal) từ backend
interface AppealItem {
  id: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  createdAt: string;
  submissionId: string;
  lecturerResponse?: string | null;
  submission?: {
    id: string;
    totalScore?: number | null;
    assignment?: {
      title?: string;
    };
  };
  student?: {
    studentCode?: string;
    user?: {
      fullName?: string;
      email?: string;
    };
  };
  [key: string]: unknown;
}

// Kiểu dữ liệu analytics từ backend
interface AnalyticsData {
  stats?: {
    totalActiveStudents?: number;
    submittedCount?: number;
    submissionRate?: number;
    averageScore?: number;
  };
  topPlagiarismMatches?: PlagiarismMatchItem[];
}

export default function LecturerDashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ fullName?: string; email?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('DASHBOARD');
  
  // Trạng thái Lớp học
  const [classesLoading, setClassesLoading] = useState<boolean>(true);
  const [classesError, setClassesError] = useState<string>('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Trạng thái Bài tập
  const [assignmentsLoading, setAssignmentsLoading] = useState<boolean>(false);
  const [assignmentsError, setAssignmentsError] = useState<string>('');
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');

  // Trạng thái Thống kê Analytics
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string>('');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Số lượng đơn khiếu nại chờ duyệt & danh sách khiếu nại thật
  const [pendingAppealsCount, setPendingAppealsCount] = useState<number>(0);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [appealsLoading, setAppealsLoading] = useState<boolean>(false);
  const [appealsError, setAppealsError] = useState<string>('');
  const [resolveModalAppeal, setResolveModalAppeal] = useState<AppealItem | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [resolveFeedback, setResolveFeedback] = useState<string>('');
  const [resolveNewScore, setResolveNewScore] = useState<string>('');
  const [resolving, setResolving] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string>('');

  // Modal Tạo Lớp Học Mới
  const [showCreateClassModal, setShowCreateClassModal] = useState<boolean>(false);
  const [newClassCode, setNewClassCode] = useState<string>('');
  const [creatingClass, setCreatingClass] = useState<boolean>(false);
  const [createClassError, setCreateClassError] = useState<string>('');

  // Modal Import Excel Sinh viên
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Modal Tạo Bài Tập Mới
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newLanguage, setNewLanguage] = useState<string>('Java');
  const [newDeadline, setNewDeadline] = useState<string>(
    // Lazy initializer: chạy một lần khi component mount (tránh lỗi react-hooks/purity với Date.now)
    () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [testCases, setTestCases] = useState<Array<{ inputData: string; expectedOutput: string; scoreWeight: number }>>([
    { inputData: '', expectedOutput: '', scoreWeight: 1 },
  ]);
  const [creatingAssignment, setCreatingAssignment] = useState<boolean>(false);
  const [createAssignmentError, setCreateAssignmentError] = useState<string>('');

  // loadClasses, loadPendingAppeals được khai báo bên dưới; useEffect gọi chúng sau khi JSX đã sẵn sàng

  const loadPendingAppeals = async () => {
    setAppealsLoading(true);
    setAppealsError('');
    const res = await apiRequest<AppealItem[]>('/submissions/appeals/pending');
    setAppealsLoading(false);
    if (res.success && Array.isArray(res.data)) {
      setAppeals(res.data);
      setPendingAppealsCount(res.data.length);
    } else {
      setAppealsError(res.message || 'Không thể tải danh sách khiếu nại.');
      setAppeals([]);
    }
  };

  const handleOpenResolveModal = (appeal: AppealItem, defaultStatus: 'RESOLVED' | 'REJECTED') => {
    setResolveModalAppeal(appeal);
    setResolveStatus(defaultStatus);
    setResolveFeedback('');
    const currentScore =
      appeal.submission?.totalScore != null ? (appeal.submission.totalScore / 10).toString() : '';
    setResolveNewScore(currentScore);
    setResolveError('');
  };

  const handleSubmitResolve = async () => {
    if (!resolveModalAppeal) return;
    setResolving(true);
    setResolveError('');

    let parsedScore: number | undefined = undefined;
    if (resolveNewScore.trim() !== '') {
      const num = parseFloat(resolveNewScore);
      if (!isNaN(num)) {
        parsedScore = Math.round(num * 10);
      }
    }

    const res = await apiRequest(`/submissions/appeal/${resolveModalAppeal.id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: resolveStatus,
        lecturerResponse:
          resolveFeedback.trim() ||
          (resolveStatus === 'RESOLVED' ? 'Chấp thuận khiếu nại' : 'Bác bỏ khiếu nại'),
        ...(parsedScore !== undefined && { newScore: parsedScore }),
        reasonForScoreChange: resolveFeedback.trim() || 'Điều chỉnh điểm sau phúc khảo',
      }),
    });

    setResolving(false);
    if (res.success) {
      setResolveModalAppeal(null);
      loadPendingAppeals();
    } else {
      setResolveError(res.message || 'Không thể xử lý khiếu nại. Vui lòng thử lại.');
    }
  };

  const loadAnalytics = async (assignmentId: string) => {
    if (!assignmentId) return;
    setAnalyticsLoading(true);
    setAnalyticsError('');
    const res = await apiRequest<AnalyticsData>(`/dashboard/analytics/${assignmentId}`);
    setAnalyticsLoading(false);

    if (res.success && res.data) {
      setAnalytics(res.data);
    } else {
      setAnalyticsError(res.message || 'Không thể tải số liệu thống kê bài nộp.');
      setAnalytics(null);
    }
  };

  const loadAssignmentsForClass = async (classId: string) => {
    if (!classId) return;
    setAssignmentsLoading(true);
    setAssignmentsError('');
    const res = await apiRequest<AssignmentItem[]>(`/assignments?classId=${classId}`);
    setAssignmentsLoading(false);

    if (res.success && Array.isArray(res.data)) {
      setAssignments(res.data);
      if (res.data.length > 0) {
        const firstAssignmentId = res.data[0].id;
        setSelectedAssignmentId(firstAssignmentId);
        loadAnalytics(firstAssignmentId);
      } else {
        setSelectedAssignmentId('');
        setAnalytics(null);
      }
    } else {
      setAssignmentsError(res.message || 'Không thể tải danh sách bài tập của lớp.');
      setAssignments([]);
      setSelectedAssignmentId('');
      setAnalytics(null);
    }
  };

  const loadClasses = async () => {
    setClassesLoading(true);
    setClassesError('');
    const res = await apiRequest<ClassItem[]>('/classes/my-classes');
    setClassesLoading(false);

    if (res.success && Array.isArray(res.data)) {
      setClasses(res.data);
      if (res.data.length > 0) {
        const firstClassId = res.data[0].id;
        setSelectedClassId(firstClassId);
        loadAssignmentsForClass(firstClassId);
      } else {
        setSelectedClassId('');
        setAssignments([]);
        setAnalytics(null);
      }
    } else {
      setClassesError(res.message || 'Không thể tải danh sách lớp học.');
      setClasses([]);
    }
  };

  const handleSelectAssignment = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setAnalytics(null);
    setAnalyticsError('');
    loadAnalytics(assignmentId);
  };

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    // Xóa ngay dữ liệu bài tập và số liệu thống kê của lớp cũ để tránh lưu vết sai lệch
    setAssignments([]);
    setSelectedAssignmentId('');
    setAnalytics(null);
    setAssignmentsError('');
    setAnalyticsError('');
    loadAssignmentsForClass(classId);
  };

  // 1. Khởi tạo dữ liệu người dùng & danh sách lớp (sau khi các hàm được khai báo)
  useEffect(() => {
    const rawUser = localStorage.getItem('aita_user');
    if (rawUser) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(JSON.parse(rawUser) as { fullName?: string; email?: string });
      } catch {
        setUser(null);
      }
    }
    // Tải lớp học & số đơn phúc khảo khi component khởi tạo
    loadClasses();
    loadPendingAppeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Tạo Lớp học mới qua POST /classes
  const handleCreateClass = async () => {
    if (!newClassCode.trim()) {
      setCreateClassError('Vui lòng nhập mã lớp học (ví dụ: SE1801-SWP391).');
      return;
    }
    setCreatingClass(true);
    setCreateClassError('');

    const res = await apiRequest('/classes', {
      method: 'POST',
      body: JSON.stringify({ classCode: newClassCode.trim() }),
    });

    setCreatingClass(false);
    if (res.success && res.data) {
      setShowCreateClassModal(false);
      setNewClassCode('');
      loadClasses();
    } else {
      setCreateClassError(res.message || 'Không thể tạo lớp học. Vui lòng thử lại.');
    }
  };

  // 3. Xử lý Import Excel Sinh viên Thật qua POST /classes/:classId/import-students
  const handleImportExcel = async () => {
    if (!selectedClassId || !excelFile) {
      setImportMessage({ type: 'error', text: 'Vui lòng chọn lớp học và file Excel (.xlsx).' });
      return;
    }
    setImporting(true);
    setImportMessage(null);

    const formData = new FormData();
    formData.append('file', excelFile);

    const res = await apiRequest(`/classes/${selectedClassId}/import-students`, {
      method: 'POST',
      body: formData,
    });

    setImporting(false);
    if (res.success) {
      setImportMessage({ type: 'success', text: res.message || 'Import danh sách sinh viên thành công!' });
      setExcelFile(null);
      loadClasses();
    } else {
      setImportMessage({ type: 'error', text: res.message || 'Import thất bại (Toàn bộ đã được Rollback).' });
    }
  };

  // 4. Xử lý Tạo Assignment Mới Thật qua POST /assignments
  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !selectedClassId) {
      setCreateAssignmentError('Vui lòng điền tiêu đề bài tập và chọn lớp học.');
      return;
    }
    if (!newDeadline) {
      setCreateAssignmentError('Vui lòng thiết lập hạn nộp bài.');
      return;
    }

    setCreatingAssignment(true);
    setCreateAssignmentError('');

    const validTestCases = testCases.filter((tc) => tc.inputData.trim() || tc.expectedOutput.trim());

    const res = await apiRequest('/assignments', {
      method: 'POST',
      body: JSON.stringify({
        classId: selectedClassId,
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        language: newLanguage,
        deadline: new Date(newDeadline).toISOString(),
        testCases: validTestCases,
      }),
    });

    setCreatingAssignment(false);
    if (res.success) {
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setTestCases([{ inputData: '', expectedOutput: '', scoreWeight: 1 }]);
      loadAssignmentsForClass(selectedClassId);
    } else {
      setCreateAssignmentError(res.message || 'Lỗi khi tạo đề bài tập.');
    }
  };

  const addTestCaseRow = () => {
    setTestCases([...testCases, { inputData: '', expectedOutput: '', scoreWeight: 1 }]);
  };

  const removeTestCaseRow = (idx: number) => {
    setTestCases(testCases.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between p-4 hidden md:flex shrink-0 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center font-bold text-white shadow-md shadow-orange-500/20">
              A
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">AITA-Intelligent</h1>
              <p className="text-[11px] text-slate-500">Lecturer Workspace</p>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-medium">
            {[
              { id: 'DASHBOARD', label: 'Bảng tổng quan', icon: TrendingUp, action: () => setActiveTab('DASHBOARD') },
              { id: 'CREATE_CLASS', label: 'Tạo lớp học mới', icon: GraduationCap, action: () => setShowCreateClassModal(true) },
              { id: 'CREATE_ASSIGNMENT', label: 'Tạo bài tập mới', icon: PlusCircle, action: () => setShowCreateModal(true) },
              { id: 'IMPORT_STUDENTS', label: 'Nhập sinh viên (Excel)', icon: Upload, action: () => setShowImportModal(true) },
              { id: 'GIT_ANALYTICS', label: 'Git Teamwork Analytics', icon: GitBranch, action: () => setActiveTab('GIT_ANALYTICS') },
              {
                id: 'APPEALS',
                label: 'Hộp thư phúc khảo',
                icon: MessageSquare,
                badge: pendingAppealsCount > 0 ? String(pendingAppealsCount) : undefined,
                action: () => {
                  setActiveTab('APPEALS');
                  loadPendingAppeals();
                },
              },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.action) {
                      item.action();
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Thông tin Giảng viên đăng nhập & Nút Đăng xuất */}
        <div className="border-t border-slate-200 pt-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
              {user?.fullName?.charAt(0) || 'GV'}
            </div>
            <div className="min-w-0 max-w-[130px]">
              <p className="text-xs font-semibold text-slate-800 truncate">{user?.fullName || 'Giảng viên'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email || '@fe.edu.vn'}</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('aita_token');
              localStorage.removeItem('aita_user');
              navigate('/login', { replace: true });
            }}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition"
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            {activeTab === 'DASHBOARD' ? (
              <>
                <label className="text-xs text-slate-500">Lớp học:</label>
                {classesLoading ? (
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Đang tải...
                  </span>
                ) : classes.length > 0 ? (
                  <select
                    value={selectedClassId}
                    onChange={(e) => handleSelectClass(e.target.value)}
                    className="text-xs font-mono bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl font-semibold border border-indigo-200 outline-none"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.classCode} ({c._count?.students || 0} SV)
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setShowCreateClassModal(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    <Plus size={13} /> Tạo lớp học đầu tiên
                  </button>
                )}

                {/* Dropdown chọn bài tập */}
                {assignments.length > 0 && (
                  <>
                    <label className="text-xs text-slate-500 ml-2">Bài tập:</label>
                    <select
                      value={selectedAssignmentId}
                      onChange={(e) => handleSelectAssignment(e.target.value)}
                      className="text-xs bg-slate-100 text-slate-800 px-3 py-1.5 rounded-xl font-medium border border-slate-200 outline-none"
                    >
                      {assignments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            ) : activeTab === 'APPEALS' ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('DASHBOARD')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium transition"
                >
                  Bảng tổng quan
                </button>
                <span className="text-xs text-slate-300">/</span>
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-indigo-600" />
                  <span>Hộp thư phúc khảo</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('DASHBOARD')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium transition"
                >
                  Bảng tổng quan
                </button>
                <span className="text-xs text-slate-300">/</span>
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <GitBranch size={14} className="text-indigo-600" />
                  <span>Git Teamwork Analytics</span>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition"
            >
              <span>Xem góc nhìn Sinh viên</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </header>

        <div className="p-6 space-y-6 max-w-6xl w-full mx-auto">
          {activeTab === 'DASHBOARD' && (
            <>
              {/* TRƯỜNG HỢP 1: Lỗi tải danh sách lớp */}
          {classesError && (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-2">
              <AlertCircle size={24} className="text-rose-600" />
              <p className="text-xs text-rose-700 font-medium">{classesError}</p>
              <button
                onClick={loadClasses}
                className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-700"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 1b: Lỗi tải danh sách bài tập */}
          {assignmentsError && (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-2">
              <AlertCircle size={24} className="text-rose-600" />
              <p className="text-xs text-rose-700 font-medium">{assignmentsError}</p>
              <button
                onClick={() => selectedClassId && loadAssignmentsForClass(selectedClassId)}
                className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-700"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 2: Giảng viên chưa có lớp học nào */}
          {!classesLoading && !classesError && classes.length === 0 && (
            <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Users size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Bạn chưa phụ trách lớp học nào</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Hãy tạo lớp học mới để bắt đầu giao bài tập và theo dõi phân tích đạo văn.
              </p>
              <button
                onClick={() => setShowCreateClassModal(true)}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                <span>Tạo lớp học mới</span>
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 3: Có lớp học nhưng lớp chưa có bài tập nào */}
          {!classesLoading && !classesError && classes.length > 0 && !assignmentsLoading && assignments.length === 0 && (
            <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <FileText size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Lớp học này chưa có bài tập nào</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Hãy tạo bài tập lập trình đầu tiên để sinh viên nộp bài chấm tự động qua AST Engine.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle size={14} />
                <span>Tạo bài tập cho lớp</span>
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 4: Đang tải Analytics */}
          {analyticsLoading && (
            <div className="p-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              <span>Đang tính toán số liệu thống kê thời gian thực từ Database &amp; AST Engine...</span>
            </div>
          )}

          {/* TRƯỜNG HỢP 5: Lỗi tải Analytics */}
          {!analyticsLoading && analyticsError && (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-2">
              <AlertCircle size={20} className="text-rose-600" />
              <p className="text-xs text-rose-700">{analyticsError}</p>
              <button
                onClick={() => selectedAssignmentId && loadAnalytics(selectedAssignmentId)}
                className="mt-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 6: Hiển thị số liệu Analytics thật */}
          {!analyticsLoading && !analyticsError && analytics && (
            <>
              {/* 4 Stats Cards Thật */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Tổng sinh viên lớp</span>
                    <Users size={16} className="text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{analytics?.stats?.totalActiveStudents ?? 0}</p>
                  <p className="text-[11px] text-emerald-600 mt-1">Đồng bộ từ CSDL</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Số bài đã nộp</span>
                    <FileText size={16} className="text-indigo-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {analytics?.stats?.submittedCount ?? 0} / {analytics?.stats?.totalActiveStudents ?? 0}
                  </p>
                  <p className="text-[11px] text-indigo-600 mt-1">
                    Tỷ lệ: {analytics?.stats?.submissionRate ?? 0}%
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Điểm trung bình</span>
                    <TrendingUp size={16} className="text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{analytics?.stats?.averageScore ?? 0}</p>
                  <p className="text-[11px] text-emerald-600 mt-1">Hệ thống Sandbox</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Cặp nghi vấn đạo văn</span>
                    <AlertOctagon size={16} className="text-rose-600" />
                  </div>
                  <p className="text-2xl font-bold text-rose-600">
                    {analytics?.topPlagiarismMatches?.length ?? 0} cặp
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">AST Winnowing Engine</p>
                </div>
              </div>

              {/* Bảng Top Nghi vấn Đạo văn Thật (Plagiarism Matches) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <AlertOctagon size={16} className="text-rose-600" />
                      <span>Bảng so khớp đạo văn AST (Winnowing)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Dữ liệu so khớp trực tiếp từ AST Engine (port 8000) lưu tại bảng PLAGIARISM_MATCHES
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-3">Cặp sinh viên nghi vấn</th>
                        <th className="py-3 px-3 text-center">Tỷ lệ tương đồng AST</th>
                        <th className="py-3 px-3 text-center">Phân loại</th>
                        <th className="py-3 px-3 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics?.topPlagiarismMatches && analytics.topPlagiarismMatches.length > 0 ? (
                        analytics.topPlagiarismMatches.map((item: PlagiarismMatchItem) => {
                          const level = resolveLevel(item.similarityPercent, item.level);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50 transition">
                              <td className="py-3.5 px-3">
                                <div className="font-medium text-slate-900">
                                  {item.student1?.studentCode} - {item.student1?.fullName}
                                </div>
                                <div className="text-slate-500 text-[11px]">
                                  ↔ {item.student2?.studentCode} - {item.student2?.fullName}
                                </div>
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <span className={`font-bold px-2 py-1 rounded-md ${LEVEL_STYLE[level].badge}`}>
                                  {item.similarityPercent.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEVEL_STYLE[level].solid}`}>
                                  {LEVEL_STYLE[level].label}
                                  {level === 'DANGER' ? ' (Giữ điểm)' : ''}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-right">
                                <button
                                  onClick={() => navigate(`/lecturer/plagiarism/${item.id}`)}
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-xs hover:underline"
                                >
                                  <span>Xem bài đối chiếu</span>
                                  <ChevronRight size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Chưa phát hiện cặp trùng lặp nào trong bài tập này.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 2: HỘP THƯ PHÚC KHẢO (APPEALS) */}
      {activeTab === 'APPEALS' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare size={18} className="text-indigo-600" />
                  <span>Hộp thư Phúc khảo &amp; Khiếu nại</span>
                  {pendingAppealsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200">
                      {pendingAppealsCount} đơn chờ duyệt
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Xem xét và giải quyết các khiếu nại về điểm số hoặc giải trình nghi vấn đạo văn của sinh viên
                </p>
              </div>
              <button
                onClick={loadPendingAppeals}
                disabled={appealsLoading}
                className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition"
              >
                {appealsLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                <span>Làm mới danh sách</span>
              </button>
            </div>

            {/* Trạng thái tải */}
            {appealsLoading && (
              <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin text-indigo-600" />
                <span>Đang tải danh sách khiếu nại từ hệ thống...</span>
              </div>
            )}

            {/* Trạng thái lỗi */}
            {!appealsLoading && appealsError && (
              <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
                <AlertCircle size={28} className="text-rose-600" />
                <p className="text-xs text-rose-700 font-medium">{appealsError}</p>
                <button
                  onClick={loadPendingAppeals}
                  className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-700 font-medium"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Trạng thái rỗng: không có đơn nào */}
            {!appealsLoading && !appealsError && appeals.length === 0 && (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Hộp thư phúc khảo trống</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Hiện tại không có sinh viên nào gửi đơn khiếu nại cần xử lý.</p>
                </div>
              </div>
            )}

            {/* Danh sách các đơn khiếu nại */}
            {!appealsLoading && !appealsError && appeals.length > 0 && (
              <div className="divide-y divide-slate-100 mt-2">
                {appeals.map((appeal) => {
                  const studentName = appeal.student?.user?.fullName || 'Sinh viên';
                  const studentCode = appeal.student?.studentCode || 'N/A';
                  const studentEmail = appeal.student?.user?.email || '';
                  const assignmentTitle = appeal.submission?.assignment?.title || 'Bài tập';
                  const currentScore =
                    appeal.submission?.totalScore != null
                      ? (appeal.submission.totalScore / 10).toFixed(1)
                      : 'Chưa có';
                  const dateStr = appeal.createdAt
                    ? new Date(appeal.createdAt).toLocaleString('vi-VN')
                    : '';

                  return (
                    <div key={appeal.id} className="py-4 hover:bg-slate-50/50 rounded-xl px-2 transition">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-slate-900">{studentName}</span>
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                              {studentCode}
                            </span>
                            {studentEmail && (
                              <span className="text-[11px] text-slate-400">({studentEmail})</span>
                            )}
                            <span className="text-[10px] text-slate-400">• {dateStr}</span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <span>Bài tập: <strong className="text-slate-800">{assignmentTitle}</strong></span>
                            <span>•</span>
                            <span>Điểm hiện tại: <strong className="text-indigo-600">{currentScore}</strong></span>
                          </div>

                          <div className="mt-2 p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-950">
                            <p className="font-semibold text-[11px] text-amber-800 mb-1 flex items-center gap-1">
                              <MessageSquare size={12} /> Lý do khiếu nại của sinh viên:
                            </p>
                            <p className="whitespace-pre-wrap leading-relaxed">{appeal.reason}</p>
                          </div>
                        </div>

                        {/* Hành động */}
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center mt-2 md:mt-0">
                          <button
                            onClick={() => navigate(`/submissions/${appeal.submissionId}/results`)}
                            className="px-3 py-1.5 text-xs rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1 transition"
                          >
                            <ExternalLink size={12} />
                            <span>Xem bài nộp</span>
                          </button>
                          <button
                            onClick={() => handleOpenResolveModal(appeal, 'RESOLVED')}
                            className="px-3 py-1.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 transition shadow-sm"
                          >
                            <CheckCircle2 size={13} />
                            <span>Duyệt &amp; Sửa điểm</span>
                          </button>
                          <button
                            onClick={() => handleOpenResolveModal(appeal, 'REJECTED')}
                            className="px-2.5 py-1.5 text-xs rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 font-semibold flex items-center gap-1 transition"
                          >
                            <X size={13} />
                            <span>Bác bỏ</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GIT TEAMWORK ANALYTICS */}
      {activeTab === 'GIT_ANALYTICS' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <GitBranch size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Git Teamwork Analytics</h2>
                <p className="text-xs text-slate-500">Phân tích mức độ đóng góp mã nguồn và phối hợp làm việc nhóm qua Git</p>
              </div>
            </div>
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <GitBranch size={32} className="mx-auto text-slate-400" />
              <p className="font-semibold text-slate-700">Dữ liệu phân tích Git đang được xử lý</p>
              <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                Hệ thống đang tích hợp với webhook Git repository của lớp học để đo lường số commit, tần suất code và mức độ đóng góp của từng thành viên.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  </main>

      {/* Modal Tạo Lớp Học Mới */}
      {showCreateClassModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Tạo Lớp học mới</h3>
              <button onClick={() => setShowCreateClassModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Mã lớp học (Class Code):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: SE1801-SWP391"
                  value={newClassCode}
                  onChange={(e) => setNewClassCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {createClassError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{createClassError}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={creatingClass}
                onClick={() => setShowCreateClassModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                disabled={creatingClass || !newClassCode.trim()}
                onClick={handleCreateClass}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingClass ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{creatingClass ? 'Đang tạo...' : 'Tạo lớp'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Excel Thật */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Import danh sách Sinh viên (.xlsx)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Sử dụng Database Transaction (NFR-12 &amp; US06). File Excel chứa cột: Email, MSSV (StudentCode), Họ tên.
            </p>

            <div
              onClick={() => excelInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-400 p-6 rounded-2xl text-center cursor-pointer bg-slate-50"
            >
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setExcelFile(e.target.files[0]);
                    setImportMessage(null);
                  }
                }}
              />
              <FileSpreadsheet className="mx-auto text-emerald-600 mb-2" size={32} />
              <p className="text-xs font-semibold text-slate-800">
                {excelFile ? excelFile.name : 'Chọn file Excel (.xlsx)'}
              </p>
            </div>

            {importMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  importMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {importMessage.type === 'success' ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                <span>{importMessage.text}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={importing}
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Đóng
              </button>
              <button
                disabled={importing || !excelFile}
                onClick={handleImportExcel}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>{importing ? 'Đang xử lý...' : 'Xác nhận Import'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tạo Bài Tập Mới Thật */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Tạo đề bài tập mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Tiêu đề bài tập (*):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Assignment 1: Java OOP Car Rental"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Mô tả bài tập:</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả yêu cầu bài toán..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Ngôn ngữ (*):</label>
                  <select
                    value={newLanguage}
                    onChange={(e) => setNewLanguage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none"
                  >
                    <option value="Java">Java (JDK 17)</option>
                    <option value="C#">C# (.NET 8.0)</option>
                    <option value="Python">Python 3.11</option>
                  </select>
                </div>

                <div>
                  <label className="font-medium text-slate-700 block mb-1">Hạn nộp (*):</label>
                  <input
                    type="datetime-local"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none"
                  />
                </div>
              </div>

              {/* Test Cases cho Sandbox Docker */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-800">Bộ Test Cases (Sandbox):</label>
                  <button
                    type="button"
                    onClick={addTestCaseRow}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                  >
                    <Plus size={12} /> Thêm test case
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {testCases.map((tc, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <input
                        type="text"
                        placeholder="Input data"
                        value={tc.inputData}
                        onChange={(e) => {
                          const updated = [...testCases];
                          updated[idx].inputData = e.target.value;
                          setTestCases(updated);
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Expected output"
                        value={tc.expectedOutput}
                        onChange={(e) => {
                          const updated = [...testCases];
                          updated[idx].expectedOutput = e.target.value;
                          setTestCases(updated);
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Điểm"
                        value={tc.scoreWeight}
                        onChange={(e) => {
                          const updated = [...testCases];
                          updated[idx].scoreWeight = Number(e.target.value) || 1;
                          setTestCases(updated);
                        }}
                        className="w-14 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none text-center"
                      />
                      {testCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTestCaseRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {createAssignmentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{createAssignmentError}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={creatingAssignment}
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                disabled={creatingAssignment}
                onClick={handleCreateAssignment}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingAssignment ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                <span>{creatingAssignment ? 'Đang tạo...' : 'Tạo đề bài'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Duyệt & Xử lý Khiếu nại (Appeal Resolution Modal) */}
      {resolveModalAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                {resolveStatus === 'RESOLVED' ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Chấp thuận phúc khảo &amp; Sửa điểm</span>
                  </>
                ) : (
                  <>
                    <X size={16} className="text-rose-600" />
                    <span>Bác bỏ khiếu nại</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setResolveModalAppeal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
              <p>Sinh viên: <strong className="text-slate-800">{resolveModalAppeal.student?.user?.fullName || 'Sinh viên'}</strong> ({resolveModalAppeal.student?.studentCode || 'N/A'})</p>
              <p>Bài tập: <strong className="text-slate-800">{resolveModalAppeal.submission?.assignment?.title || 'Bài tập'}</strong></p>
              <p>Điểm hiện tại: <strong className="text-indigo-600">{resolveModalAppeal.submission?.totalScore != null ? (resolveModalAppeal.submission.totalScore / 10).toFixed(1) : 'Chưa có'}</strong></p>
              <div className="pt-1.5 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium block mb-0.5">Lý do khiếu nại:</span>
                <p className="text-[11px] text-amber-900 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60 italic leading-relaxed">
                  &quot;{resolveModalAppeal.reason}&quot;
                </p>
              </div>
            </div>

            {resolveError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{resolveError}</span>
              </div>
            )}

            {resolveStatus === 'RESOLVED' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Điểm mới sau phúc khảo (thang điểm 10):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={resolveNewScore}
                  onChange={(e) => setResolveNewScore(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:bg-white"
                  placeholder="Ví dụ: 8.5"
                />
                <p className="text-[10px] text-slate-400 mt-1">Hệ thống sẽ tự động ghi vết thay đổi điểm vào Score Audit Log theo quy định R03.</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phản hồi của giảng viên gửi cho sinh viên:
              </label>
              <textarea
                rows={3}
                value={resolveFeedback}
                onChange={(e) => setResolveFeedback(e.target.value)}
                placeholder={resolveStatus === 'RESOLVED' ? "Nhập nhận xét / lý do điều chỉnh điểm..." : "Nhập lý do bác bỏ khiếu nại..."}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolveModalAppeal(null)}
                disabled={resolving}
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSubmitResolve}
                disabled={resolving}
                className={`px-4 py-2 text-xs rounded-xl text-white font-semibold flex items-center gap-1.5 shadow-sm transition ${
                  resolveStatus === 'RESOLVED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {resolving ? <Loader2 size={13} className="animate-spin" /> : null}
                <span>{resolveStatus === 'RESOLVED' ? 'Xác nhận cập nhật' : 'Xác nhận bác bỏ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
