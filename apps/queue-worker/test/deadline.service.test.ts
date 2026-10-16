import { describe, it, expect } from "vitest";
import { deadlineService } from "../src/services/deadline.service.js";
import type { AssignmentItem } from "../src/contracts/assignment.contract.js";

describe("DeadlineService Unit Tests (Task 3 & Task 5)", () => {
  const sampleAssignments: AssignmentItem[] = [
    {
      id: "asg-1",
      classId: "class-A",
      title: "Binary Search Tree",
      description: "Implement insert, search, delete",
      language: "Java",
      deadline: "2026-10-20T00:00:00.000Z",
      testCasesCount: 5,
      submissionsCount: 10,
    },
    {
      id: "asg-2",
      classId: "class-B",
      title: "Sorting Algorithms",
      description: "QuickSort and MergeSort analysis",
      language: "Python",
      deadline: "2026-10-10T00:00:00.000Z",
      testCasesCount: 4,
      submissionsCount: 20,
    },
    {
      id: "asg-3",
      classId: "class-A",
      title: "Graph Traversal",
      description: "BFS and DFS implementation",
      language: "C#",
      deadline: "2026-10-25T00:00:00.000Z",
      testCasesCount: 6,
      submissionsCount: 0,
    },
  ];

  it("should classify assignment deadlines accurately (Task 3)", () => {
    const refDate = new Date("2026-10-15T00:00:00.000Z");

    expect(deadlineService.classify("2026-10-20T00:00:00.000Z", refDate)).toBe("ACTIVE");
    expect(deadlineService.classify("2026-10-10T00:00:00.000Z", refDate)).toBe("ENDED");
    expect(deadlineService.classify("invalid-date", refDate)).toBe("ACTIVE");
  });

  it("should identify overdue submissions (Task 3)", () => {
    const deadline = "2026-10-15T12:00:00.000Z";

    // Submitted before deadline -> Not overdue
    expect(deadlineService.isOverdue("2026-10-15T11:59:00.000Z", deadline)).toBe(false);

    // Submitted after deadline -> Overdue
    expect(deadlineService.isOverdue("2026-10-15T12:01:00.000Z", deadline)).toBe(true);

    // Invalid dates -> false
    expect(deadlineService.isOverdue("invalid", deadline)).toBe(false);
  });

  it("should filter assignments by a single class ID (Task 5)", () => {
    const filtered = deadlineService.filterByClassIds(sampleAssignments, ["class-B"]);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("asg-2");
  });

  it("should filter assignments by multiple class IDs (Task 5)", () => {
    const filtered = deadlineService.filterByClassIds(sampleAssignments, ["class-A", "class-B"]);
    expect(filtered.length).toBe(3);

    const empty = deadlineService.filterByClassIds(sampleAssignments, []);
    expect(empty.length).toBe(3);
  });

  it("should filter assignments by ACTIVE and ENDED status for lecturer dashboard (Task 3)", () => {
    const refDate = new Date("2026-10-15T00:00:00.000Z");

    const active = deadlineService.filterByDeadlineStatus(sampleAssignments, "ACTIVE", refDate);
    expect(active.length).toBe(2);
    expect(active.map((a) => a.id)).toEqual(["asg-1", "asg-3"]);

    const ended = deadlineService.filterByDeadlineStatus(sampleAssignments, "ENDED", refDate);
    expect(ended.length).toBe(1);
    expect(ended[0].id).toBe("asg-2");
  });

  it("should apply combined filters (class, status, search) (Task 5)", () => {
    const refDate = new Date("2026-10-15T00:00:00.000Z");

    const result = deadlineService.applyFilter(
      sampleAssignments,
      {
        classIds: ["class-A"],
        status: "ACTIVE",
        search: "graph",
      },
      refDate,
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("asg-3");
  });

  it("should identify unsubmitted students for N/A marking (Task 3)", () => {
    const enrolled = ["std-1", "std-2", "std-3", "std-4"];
    const submitted = ["std-1", "std-3"];

    const unsubmitted = deadlineService.findUnsubmittedStudents(enrolled, submitted);
    expect(unsubmitted).toEqual(["std-2", "std-4"]);
  });


  it("should cover all branches in applyFilter and deadline status helpers", () => {
    const refDate = new Date("2026-10-15T00:00:00.000Z");

    // Test query with single classId and status ALL
    const r1 = deadlineService.applyFilter(
      sampleAssignments,
      { classId: "class-B", status: "ALL" },
      refDate,
    );
    expect(r1.length).toBe(1);
    expect(r1[0].id).toBe("asg-2");

    // Test filterByDeadlineStatus with ALL or undefined
    expect(deadlineService.filterByDeadlineStatus(sampleAssignments, "ALL").length).toBe(3);
    expect(deadlineService.filterByDeadlineStatus(sampleAssignments, undefined).length).toBe(3);

    // Test search matching description
    const r2 = deadlineService.applyFilter(
      sampleAssignments,
      { search: "mergesort" },
      refDate,
    );
    expect(r2.length).toBe(1);
    expect(r2[0].id).toBe("asg-2");

    // Test empty search
    const r3 = deadlineService.applyFilter(
      sampleAssignments,
      { search: "   " },
      refDate,
    );
    expect(r3.length).toBe(3);

    // Test isOverdue edge cases
    expect(deadlineService.isOverdue("invalid", "2026-10-20T00:00:00.000Z")).toBe(false);
    expect(deadlineService.isOverdue("2026-10-20T00:00:00.000Z", "invalid")).toBe(false);
  });
});

