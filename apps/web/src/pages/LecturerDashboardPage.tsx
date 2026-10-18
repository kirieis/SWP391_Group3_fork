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
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { LEVEL_STYLE, resolveLevel } from '../features/plagiarism/level';

// Kiểu dữ liệu lớp học từ backend
interface ClassItem {
  id: string;
  classCode: string;
  _count?: { students?: number };
  students?: Array<{
    student?: {
      studentCode?: string;
      user?: { fullName?: string; email?: string };
    };
  }>;
  [key: string]: unknown;
}

// Kiểu dữ liệu assignments từ backend
interface AssignmentItem {
  id: string;
  classId: string;
  title: string;
  description?: string | null;
  language?: string;
  deadline?: string;
  class?: { classCode?: string };
  [key: string]: unknown;
}

// Kiểu dữ liệu pairs nghi vấn đạo văn từ analytics
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
  const [expandedStudentList, setExpandedStudentList] = useState<boolean>(false);

  // Trạng thái Assignment
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

  // Modal Import Excel Student
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
  const [generationTopic, setGenerationTopic] = useState<string>('');
  const [generationDifficulty, setGenerationDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [generatingAssignment, setGeneratingAssignment] = useState<boolean>(false);
  const [generationNotice, setGenerationNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [assignmentCreateMode, setAssignmentCreateMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [existingAssignments, setExistingAssignments] = useState<AssignmentItem[]>([]);
  const [existingAssignmentsLoading, setExistingAssignmentsLoading] = useState<boolean>(false);
  const [existingAssignmentsError, setExistingAssignmentsError] = useState<string>('');
  const [existingAssignmentClassFilters, setExistingAssignmentClassFilters] = useState<string[]>([]);
  const [selectedSourceAssignmentId, setSelectedSourceAssignmentId] = useState<string>('');
  const [targetExistingClassId, setTargetExistingClassId] = useState<string>('');

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
      setAppealsError(res.message || 'Unable to load appeals.');
      setAppeals([]);
    }
  };

  const handleOpenResolveModal = (appeal: AppealItem, defaultStatus: 'RESOLVED' | 'REJECTED') => {
    setResolveModalAppeal(appeal);
    setResolveStatus(defaultStatus);
    setResolveFeedback('');
    const currentScore =
      appeal.submission?.totalScore != null ? Number(appeal.submission.totalScore).toFixed(1) : '';
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
        parsedScore = Math.round(num * 10) / 10;
      }
    }

    const res = await apiRequest(`/submissions/appeal/${resolveModalAppeal.id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: resolveStatus,
        lecturerResponse:
          resolveFeedback.trim() ||
          (resolveStatus === 'RESOLVED' ? 'Appeal approved' : 'Appeal rejected'),
        ...(parsedScore !== undefined && { newScore: parsedScore }),
        reasonForScoreChange: resolveFeedback.trim() || 'Score adjusted after review',
      }),
    });

    setResolving(false);
    if (res.success) {
      setResolveModalAppeal(null);
      loadPendingAppeals();
    } else {
      setResolveError(res.message || 'Unable to process the appeal. Please try again.');
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
      setAnalyticsError(res.message || 'Unable to load submission analytics.');
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
      setAssignmentsError(res.message || 'Unable to load assignments for this class.');
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
      setClassesError(res.message || 'Unable to load classes.');
      setClasses([]);
    }
  };

  const loadExistingAssignments = async () => {
    setExistingAssignmentsLoading(true);
    setExistingAssignmentsError('');
    const res = await apiRequest<AssignmentItem[]>('/assignments');
    setExistingAssignmentsLoading(false);

    if (res.success && Array.isArray(res.data)) {
      setExistingAssignments(res.data);
      setExistingAssignmentClassFilters([]);
      setSelectedSourceAssignmentId((current) =>
        res.data?.some((assignment) => assignment.id === current) ? current : ''
      );
    } else {
      setExistingAssignments([]);
      setExistingAssignmentsError(res.message || 'Unable to load your existing assignments.');
    }
  };

  const handleCloneExistingAssignment = async () => {
    const targetClassId = targetExistingClassId || selectedClassId;
    if (!selectedSourceAssignmentId || !targetClassId || !newDeadline) {
      setCreateAssignmentError('Select an existing assignment, a target class, and a new deadline.');
      return;
    }

    setCreatingAssignment(true);
    setCreateAssignmentError('');
    const res = await apiRequest('/assignments/clone', {
      method: 'POST',
      body: JSON.stringify({
        sourceAssignmentId: selectedSourceAssignmentId,
        targetClassId,
        newDeadline: new Date(newDeadline).toISOString(),
      }),
    });
    setCreatingAssignment(false);

    if (res.success) {
      setShowCreateModal(false);
      setAssignmentCreateMode('NEW');
      setSelectedSourceAssignmentId('');
      setTargetExistingClassId('');
      setSelectedClassId(targetClassId);
      await loadAssignmentsForClass(targetClassId);
    } else {
      setCreateAssignmentError(res.message || 'Unable to reuse this assignment.');
    }
  };

  const handleSelectAssignment = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setAnalytics(null);
    setAnalyticsError('');
    loadAnalytics(assignmentId);
  };

  const handleSelectClass = (classId: string) => {
    setExpandedStudentList(false);
    setSelectedClassId(classId);
    // Xóa ngay dữ liệu assignments và số liệu thống kê của lớp cũ để tránh lưu vết sai lệch
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

  // 2. Create a class qua POST /classes
  const handleCreateClass = async () => {
    if (!newClassCode.trim()) {
      setCreateClassError('Please enter a class code (e.g. SE1801-SWP391).');
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
      setCreateClassError(res.message || 'Unable to create the class. Please try again.');
    }
  };

  // 3. Xử lý Import Excel Student Thật qua POST /classes/:classId/import-students
  const handleImportExcel = async () => {
    if (!selectedClassId || !excelFile) {
      setImportMessage({ type: 'error', text: 'Please select a class and an Excel file (.xlsx).' });
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
      setImportMessage({ type: 'success', text: res.message || 'Student list imported successfully!' });
      setExcelFile(null);
      loadClasses();
    } else {
      setImportMessage({ type: 'error', text: res.message || 'Import failed (all changes were rolled back).' });
    }
  };

  // Sinh bản nháp bằng AI. Lecturer vẫn phải rà soát và bấm Create assignment để lưu.
  const handleGenerateAssignment = async () => {
    const topic = generationTopic.trim();
    if (!topic) {
      setGenerationNotice({ type: 'error', text: 'Please enter a topic before asking AI to generate an assignment.' });
      return;
    }

    setGeneratingAssignment(true);
    setGenerationNotice(null);
    setCreateAssignmentError('');
    const res = await apiRequest<{
      title: string;
      description: string;
      testCases: Array<{ input?: string; inputData?: string; expectedOutput?: string; scoreWeight?: number; label?: string }>;
    }>('/assignments/generate', {
      method: 'POST',
      body: JSON.stringify({ topic, language: newLanguage, difficulty: generationDifficulty }),
    });
    setGeneratingAssignment(false);

    if (!res.success || !res.data) {
      setGenerationNotice({ type: 'error', text: res.message || 'AI could not generate the assignment. Please try again.' });
      return;
    }

    const generatedCases = Array.isArray(res.data.testCases) ? res.data.testCases : [];
    if (!res.data.title?.trim() || !res.data.description?.trim() || generatedCases.length === 0) {
      setGenerationNotice({ type: 'error', text: 'AI returned an incomplete assignment. Try again or enter it manually.' });
      return;
    }

    const rawWeights = generatedCases.map((tc) => {
      const value = Number(tc.scoreWeight);
      return Number.isFinite(value) && value > 0 ? value : 1;
    });
    const totalWeight = rawWeights.reduce((sum, value) => sum + value, 0);
    const mappedCases = generatedCases.map((tc, index) => ({
      inputData: String(tc.input ?? tc.inputData ?? ''),
      expectedOutput: String(tc.expectedOutput ?? ''),
      scoreWeight: Math.max(1, Math.floor((rawWeights[index] / totalWeight) * 100)),
    }));
    // Phân bổ phần dư cho case cuối, đồng thời tránh trọng số âm khi AI trả trọng số lệch.
    let difference = 100 - mappedCases.reduce((sum, tc) => sum + tc.scoreWeight, 0);
    while (difference < 0) {
      const candidate = mappedCases
        .map((tc, index) => ({ index, weight: tc.scoreWeight }))
        .filter((entry) => entry.weight > 1)
        .sort((a, b) => b.weight - a.weight)[0];
      if (!candidate) break;
      mappedCases[candidate.index].scoreWeight -= 1;
      difference += 1;
    }
    if (difference > 0) mappedCases[mappedCases.length - 1].scoreWeight += difference;
    setNewTitle(res.data.title.trim());
    setNewDescription(res.data.description.trim());
    setTestCases(mappedCases);
    setGenerationNotice({ type: 'success', text: `Generated a draft with ${mappedCases.length} test cases. Review the input/output carefully before saving.` });
  };

  // 4. Xử lý Tạo Assignment Mới Thật qua POST /assignments
  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !selectedClassId) {
      setCreateAssignmentError('Please enter an assignment title and select a class.');
      return;
    }
    if (!newDeadline) {
      setCreateAssignmentError('Please set an assignment deadline.');
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
      setCreateAssignmentError(res.message || 'Unable to create the assignment.');
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
              { id: 'DASHBOARD', label: 'Dashboard', icon: TrendingUp, action: () => setActiveTab('DASHBOARD') },
              { id: 'CREATE_CLASS', label: 'Create new class', icon: GraduationCap, action: () => setShowCreateClassModal(true) },
              { id: 'CREATE_ASSIGNMENT', label: 'Create new assignment', icon: PlusCircle, action: () => {
                setAssignmentCreateMode('NEW');
                setCreateAssignmentError('');
                setShowCreateModal(true);
              } },
              { id: 'IMPORT_STUDENTS', label: 'Import students (Excel)', icon: Upload, action: () => setShowImportModal(true) },
              { id: 'GIT_ANALYTICS', label: 'Git Teamwork Analytics', icon: GitBranch, action: () => setActiveTab('GIT_ANALYTICS') },
              {
                id: 'APPEALS',
                label: 'Appeals inbox',
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

        {/* Thông tin Lecturer đăng nhập & Nút Sign out */}
        <div className="border-t border-slate-200 pt-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
              {user?.fullName?.charAt(0) || 'GV'}
            </div>
            <div className="min-w-0 max-w-[130px]">
              <p className="text-xs font-semibold text-slate-800 truncate">{user?.fullName || 'Lecturer'}</p>
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
            title="Sign out"
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
                <label className="text-xs text-slate-500">Class:</label>
                {classesLoading ? (
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Loading...
                  </span>
                ) : classes.length > 0 ? (
                  <select
                    value={selectedClassId}
                    onChange={(e) => handleSelectClass(e.target.value)}
                    className="text-xs font-mono bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl font-semibold border border-indigo-200 outline-none"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.classCode} ({c._count?.students || 0} students)
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setShowCreateClassModal(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    <Plus size={13} /> Create your first class
                  </button>
                )}

                {/* Dropdown chọn assignments */}
                {assignments.length > 0 && (
                  <>
                    <label className="text-xs text-slate-500 ml-2">Assignment:</label>
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
                  Dashboard
                </button>
                <span className="text-xs text-slate-300">/</span>
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-indigo-600" />
                  <span>Appeals inbox</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('DASHBOARD')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium transition"
                >
                  Dashboard
                </button>
                <span className="text-xs text-slate-300">/</span>
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <GitBranch size={14} className="text-indigo-600" />
                  <span>Git Teamwork Analytics</span>
                </span>
              </div>
            )}
          </div>


        </header>

        <div className="p-6 space-y-6 max-w-6xl w-full mx-auto">
          {activeTab === 'DASHBOARD' && (
            <>
              {classes.find((item) => item.id === selectedClassId)?.students && (
                <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedStudentList((expanded) => !expanded)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                    aria-expanded={expandedStudentList}
                  >
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Class student list</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {classes.find((item) => item.id === selectedClassId)?.students?.length ?? 0} enrolled students · Student Code and Full Name only
                      </p>
                    </div>
                    <ChevronRight size={18} className={`transition-transform ${expandedStudentList ? 'rotate-90' : ''}`} />
                  </button>
                  <div className="px-4 pb-4">
                    {(classes.find((item) => item.id === selectedClassId)?.students?.length ?? 0) > 0 && (
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <span>Student Code</span>
                        <span>Full Name</span>
                      </div>
                    )}
                    {(classes.find((item) => item.id === selectedClassId)?.students ?? [])
                      .slice(0, expandedStudentList ? undefined : 20)
                      .map((enrollment, index) => (
                        <div key={`${enrollment.student?.studentCode ?? 'student'}-${index}`} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5 text-xs">
                          <span className="font-mono font-medium text-slate-700">{enrollment.student?.studentCode || 'ID unavailable'}</span>
                          <span className="font-semibold text-slate-900">{enrollment.student?.user?.fullName || 'Name unavailable'}</span>
                        </div>
                      ))}
                    {(classes.find((item) => item.id === selectedClassId)?.students?.length ?? 0) === 0 && (
                      <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">No students enrolled in this class yet.</p>
                    )}
                    {(classes.find((item) => item.id === selectedClassId)?.students?.length ?? 0) > 20 && (
                      <button type="button" onClick={() => setExpandedStudentList((expanded) => !expanded)} className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                        {expandedStudentList ? 'Show fewer students' : 'Show all students'}
                      </button>
                    )}
                  </div>
                </section>
              )}
              {assignments.find((item) => item.id === selectedAssignmentId)?.description && (
                <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">Assignment description</h3>
                  <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {assignments.find((item) => item.id === selectedAssignmentId)?.description}
                  </p>
                </section>
              )}
              {/* TRƯỜNG HỢP 1: Lỗi tải danh sách lớp */}
          {classesError && (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-2">
              <AlertCircle size={24} className="text-rose-600" />
              <p className="text-xs text-rose-700 font-medium">{classesError}</p>
              <button
                onClick={loadClasses}
                className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-700"
              >
                Try again
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 1b: Lỗi tải danh sách assignments */}
          {assignmentsError && (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-2">
              <AlertCircle size={24} className="text-rose-600" />
              <p className="text-xs text-rose-700 font-medium">{assignmentsError}</p>
              <button
                onClick={() => selectedClassId && loadAssignmentsForClass(selectedClassId)}
                className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-700"
              >
                Try again
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 2: Lecturer chưa có lớp học nào */}
          {!classesLoading && !classesError && classes.length === 0 && (
            <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Users size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">You are not assigned to any classes yet</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Create a class to start assigning work and tracking plagiarism analysis.
              </p>
              <button
                onClick={() => setShowCreateClassModal(true)}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                <span>Create new class</span>
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 3: Có lớp học nhưng lớp chưa có assignments nào */}
          {!classesLoading && !classesError && classes.length > 0 && !assignmentsLoading && assignments.length === 0 && (
            <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <FileText size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">This class has no assignments yet</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Create the first programming assignment so students can submit work for automatic grading through the AST Engine.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle size={14} />
                <span>Create assignment for class</span>
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 4: Đang tải Analytics */}
          {analyticsLoading && (
            <div className="p-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              <span>Calculating real-time analytics from the database and AST Engine...</span>
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
                Try again
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
                    <span className="text-xs font-medium">Total students</span>
                    <Users size={16} className="text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{analytics?.stats?.totalActiveStudents ?? 0}</p>
                  <p className="text-[11px] text-emerald-600 mt-1">Synced from database</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Submissions</span>
                    <FileText size={16} className="text-indigo-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {analytics?.stats?.submittedCount ?? 0} / {analytics?.stats?.totalActiveStudents ?? 0}
                  </p>
                  <p className="text-[11px] text-indigo-600 mt-1">
                    Rate: {analytics?.stats?.submissionRate ?? 0}%
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Average score</span>
                    <TrendingUp size={16} className="text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{analytics?.stats?.averageScore ?? 0}</p>
                  <p className="text-[11px] text-emerald-600 mt-1">Sandbox system</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium">Suspected plagiarism pairs</span>
                    <AlertOctagon size={16} className="text-rose-600" />
                  </div>
                  <p className="text-2xl font-bold text-rose-600">
                    {analytics?.topPlagiarismMatches?.length ?? 0} pairs
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
                      <span>AST Plagiarism Matches (Winnowing)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Match data from the AST Engine (port 8000), stored in PLAGIARISM_MATCHES
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-3">Suspected student pairs</th>
                        <th className="py-3 px-3 text-center">AST similarity</th>
                        <th className="py-3 px-3 text-center">Classification</th>
                        <th className="py-3 px-3 text-right">Details</th>
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
                                  {level === 'DANGER' ? ' (Score withheld)' : ''}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-right">
                                <button
                                  onClick={() => navigate(`/lecturer/plagiarism/${item.id}`)}
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-xs hover:underline"
                                >
                                  <span>View comparison</span>
                                  <ChevronRight size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            No matching pairs were found for this assignment.
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
                  <span>Appeals &amp; Review Inbox</span>
                  {pendingAppealsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200">
                      {pendingAppealsCount} pending appeals
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Review and resolve score appeals or student explanations regarding suspected plagiarism.
                </p>
              </div>
              <button
                onClick={loadPendingAppeals}
                disabled={appealsLoading}
                className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition"
              >
                {appealsLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                <span>Refresh list</span>
              </button>
            </div>

            {/* Trạng thái tải */}
            {appealsLoading && (
              <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin text-indigo-600" />
                <span>Loading appeals from the system...</span>
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
                  Try again
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
                  <h4 className="text-sm font-bold text-slate-800">No appeals yet</h4>
                  <p className="text-xs text-slate-500 mt-0.5">There are no student appeals requiring action right now.</p>
                </div>
              </div>
            )}

            {/* Danh sách các đơn khiếu nại */}
            {!appealsLoading && !appealsError && appeals.length > 0 && (
              <div className="divide-y divide-slate-100 mt-2">
                {appeals.map((appeal) => {
                  const studentName = appeal.student?.user?.fullName || 'Student';
                  const studentCode = appeal.student?.studentCode || 'N/A';
                  const studentEmail = appeal.student?.user?.email || '';
                  const assignmentTitle = appeal.submission?.assignment?.title || 'Assignment';
                  const currentScore =
                    appeal.submission?.totalScore != null
                      ? Number(appeal.submission.totalScore).toFixed(1)
                      : 'Not available';
                  const dateStr = appeal.createdAt
                    ? new Date(appeal.createdAt).toLocaleString('en-US')
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
                            <span>Assignment: <strong className="text-slate-800">{assignmentTitle}</strong></span>
                            <span>•</span>
                            <span>Current score: <strong className="text-indigo-600">{currentScore}</strong></span>
                          </div>

                          <div className="mt-2 p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-950">
                            <p className="font-semibold text-[11px] text-amber-800 mb-1 flex items-center gap-1">
                              <MessageSquare size={12} /> Student appeal reason:
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
                            <span>View submission</span>
                          </button>
                          <button
                            onClick={() => handleOpenResolveModal(appeal, 'RESOLVED')}
                            className="px-3 py-1.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 transition shadow-sm"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve &amp; adjust score</span>
                          </button>
                          <button
                            onClick={() => handleOpenResolveModal(appeal, 'REJECTED')}
                            className="px-2.5 py-1.5 text-xs rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 font-semibold flex items-center gap-1 transition"
                          >
                            <X size={13} />
                            <span>Reject</span>
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
                <p className="text-xs text-slate-500">Analyze source-code contributions and teamwork through Git.</p>
              </div>
            </div>
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <GitBranch size={32} className="mx-auto text-slate-400" />
              <p className="font-semibold text-slate-700">Git analytics are being processed</p>
              <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                The system is integrating with the class Git repository webhook to measure commits, coding frequency, and each member’s contribution.
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
              <h3 className="text-base font-bold text-slate-900">Create a class</h3>
              <button onClick={() => setShowCreateClassModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Class code:</label>
                <input
                  type="text"
                  placeholder="Example: SE1801-SWP391"
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
                Cancel
              </button>
              <button
                disabled={creatingClass || !newClassCode.trim()}
                onClick={handleCreateClass}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingClass ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{creatingClass ? 'Creating...' : 'Create class'}</span>
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
              <h3 className="text-base font-bold text-slate-900">Import student list (.xlsx)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Uses a database transaction (NFR-12 &amp; US06). The Excel file must contain: Email, StudentCode, Full Name.
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
                {excelFile ? excelFile.name : 'Choose Excel file (.xlsx)'}
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
                Close
              </button>
              <button
                disabled={importing || !excelFile}
                onClick={handleImportExcel}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>{importing ? 'Processing...' : 'Confirm import'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tạo Bài Tập Mới Thật */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Create assignment</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAssignmentCreateMode('NEW');
                    setCreateAssignmentError('');
                  }}
                  className={`rounded-lg px-3 py-2 font-semibold transition ${assignmentCreateMode === 'NEW' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Create new
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignmentCreateMode('EXISTING');
                    setCreateAssignmentError('');
                    setTargetExistingClassId(selectedClassId);
                    if (existingAssignments.length === 0) loadExistingAssignments();
                  }}
                  className={`rounded-lg px-3 py-2 font-semibold transition ${assignmentCreateMode === 'EXISTING' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Choose existing
                </button>
              </div>

              {assignmentCreateMode === 'EXISTING' ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-slate-900">Your existing assignments</h4>
                    <p className="mt-1 text-slate-500">Choose an assignment to copy into the selected target class. Its description and test cases will be copied too.</p>
                  </div>

                  <div className="space-y-2">
                    <p className="font-semibold text-slate-700">Filter by source class</p>
                    <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1.5">
                      {classes.length === 0 ? (
                        <p className="p-2 text-slate-500">No classes available.</p>
                      ) : classes.map((classItem) => (
                        <label key={classItem.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={existingAssignmentClassFilters.includes(classItem.id)}
                            onChange={(event) => setExistingAssignmentClassFilters((current) =>
                              event.target.checked
                                ? [...current, classItem.id]
                                : current.filter((id) => id !== classItem.id)
                            )}
                          />
                          <span>{classItem.classCode}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">Leave all classes unchecked to show assignments from every class you manage.</p>
                  </div>

                  {existingAssignmentsLoading ? (
                    <div className="flex items-center gap-2 py-4 text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading assignments...</div>
                  ) : existingAssignmentsError ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
                      <span>{existingAssignmentsError}</span>
                      <button type="button" onClick={loadExistingAssignments} className="font-semibold underline">Retry</button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[420px] text-left">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="p-2.5">Select</th>
                            <th className="p-2.5">Assignment</th>
                            <th className="p-2.5">Source class</th>
                            <th className="p-2.5">Language</th>
                          </tr>
                        </thead>
                        <tbody>
                          {existingAssignments
                            .filter((assignment) => existingAssignmentClassFilters.length === 0 || existingAssignmentClassFilters.includes(assignment.classId))
                            .map((assignment) => (
                              <tr key={assignment.id} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="p-2.5">
                                  <input
                                    type="radio"
                                    name="existingAssignment"
                                    checked={selectedSourceAssignmentId === assignment.id}
                                    onChange={() => setSelectedSourceAssignmentId(assignment.id)}
                                    aria-label={`Select ${assignment.title}`}
                                  />
                                </td>
                                <td className="p-2.5">
                                  <p className="font-semibold text-slate-800">{assignment.title}</p>
                                  {assignment.description && <p className="mt-1 max-w-xs line-clamp-2 text-[11px] text-slate-500">{assignment.description}</p>}
                                </td>
                                <td className="p-2.5">{assignment.class?.classCode || classes.find((item) => item.id === assignment.classId)?.classCode || 'Unknown class'}</td>
                                <td className="p-2.5">{assignment.language || 'N/A'}</td>
                              </tr>
                            ))}
                          {existingAssignments.filter((assignment) => existingAssignmentClassFilters.length === 0 || existingAssignmentClassFilters.includes(assignment.classId)).length === 0 && (
                            <tr><td colSpan={4} className="p-5 text-center text-slate-500">No assignments match the selected class filters.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block font-medium text-slate-700">Target class</label>
                      <select value={targetExistingClassId || selectedClassId} onChange={(event) => setTargetExistingClassId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.classCode}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block font-medium text-slate-700">New deadline</label>
                      <input type="datetime-local" value={newDeadline} onChange={(event) => setNewDeadline(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2.5">
                <div className="flex items-center gap-2 font-semibold text-indigo-900">
                  <Sparkles size={15} />
                  <span>AI-assisted assignment generation</span>
                </div>
                <label className="font-medium text-slate-700 block">Topic / assignment requirements:</label>
                <textarea
                  rows={2}
                  value={generationTopic}
                  onChange={(e) => setGenerationTopic(e.target.value)}
                  maxLength={500}
                  placeholder="Example: Build an OOP student list manager with search by student ID..."
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 resize-y"
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={generationDifficulty}
                    onChange={(e) => setGenerationDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                    className="sm:w-36 bg-white border border-slate-200 rounded-xl p-2.5 outline-none"
                    aria-label="AI-generated assignment difficulty"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <button
                    type="button"
                    disabled={generatingAssignment || creatingAssignment}
                    onClick={handleGenerateAssignment}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {generatingAssignment ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generatingAssignment ? 'AI is generating the assignment...' : 'Generate with AI'}
                  </button>
                </div>
                {generationNotice && (
                  <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${generationNotice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    {generationNotice.type === 'success' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                    <span>{generationNotice.text}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Assignment title (*):</label>
                <input
                  type="text"
                  placeholder="Example: Assignment 1: Java OOP Car Rental"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Assignment description (*):</label>
                  <span className="text-[11px] text-slate-400">Detailed requirements for students</span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Describe the problem requirements, input/output formats, and constraints..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 text-xs leading-relaxed resize-y font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Language (*):</label>
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
                  <label className="font-medium text-slate-700 block mb-1">Deadline (*):</label>
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
                  <label className="font-semibold text-slate-800">Sandbox test cases:</label>
                  <button
                    type="button"
                    onClick={addTestCaseRow}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                  >
                    <Plus size={12} /> Add test case
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
                        placeholder="Score"
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
                </>
              )}

              {createAssignmentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{createAssignmentError}</span>
                </div>
              )}
            </div>

            <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-white">
              <button
                disabled={creatingAssignment}
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                disabled={creatingAssignment || (assignmentCreateMode === 'EXISTING' && (!selectedSourceAssignmentId || !(targetExistingClassId || selectedClassId)))}
                onClick={assignmentCreateMode === 'EXISTING' ? handleCloneExistingAssignment : handleCreateAssignment}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingAssignment ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                <span>{creatingAssignment ? (assignmentCreateMode === 'EXISTING' ? 'Copying...' : 'Creating...') : (assignmentCreateMode === 'EXISTING' ? 'Use selected assignment' : 'Create assignment')}</span>
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
                    <span>Approve appeal &amp; adjust score</span>
                  </>
                ) : (
                  <>
                    <X size={16} className="text-rose-600" />
                    <span>Appeal rejected</span>
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
              <p>Student: <strong className="text-slate-800">{resolveModalAppeal.student?.user?.fullName || 'Student'}</strong> ({resolveModalAppeal.student?.studentCode || 'N/A'})</p>
              <p>Assignment: <strong className="text-slate-800">{resolveModalAppeal.submission?.assignment?.title || 'Assignment'}</strong></p>
              <p>Current score: <strong className="text-indigo-600">{resolveModalAppeal.submission?.totalScore != null ? Number(resolveModalAppeal.submission.totalScore).toFixed(1) : 'Not available'}</strong></p>
              <div className="pt-1.5 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium block mb-0.5">Appeal reason:</span>
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
                  New score after review (out of 10):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={resolveNewScore}
                  onChange={(e) => setResolveNewScore(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:bg-white"
                  placeholder="Example: 8.5"
                />
                <p className="text-[10px] text-slate-400 mt-1">The system automatically records score changes in the Score Audit Log under rule R03.</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lecturer response to the student:
              </label>
              <textarea
                rows={3}
                value={resolveFeedback}
                onChange={(e) => setResolveFeedback(e.target.value)}
                placeholder={resolveStatus === 'RESOLVED' ? "Enter feedback or the reason for adjusting the score..." : "Enter the reason for rejecting the appeal..."}
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
                Cancel
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
                <span>{resolveStatus === 'RESOLVED' ? 'Confirm update' : 'Confirm rejection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
