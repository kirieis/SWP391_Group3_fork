import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import GradingResultsPage from './pages/GradingResultsPage';
import LecturerDashboardPage from './pages/LecturerDashboardPage';
import PlagiarismPairPage from './pages/PlagiarismPairPage';
import RouteGuard from './components/RouteGuard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        
        {/* Phân hệ Sinh viên */}
        <Route
          path="/dashboard"
          element={
            <RouteGuard allowedRoles={['STUDENT']}>
              <StudentDashboardPage />
            </RouteGuard>
          }
        />
        
        {/* Xem kết quả bài nộp (Sinh viên chủ bài, hoặc Giảng viên/Admin) */}
        <Route
          path="/submissions/:id/results"
          element={
            <RouteGuard allowedRoles={['STUDENT', 'LECTURER', 'ADMIN']}>
              <GradingResultsPage />
            </RouteGuard>
          }
        />
        
        {/* Phân hệ Giảng viên */}
        <Route
          path="/lecturer/dashboard"
          element={
            <RouteGuard allowedRoles={['LECTURER', 'ADMIN']}>
              <LecturerDashboardPage />
            </RouteGuard>
          }
        />
        
        {/* So sánh cặp nghi vấn đạo văn (Chỉ Giảng viên / Admin) */}
        <Route
          path="/lecturer/plagiarism/:matchId"
          element={
            <RouteGuard allowedRoles={['LECTURER', 'ADMIN']}>
              <PlagiarismPairPage />
            </RouteGuard>
          }
        />
        
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
