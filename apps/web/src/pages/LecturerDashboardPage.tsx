import { useState } from 'react';
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
} from 'lucide-react';

interface PlagiarismSuspect {
  id: string;
  student1: string;
  student2: string;
  similarity: number;
  assignment: string;
  status: 'PENDING_REVIEW' | 'FLAGGED' | 'DISMISSED';
}

const mockSuspects: PlagiarismSuspect[] = [
  {
    id: 'plag-01',
    student1: 'SE180012 - Tran Van B',
    student2: 'SE180045 - Le Van C',
    similarity: 88.4,
    assignment: 'Assignment 1: Java Car Rental',
    status: 'FLAGGED',
  },
  {
    id: 'plag-02',
    student1: 'SE180023 - Pham Thi D',
    student2: 'SE180078 - Hoang Van E',
    similarity: 74.2,
    assignment: 'Assignment 1: Java Car Rental',
    status: 'PENDING_REVIEW',
  },
  {
    id: 'plag-03',
    student1: 'SE180005 - Doan Van F',
    student2: 'SE180099 - Vu Thi G',
    similarity: 41.0,
    assignment: 'Lab 3: Exception Sandbox',
    status: 'DISMISSED',
  },
];

export default function LecturerDashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('DASHBOARD');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      {/* Sidebar Navigation (SRS 6.7.4) */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between p-4 hidden md:flex shrink-0 shadow-sm">
        <div className="space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center font-bold text-white shadow-md shadow-orange-500/20">
              A
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">AITA-Intelligent</h1>
              <p className="text-[11px] text-slate-500">Lecturer Workspace</p>
            </div>
          </div>

          {/* Menu Items */}
          <nav className="space-y-1 text-xs font-medium">
            {[
              { id: 'DASHBOARD', label: 'Bảng tổng quan', icon: TrendingUp },
              { id: 'CREATE_ASSIGNMENT', label: 'Tạo bài tập (+ GenAI)', icon: PlusCircle },
              { id: 'IMPORT_STUDENTS', label: 'Nhập sinh viên (Excel)', icon: Upload },
              { id: 'GIT_ANALYTICS', label: 'Git Teamwork Analytics', icon: GitBranch },
              { id: 'APPEALS', label: 'Hộp thư phúc khảo', icon: MessageSquare, badge: '2' },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
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

        {/* User profile & Logout */}
        <div className="border-t border-slate-200 pt-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
              GV
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">TS. Le Giang Vien</p>
              <p className="text-[10px] text-slate-500">SE Department</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-semibold">
              Lớp: SE1801-SWP391
            </span>
            <span className="text-xs text-slate-500">Học kỳ: Fall 2026</span>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition"
          >
            <span>Chuyển sang xem góc nhìn Sinh viên</span>
            <ExternalLink size={12} />
          </button>
        </header>

        <div className="p-6 space-y-6 max-w-6xl w-full mx-auto">
          {/* 4 Stats Cards (SRS 6.7.4 - Top row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-medium">Tổng số sinh viên</span>
                <Users size={16} className="text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">42</p>
              <p className="text-[11px] text-emerald-600 mt-1">Đã đồng bộ từ Excel</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-medium">Bài nộp hôm nay</span>
                <FileText size={16} className="text-indigo-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">38 / 42</p>
              <p className="text-[11px] text-indigo-600 mt-1">Tỷ lệ nộp: 90.4%</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-medium">Điểm trung bình lớp</span>
                <TrendingUp size={16} className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">7.82</p>
              <p className="text-[11px] text-emerald-600 mt-1">+0.4 so với bài trước</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-medium">Đơn phúc khảo chờ duyệt</span>
                <AlertOctagon size={16} className="text-rose-600" />
              </div>
              <p className="text-2xl font-bold text-rose-600">2 đơn</p>
              <p className="text-[11px] text-slate-500 mt-1">Cần xử lý trước 24h</p>
            </div>
          </div>

          {/* Charts Row Mockup (SRS 6.7.4) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Phổ điểm */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                Phổ điểm Assignment 1 (Score Distribution)
              </h3>
              <div className="h-44 flex items-end gap-4 pt-6 px-2 border-b border-slate-200">
                {[
                  { range: '0-4', count: 2, height: '15%' },
                  { range: '4-6', count: 6, height: '35%' },
                  { range: '6-8', count: 18, height: '85%' },
                  { range: '8-9', count: 12, height: '65%' },
                  { range: '9-10', count: 4, height: '25%' },
                ].map((bar) => (
                  <div key={bar.range} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] text-slate-500">{bar.count}</span>
                    <div
                      style={{ height: bar.height }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-t-lg transition"
                    ></div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap mt-1">{bar.range}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tỷ lệ nộp bài */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Tỷ lệ nộp bài (Submission Rate)
              </h3>
              <div className="flex items-center justify-around py-4">
                <div className="w-28 h-28 rounded-full border-8 border-indigo-600 border-t-amber-400 border-r-rose-500 flex items-center justify-center">
                  <span className="text-xl font-extrabold text-slate-900">90%</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
                    <span className="text-slate-700">Đúng hạn: 36 SV (85.7%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                    <span className="text-slate-700">Nộp muộn: 2 SV (4.7%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                    <span className="text-slate-700">Chưa nộp: 4 SV (9.6%)</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 text-center">Hạn chót: 23:59 hôm nay</p>
            </div>
          </div>

          {/* Plagiarism Suspects Table (SRS 6.7.4 - Bottom) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertOctagon size={16} className="text-rose-600" />
                  <span>Top Nghi vấn Trùng lặp AST (Winnowing Similarity Table)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Các cặp bài nộp có cấu trúc cây cú pháp trùng khớp vượt ngưỡng cảnh báo (&gt;60%)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Cặp sinh viên nghi vấn</th>
                    <th className="py-3 px-3">Bài tập</th>
                    <th className="py-3 px-3 text-center">Tỷ lệ tương đồng AST</th>
                    <th className="py-3 px-3 text-center">Trạng thái</th>
                    <th className="py-3 px-3 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mockSuspects.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-slate-900">{item.student1}</div>
                        <div className="text-slate-500 text-[11px]">↔ {item.student2}</div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">{item.assignment}</td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`font-bold px-2 py-1 rounded-md ${
                            item.similarity >= 80
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : item.similarity >= 60
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {item.similarity}%
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="text-[11px] text-slate-500">{item.status}</span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          onClick={() => navigate('/submissions/sub-98721/results')}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-xs hover:underline"
                        >
                          <span>Đối chiếu cây AST</span>
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
