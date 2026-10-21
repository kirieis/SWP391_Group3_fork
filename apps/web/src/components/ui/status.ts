// Bảng phân loại tone và ánh xạ trạng thái cho StatusBadge
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

// Bảng ánh xạ từ giá trị trạng thái nghiệp vụ sang tone giao diện Calm academic-tech
export function resolveStatusTone(status?: string): StatusTone {
  if (!status) return 'neutral';
  const s = status.toUpperCase().trim();

  if (
    s === 'PASS' ||
    s === 'PASSED' ||
    s === 'GRADED' ||
    s === 'SAFE' ||
    s === 'DONE' ||
    s === 'COMPLETE' ||
    s === 'COMPLETED' ||
    s === 'PUBLISHED' ||
    s === 'APPROVED' ||
    s === 'RESOLVED'
  ) {
    return 'success';
  }

  if (
    s === 'WARNING' ||
    s === 'CHECKING' ||
    s === 'PENDING' ||
    s === 'RUNNING' ||
    s === 'RUNNING_TESTS' ||
    s === 'QUEUED' ||
    s === 'SCORE_WITHHELD' ||
    s === 'AWAITING_REVIEW' ||
    s === 'AWAITING LECTURER REVIEW' ||
    s === 'NEEDS_REVIEW' ||
    s === 'AI_REVIEW_PENDING'
  ) {
    return 'warning';
  }

  if (
    s === 'DANGER' ||
    s === 'FAILED' ||
    s === 'FAIL' ||
    s === 'COMPILATION_ERROR' ||
    s === 'TIMEOUT' ||
    s === 'SECURITY_VIOLATION' ||
    s === 'SYNTAX CHECK FAILED' ||
    s === 'REJECTED'
  ) {
    return 'danger';
  }

  return 'neutral';
}
