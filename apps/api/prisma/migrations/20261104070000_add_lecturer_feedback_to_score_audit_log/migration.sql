-- Store an optional lecturer comment for each manual grading event.
IF COL_LENGTH('score_audit_logs', 'comment') IS NULL
BEGIN
    ALTER TABLE [score_audit_logs] ADD [comment] NVARCHAR(MAX) NULL;
END;
