-- Add optional lecturer feedback to each score audit entry.
-- Nullable so manual regrading remains valid when no comment is provided.
IF COL_LENGTH('score_audit_logs', 'comment') IS NULL
BEGIN
    ALTER TABLE [score_audit_logs]
    ADD [comment] NVARCHAR(MAX) NULL;
END;
