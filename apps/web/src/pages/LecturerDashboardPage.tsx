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
} from 'lucide-react';
import { apiRequest } from '../services/api';

export default function LecturerDashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('DASHBOARD');
  const [loading, setLoading] = useState<boolean>(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [analytics, setAnalytics] = useState<any>(null);

  // Modal Import Excel
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Modal Tạo Bài Tập Mới
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newLanguage, setNewLanguage] = useState<string>('Java');
  const [newDeadline, setNewDeadline] = useState<string>('2026-12-31T23:59');
  const [creatingAssignment, setCreatingAssignment] = useState<boolean>(false);

  // 1. Tải danh sách lớp học của Giảng viên
  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    setLoading(true);
    const res = await apiRequest<any[]>('/classes/my-classes');
    if (res.success && res.data && res.data.length > 0) {
      setClasses(res.data);
      setSelectedClassId(res.data[0].id);
      loadAssignmentsForClass(res.data[0].id);
    } else {
      setLoading(false);
    }
  };

  const loadAssignmentsForClass = async (classId: string) => {
    const res = await apiRequest<any[]>(`/assignments?classId=${classId}`);
    if (res.success && res.data && res.data.length > 0) {
      setAssignments(res.data);
      setSelectedAssignmentId(res.data[0].id);
      loadAnalytics(res.data[0].id);
    } else {
      setAssignments([]);
      setAnalytics(null);
      setLoading(false);
    }
  };

  const loadAnalytics = async (assignmentId: string) => {
    setLoading(true);
    const res = await apiRequest<any>(`/dashboard/analytics/${assignmentId}`);
    if (res.success && res.data) {
      setAnalytics(res.data);
    }
    setLoading(false);
  };

  // 2. Xử lý Import Excel Sinh viên Thật (Transaction NFR-12 & US06)
  const handleImportExcel = async () => {
    if (!selectedClassId || !excelFile) {
      alert('Vui lòng chọn lớp học và file Excel (.xlsx).');
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

  // 3. Xử lý Tạo Assignment Mới Thật
  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !selectedClassId) {
      alert('Vui lòng nhập tiêu đề bài tập và chọn lớp.');
      return;
    }
    setCreatingAssignment(true);
    const res = await apiRequest('/assignments', {
      method: 'POST',
      body: JSON.stringify({
        classId: selectedClassId,
        title: newTitle,
        language: newLanguage,
        deadline: new Date(newDeadline).toISOString(),
        testCases: [
          { inputData: '1 2', expectedOutput: '3', scoreWeight: 1 },
          { inputData: '5 10', expectedOutput: '15', scoreWeight: 1 },
        ],
      }),
    });
    setCreatingAssignment(false);
    if (res.success) {
      alert('Đã tạo đề bài tập mới thành công!');
      setShowCreateModal(false);
      setNewTitle('');
      loadAssignmentsForClass(selectedClassId);
    } else {
      alert(res.message || 'Lỗi khi tạo đề bài.');
    }
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
              { id: 'DASHBOARD', label: 'Bảng tổng quan', icon: TrendingUp },
              { id: 'CREATE_ASSIGNMENT', label: 'Tạo bài tập (+ GenAI)', icon: PlusCircle, action: () => setShowCreateModal(true) },
              { id: 'IMPORT_STUDENTS', label: 'Nhập sinh viên (Excel)', icon: Upload, action: () => setShowImportModal(true) },
              { id: 'GIT_ANALYTICS', label: 'Git Teamwork Analytics', icon: GitBranch },
              { id: 'APPEALS', label: 'Hộp thư phúc khảo', icon: MessageSquare, badge: '2' },
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

        <div className="border-t border-slate-200 pt-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
              GV
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">Giảng viên bộ môn</p>
              <p className="text-[10px] text-slate-500">@fe.edu.vn</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('aita_token');
              localStorage.removeItem('aita_user');
              navigate('/login');
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
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
            <label className="text-xs text-slate-500">Chọn Lớp:</label>
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                loadAssignmentsForClass(e.target.value);
              }}
              className="text-xs font-mono bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl font-semibold border border-indigo-200 outline-none"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classCode} ({c._count?.students || 0} SV)
                </option>
              ))}
            </select>

            {assignments.length > 0 && (
              <>
                <label className="text-xs text-slate-500 ml-2">Bài tập:</label>
                <select
                  value={selectedAssignmentId}
                  onChange={(e) => {
                    setSelectedAssignmentId(e.target.value);
                    loadAnalytics(e.target.value);
                  }}
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
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition"
          >
            <span>Xem góc nhìn Sinh viên</span>
            <ExternalLink size={12} />
          </button>
        </header>

        <div className="p-6 space-y-6 max-w-6xl w-full mx-auto">
          {loading ? (
            <div className="p-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              <span>Đang tính toán số liệu thống kê thời gian thực từ Database & AST...</span>
            </div>
          ) : (
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
                      <span>Top Nghi vấn Trùng lặp AST (Winnowing Similarity Table Thật)</span>
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
                        analytics.topPlagiarismMatches.map((item: any) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 px-3">
                              <div className="font-medium text-slate-900">
                                {item.student1.studentCode} - {item.student1.fullName}
                              </div>
                              <div className="text-slate-500 text-[11px]">
                                ↔ {item.student2.studentCode} - {item.student2.fullName}
                              </div>
                            </td>
                            <td className="py-3.5 px-3 text-center">
                              <span
                                className={`font-bold px-2 py-1 rounded-md ${
                                  item.similarityPercent >= 80
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : item.similarityPercent >= 60
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {item.similarityPercent.toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  item.similarityPercent >= 80
                                    ? 'bg-rose-600 text-white'
                                    : item.similarityPercent >= 60
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-emerald-500 text-white'
                                }`}
                              >
                                {item.similarityPercent >= 80
                                  ? 'DANGER (Giữ điểm)'
                                  : item.similarityPercent >= 60
                                  ? 'WARNING'
                                  : 'SAFE'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <button
                                onClick={() => navigate(`/submissions/${item.student2.submissionId}/results`)}
                                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-xs hover:underline"
                              >
                                <span>Xem bài đối chiếu</span>
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Chưa phát hiện cặp trùng lặp nào vượt ngưỡng cảnh báo trong bài tập này.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Modal Import Excel Thật */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Import danh sách Sinh viên (.xlsx)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Sử dụng Database Transaction (NFR-12 & US06). Yêu cầu file Excel chứa cột: Email, MSSV (hoặc StudentCode), Họ tên.
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
                {importMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Tạo đề bài tập mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Tiêu đề bài tập:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Assignment 1: Java OOP Car Rental"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Ngôn ngữ lập trình:</label>
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
                <label className="font-medium text-slate-700 block mb-1">Hạn nộp (Deadline):</label>
                <input
                  type="datetime-local"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none"
                />
              </div>
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
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5"
              >
                {creatingAssignment ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                <span>{creatingAssignment ? 'Đang tạo...' : 'Tạo đề bài'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
