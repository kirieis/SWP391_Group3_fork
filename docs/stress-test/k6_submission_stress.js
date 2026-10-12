/**
 * k6 Stress Test — AITA Intelligent Backend
 * Muc tieu (NFR-08): Xu ly 100 requests dong thoi trong 30 giay, 95th percentile < 500ms.
 * Muc tieu (NFR-09): Sau khi bat cache, P95 response time < 100ms cho GET /api/submissions/:id.
 *
 * Cach chay:
 *   k6 run docs/stress-test/k6_submission_stress.js
 *   hoac ket xuat HTML:
 *   k6 run --out json=docs/stress-test/results.json docs/stress-test/k6_submission_stress.js
 *
 * Yeu cau: k6 da duoc cai dat (https://k6.io/docs/get-started/installation/)
 *          Backend dang chay: npm run dev (http://localhost:5000)
 *          JWT_TOKEN: thay bang token hop le cua tai khoan LECTURER hoac STUDENT
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Custom Metrics
// ─────────────────────────────────────────────────────────────────────────────
const errorRate = new Rate("error_rate");
const submissionTrend = new Trend("submission_get_duration", true);
const dashboardTrend = new Trend("dashboard_get_duration", true);

// ─────────────────────────────────────────────────────────────────────────────
// Cau hinh tai (Load Profile)
// ─────────────────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Kich ban 1: Ramp up 100 VU trong 30 giay — kiem tra NFR-08
    ramp_stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 50 },   // Tang dan len 50 VU
        { duration: "20s", target: 100 },  // Dat dinh 100 VU dong thoi
        { duration: "10s", target: 0 },    // Ha tai ve 0
      ],
      gracefulRampDown: "5s",
    },

    // Kich ban 2: Constant load de do cache hit rate — kiem tra NFR-09
    cache_warm_check: {
      executor: "constant-vus",
      vus: 20,
      duration: "30s",
      startTime: "40s", // Bat dau sau khi cache da warm up
    },
  },

  thresholds: {
    // NFR-08: Xu ly 100 req dong thoi, 95th percentile < 500ms
    http_req_duration: ["p(95)<500"],
    // Ty le loi < 1%
    error_rate: ["rate<0.01"],
    // NFR-09 (cache): GET submission result < 100ms (sau warm-up)
    submission_get_duration: ["p(95)<100"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Config — Thay cac gia tri nay truoc khi chay
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const JWT_TOKEN = __ENV.JWT_TOKEN || "THAY_BANG_JWT_THAT";

// Thay bang submission_id va assignment_id co san trong DB
const SAMPLE_SUBMISSION_ID = __ENV.SUBMISSION_ID || "sample-submission-uuid-here";
const SAMPLE_CLASS_ID = __ENV.CLASS_ID || "sample-class-uuid-here";

const headers = {
  Authorization: `Bearer ${JWT_TOKEN}`,
  "Content-Type": "application/json",
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Test Function
// ─────────────────────────────────────────────────────────────────────────────
export default function () {
  // --- Test 1: GET /health (baseline — khong can auth)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health: status 200": (r) => r.status === 200,
    "health: ok": (r) => {
      try { return JSON.parse(r.body as string).status === "ok"; }
      catch { return false; }
    },
  });
  errorRate.add(healthRes.status !== 200);

  sleep(0.1);

  // --- Test 2: GET /api/submissions/:id (co cache) — do NFR-09
  const subRes = http.get(
    `${BASE_URL}/api/submissions/${SAMPLE_SUBMISSION_ID}`,
    { headers }
  );
  submissionTrend.add(subRes.timings.duration);
  check(subRes, {
    "submission: status 200 or 404": (r) => r.status === 200 || r.status === 404,
    "submission: response time < 500ms": (r) => r.timings.duration < 500,
  });
  errorRate.add(subRes.status >= 500);

  sleep(0.1);

  // --- Test 3: GET /api/dashboard (heavy aggregation — do hieu qua index)
  const dashRes = http.get(
    `${BASE_URL}/api/dashboard?classId=${SAMPLE_CLASS_ID}`,
    { headers }
  );
  dashboardTrend.add(dashRes.timings.duration);
  check(dashRes, {
    "dashboard: status 200 or 403": (r) => r.status === 200 || r.status === 403,
    "dashboard: response time < 500ms": (r) => r.timings.duration < 500,
  });
  errorRate.add(dashRes.status >= 500);

  sleep(0.2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary callback — In ket qua ra console voi dinh dang dep hon
// ─────────────────────────────────────────────────────────────────────────────
export function handleSummary(data: any) {
  const duration = data.metrics.http_req_duration;
  const errors = data.metrics.error_rate;

  console.log("=== AITA STRESS TEST SUMMARY ===");
  console.log(`Total Requests  : ${data.metrics.http_reqs?.values?.count ?? "N/A"}`);
  console.log(`Error Rate      : ${((errors?.values?.rate ?? 0) * 100).toFixed(2)}%`);
  console.log(`P50 Duration    : ${duration?.values?.["p(50)"]?.toFixed(2) ?? "N/A"} ms`);
  console.log(`P95 Duration    : ${duration?.values?.["p(95)"]?.toFixed(2) ?? "N/A"} ms`);
  console.log(`P99 Duration    : ${duration?.values?.["p(99)"]?.toFixed(2) ?? "N/A"} ms`);
  console.log("================================");

  // Xuat JSON de luu bao cao
  return {
    "docs/stress-test/results_summary.json": JSON.stringify(data, null, 2),
  };
}
