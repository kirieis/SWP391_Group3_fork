# AITA patch — grading results, Unicode, and AI assignment generation

## What changed

1. **AI feedback Vietnamese text**: changed SQL Server text columns that carry user/AI text from non-Unicode `TEXT` to `NVARCHAR(MAX)`. This affects AI feedback, assignment descriptions, test inputs/outputs, appeals, and score audit reasons.
2. **Real test-case state**: the Sandbox already returned per-test pass/fail, actual output, expected output, duration, and error. The queue worker now forwards those results, the API persists them as JSON, and the grading page displays a green PASS only for a true pass and a red FAIL for a failed test.
3. **AI assignment generation**: connected the lecturer form to the existing `POST /api/assignments/generate` endpoint. Generated content is a draft that the lecturer can review/edit before creating the assignment.
4. **Score display consistency**: the backend stores `totalScore` on a 0–10 scale; the grading result and appeal UI now use that scale instead of dividing the value by 10 again.

## Apply to an existing SQL Server database

1. Back up the database first.
2. Open `apps/api/prisma/migrations/20261014080000_unicode_text_and_test_results/migration.sql` in SQL Server Management Studio, select the AITA database, and execute it **once**. It copies legacy `TEXT` columns to Unicode columns and adds `submissions.test_results`.
3. Install project dependencies, then from `apps/api` run `npx prisma generate` so Prisma Client reflects the updated schema.
4. Configure local environment variables using the `.env.example` files. Use the **same** long random value for `INTERNAL_API_KEY` in the API and queue worker, and the corresponding internal keys in the Sandbox configuration. Add a real AI provider API key in `apps/api/.env.ai.example` / your local AI environment config.
5. Restart the API, queue worker, Sandbox, and web app.

The migration must not be run twice because it renames columns. Existing AI feedback whose accents have already been replaced by literal `?` characters cannot be reconstructed by changing the column type; re-run/regrade those AI reviews to produce new feedback. Per-test results will appear for new grading runs after the API/database changes are deployed.

## Verification notes

The modified TypeScript/TSX files passed a syntax transpilation check. A full Vite build and Prisma client regeneration could not be completed in this environment: the uploaded `node_modules` is incomplete (for example, it lacks Vite and React runtime packages), and the Linux Prisma engine download was unavailable. The patched source and SQL migration are included; regenerate Prisma Client and run the normal project build in the development environment before deployment.
