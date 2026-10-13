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
} from 'lucide-react';
import { apiRequest } from '../services/api';

interface AssignmentItem {
  id: string;
  title: string;
  classCode: string;
  language: string;
  deadline: string;
  status: 'NOT_SUBMITTED' | 'PENDING' | 'DONE' | 'SCORE_WITHHELD' | 'FAILED' | 'GRADED';
  score?: number;
  latestSubmissionId?: string;
  astCheckStatus?: string;
}

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ fullName?: string; email?: string } | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Modal nộp bài
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Tải thông tin người dùng từ LocalStorage
  useEffect(() => {
    const rawUser = localStorage.getItem('aita_user');
    if (rawUser) {
      try {
        setUser(JSON.parse(rawUser));
      } catch {
        setUser(null);
      }
    }
    loadAssignments();
  }, []);

  // 2. Tải danh sách bài tập từ Backend
  const loadAssignments = async () => {
    setLoading(true);
    const res = await apiRequest<any[]>('/assignments');
    if (res.success && res.data && res.data.length > 0) {
      const mapped = res.data.map((item) => {
        const latestSub = item.submissions?.[0];
        let status: AssignmentItem['status'] = 'NOT_SUBMITTED';
        let score = undefined;
        let latestSubmissionId = undefined;

        if (latestSub) {
          latestSubmissionId = latestSub.id;
          score = latestSub.totalScore;
          if (latestSub.status === 'SCORE_WITHHELD') {
            status = 'SCORE_WITHHELD';
          } else if (latestSub.astCheckStatus === 'DONE' && latestSub.totalScore !== null && latestSub.totalScore !== undefined) {
            status = 'GRADED';
          } else if (latestSub.astCheckStatus === 'FAILED') {
            status = 'FAILED';
          } else {
            status = 'PENDING';
          }
        }

        return {
          id: item.id,
          title: item.title,
          classCode: item.class?.classCode || 'LỚP CHUNG',
          language: item.language || 'Java',
          deadline: new Date(item.deadline).toLocaleString('vi-VN'),
          status,
          score,
          latestSubmissionId,
          astCheckStatus: latestSub?.astCheckStatus,
        };
      });
      setAssignments(mapped);
    } else {
      // Fallback mockup nếu chưa có bài tập nào trong CSDL để người dùng vẫn thấy giao diện
      setAssignments([
        {
          id: 'asg-01',
          title: 'Assignment 1: Java OOP Car Rental Management',
          classCode: 'SE1801-SWP391',
          language: 'Java',
          deadline: '2026-09-20 23:59',
          status: 'GRADED',
          score: 85,
        },
        {
          id: 'asg-02',
          title: 'Assignment 2: Binary Search Tree & Graph Traversal',
          classCode: 'SE1801-SWP391',
          language: 'Java',
          deadline: '2026-09-25 23:59',
          status: 'PENDING',
        },
      ]);
    }
    setLoading(false);
  };

  // 3. Xử lý nộp bài tập (.zip)
  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !fileToUpload) {
      setUploadError('Vui lòng chọn file .zip bài nộp.');
      return;
    }

    if (!fileToUpload.name.toLowerCase().endsWith('.zip')) {
      setUploadError('Hệ thống chỉ chấp nhận file định dạng .zip.');
      return;
    }

    if (fileToUpload.size > 10 * 1024 * 1024) {
      setUploadError('Dung lượng file vượt quá giới hạn cho phép (10MB).');
      return;
    }

    setSubmitting(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('assignmentId', selectedAssignment.id);
    formData.append('file', fileToUpload);

    const res = await apiRequest<{ submissionId: string }>('/submissions', {
      method: 'POST',
      body: formData,
    });

    setSubmitting(false);

    if (res.success && res.data?.submissionId) {
      setSelectedAssignment(null);
      setFileToUpload(null);
      // Chuyển hướng ngay sang màn hình kết quả thời gian thực
      navigate(`/submissions/${res.data.submissionId}/results`);
    } else {
      setUploadError(res.message || 'Nộp bài thất bại. Vui lòng thử lại.');
    }
  };

  const filteredAssignments = assignments.filter((item) => {
    const matchStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'NOT_SUBMITTED' && item.status === 'NOT_SUBMITTED') ||
      (filterStatus === 'PENDING' && (item.status === 'PENDING' || item.status === 'SCORE_WITHHELD')) ||
      (filterStatus === 'GRADED' && item.status === 'GRADED');
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
            <p className="text-xs font-semibold text-slate-800">{user?.fullName || 'Sinh viên'}</p>
            <p className="text-[11px] text-slate-500">{user?.email || '@fpt.edu.vn'}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shadow-sm">
            {user?.fullName?.charAt(0) || 'SV'}
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('aita_token');
              localStorage.removeItem('aita_user');
              navigate('/login');
            }}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
            title="Đăng xuất"
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
              <p className="text-xs font-medium text-slate-500">Tổng số bài tập</p>
              <p className="text-2xl font-bold text-slate-900">{assignments.length} bài</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Đã nộp bài</p>
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
              <p className="text-xs font-medium text-slate-500">Trạng thái hệ thống</p>
              <p className="text-sm font-bold text-amber-600 mt-1">Sẵn sàng chấm tự động</p>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Tìm kiếm bài tập, mã lớp..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'NOT_SUBMITTED', label: 'Chưa nộp' },
              { id: 'PENDING', label: 'Đang chấm / Chờ duyệt' },
              { id: 'GRADED', label: 'Đã có điểm' },
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

        {/* Assignment Cards List */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-indigo-600" />
            <span>Đang tải danh sách bài tập từ máy chủ...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAssignments.map((assignment) => (
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
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Clock size={14} className="text-slate-400" />
                    Hạn nộp: <span className="text-slate-700 font-medium">{assignment.deadline}</span>
                  </p>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-4 self-end md:self-center">
                  {assignment.status === 'GRADED' && (
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Kết quả</span>
                      <span className="text-xl font-bold text-emerald-600">
                        {assignment.score}
                        <span className="text-xs text-slate-400 font-normal"> / 100</span>
                      </span>
                    </div>
                  )}

                  {assignment.status === 'PENDING' && (
                    <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs rounded-full font-medium">
                      Đang phân tích AST...
                    </span>
                  )}

                  {assignment.status === 'SCORE_WITHHELD' && (
                    <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs rounded-full font-medium">
                      Tạm giữ điểm (Nghi ngờ đạo văn)
                    </span>
                  )}

                  {assignment.status === 'FAILED' && (
                    <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs rounded-full font-medium">
                      Lỗi kiểm tra cú pháp
                    </span>
                  )}

                  {assignment.status === 'NOT_SUBMITTED' && (
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
                      Chưa nộp
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    {/* Nút Nộp bài thật */}
                    <button
                      onClick={() => {
                        setSelectedAssignment(assignment);
                        setFileToUpload(null);
                        setUploadError('');
                      }}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                    >
                      <UploadCloud size={14} />
                      <span>{assignment.latestSubmissionId ? 'Nộp lại bài' : 'Nộp bài (.zip)'}</span>
                    </button>

                    {/* Nút Xem kết quả */}
                    {assignment.latestSubmissionId && (
                      <button
                        onClick={() => navigate(`/submissions/${assignment.latestSubmissionId}/results`)}
                        className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs px-3 py-2.5 rounded-xl transition"
                        title="Xem kết quả chi tiết"
                      >
                        <span>Chi tiết</span>
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Nộp bài Upload (.zip) Thật */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Nộp bài tập trực tuyến</h3>
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
                      {(fileToUpload.size / (1024 * 1024)).toFixed(2)} MB • Sẵn sàng tải lên
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Nhấn vào đây để chọn file bài nộp <span className="text-indigo-600">.zip</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Giới hạn dung lượng tối đa: 10MB • Nén toàn bộ file mã nguồn Java
                    </p>
                  </div>
                )}
              </div>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSelectedAssignment(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={submitting || !fileToUpload}
                onClick={handleSubmitAssignment}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Đang tải lên & tiếp nhận...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} />
                    <span>Xác nhận Nộp bài</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
