import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckCircle, Clock, Search, LogOut, FileCode, ArrowRight } from 'lucide-react';

interface AssignmentItem {
  id: string;
  title: string;
  classCode: string;
  language: string;
  deadline: string;
  status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'GRADED';
  score?: number;
}

const mockAssignments: AssignmentItem[] = [
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
    status: 'SUBMITTED',
  },
  {
    id: 'asg-03',
    title: 'Lab 3: Exception Handling & File I/O Sandbox Test',
    classCode: 'SE1802-PRO192',
    language: 'Java',
    deadline: '2026-09-30 23:59',
    status: 'NOT_SUBMITTED',
  },
];

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const filteredAssignments = mockAssignments.filter((item) => {
    const matchStatus = filterStatus === 'ALL' || item.status === filterStatus;
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
            <p className="text-xs font-semibold text-slate-800">Nguyen Van A</p>
            <p className="text-[11px] text-slate-500">SE180001 • @fpt.edu.vn</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shadow-sm">
            NA
          </div>
          <button
            onClick={() => navigate('/login')}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Quick Stats Bar (SRS 6.7.2) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng số bài tập</p>
              <p className="text-2xl font-bold text-slate-900">3 bài</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Đã hoàn thành / nộp</p>
              <p className="text-2xl font-bold text-emerald-600">2 / 3</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Điểm trung bình</p>
              <p className="text-2xl font-bold text-amber-600">8.5 / 10</p>
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
            {['ALL', 'NOT_SUBMITTED', 'SUBMITTED', 'GRADED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                  filterStatus === st
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'ALL' && 'Tất cả'}
                {st === 'NOT_SUBMITTED' && 'Chưa nộp'}
                {st === 'SUBMITTED' && 'Đang chấm'}
                {st === 'GRADED' && 'Đã có điểm'}
              </button>
            ))}
          </div>
        </div>

        {/* Assignment Cards List */}
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

                {assignment.status === 'SUBMITTED' && (
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs rounded-full font-medium">
                    Đang chấm...
                  </span>
                )}

                {assignment.status === 'NOT_SUBMITTED' && (
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
                    Chưa nộp
                  </span>
                )}

                <button
                  onClick={() => navigate(`/submissions/${assignment.id}/results`)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                >
                  <span>{assignment.status === 'GRADED' ? 'Xem kết quả' : 'Chi tiết / Nộp bài'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
