import type { AssignmentItem, AssignmentFilterQuery } from "../contracts/assignment.contract.js";
import {
  classifyAssignmentDeadline,
  type AssignmentDeadlineStatus,
} from "../contracts/status.contract.js";

/**
 * Service providing deadline calculations and assignment filtering logic.
 * Satisfies Task 3 (Deadline blocking, N/A marking, Active vs Ended classification)
 * and Task 5 (Lecturer assignment queries filtered by one or more classes).
 */
export class DeadlineService {
  /**
   * Classify whether an assignment is ACTIVE or ENDED.
   */
  classify(deadline: string | Date, referenceDate: Date = new Date()): AssignmentDeadlineStatus {
    return classifyAssignmentDeadline(deadline, referenceDate);
  }

  /**
   * Check if a submission timestamp has exceeded the deadline.
   */
  isOverdue(submittedAt: string | Date, deadline: string | Date): boolean {
    const s = new Date(submittedAt).getTime();
    const d = new Date(deadline).getTime();
    if (isNaN(s) || isNaN(d)) {
      return false;
    }
    return s > d;
  }

  /**
   * Filter assignments by one or multiple class IDs.
   * If classIds is empty or not provided, returns all assignments.
   */
  filterByClassIds(assignments: AssignmentItem[], classIds?: string[]): AssignmentItem[] {
    if (!classIds || classIds.length === 0) {
      return assignments;
    }
    const set = new Set(classIds);
    return assignments.filter((a) => set.has(a.classId));
  }

  /**
   * Filter assignments by ACTIVE or ENDED deadline status.
   */
  filterByDeadlineStatus(
    assignments: AssignmentItem[],
    status?: "ACTIVE" | "ENDED" | "ALL",
    referenceDate: Date = new Date(),
  ): AssignmentItem[] {
    if (!status || status === "ALL") {
      return assignments;
    }
    return assignments.filter(
      (a) => this.classify(a.deadline, referenceDate) === status,
    );
  }

  /**
   * Apply full filter query on an assignment list.
   */
  applyFilter(
    assignments: AssignmentItem[],
    query: AssignmentFilterQuery,
    referenceDate: Date = new Date(),
  ): AssignmentItem[] {
    let result = [...assignments];

    // Filter by single classId or multiple classIds
    const classes = query.classIds ?? (query.classId ? [query.classId] : undefined);
    if (classes && classes.length > 0) {
      result = this.filterByClassIds(result, classes);
    }

    // Filter by deadline status
    if (query.status && query.status !== "ALL") {
      result = this.filterByDeadlineStatus(result, query.status, referenceDate);
    }

    // Search by title or description
    if (query.search && query.search.trim() !== "") {
      const q = query.search.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }

    return result;
  }

  /**
   * Given all students enrolled in a class and the set of students who made at least one submission,
   * identify students who have NOT submitted once the deadline is past (Task 3: N/A marking).
   */
  findUnsubmittedStudents(
    enrolledStudentIds: string[],
    submittedStudentIds: string[],
  ): string[] {
    const submittedSet = new Set(submittedStudentIds);
    return enrolledStudentIds.filter((studentId) => !submittedSet.has(studentId));
  }
}

export const deadlineService = new DeadlineService();
