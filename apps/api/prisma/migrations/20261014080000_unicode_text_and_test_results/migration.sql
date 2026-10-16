-- Preserve Vietnamese/Unicode text in user- and AI-generated content.
-- Legacy SQL Server TEXT is non-Unicode, so copy into NVARCHAR(MAX) before dropping it.

ALTER TABLE [dbo].[assignments] ADD [description_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[assignments] SET [description_unicode_tmp] = CONVERT(NVARCHAR(MAX), [description]);
ALTER TABLE [dbo].[assignments] DROP COLUMN [description];
EXEC sp_rename N'dbo.assignments.description_unicode_tmp', N'description', N'COLUMN';

ALTER TABLE [dbo].[test_cases] ADD [input_data_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[test_cases] SET [input_data_unicode_tmp] = CONVERT(NVARCHAR(MAX), [input_data]);
ALTER TABLE [dbo].[test_cases] DROP COLUMN [input_data];
EXEC sp_rename N'dbo.test_cases.input_data_unicode_tmp', N'input_data', N'COLUMN';

ALTER TABLE [dbo].[test_cases] ADD [expected_output_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[test_cases] SET [expected_output_unicode_tmp] = CONVERT(NVARCHAR(MAX), [expected_output]);
ALTER TABLE [dbo].[test_cases] DROP COLUMN [expected_output];
EXEC sp_rename N'dbo.test_cases.expected_output_unicode_tmp', N'expected_output', N'COLUMN';

ALTER TABLE [dbo].[submissions] ADD [ai_feedback_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[submissions] SET [ai_feedback_unicode_tmp] = CONVERT(NVARCHAR(MAX), [ai_feedback]);
ALTER TABLE [dbo].[submissions] DROP COLUMN [ai_feedback];
EXEC sp_rename N'dbo.submissions.ai_feedback_unicode_tmp', N'ai_feedback', N'COLUMN';

ALTER TABLE [dbo].[appeals] ADD [reason_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[appeals] SET [reason_unicode_tmp] = CONVERT(NVARCHAR(MAX), [reason]);
ALTER TABLE [dbo].[appeals] ALTER COLUMN [reason_unicode_tmp] NVARCHAR(MAX) NOT NULL;
ALTER TABLE [dbo].[appeals] DROP COLUMN [reason];
EXEC sp_rename N'dbo.appeals.reason_unicode_tmp', N'reason', N'COLUMN';

ALTER TABLE [dbo].[appeals] ADD [lecturer_response_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[appeals] SET [lecturer_response_unicode_tmp] = CONVERT(NVARCHAR(MAX), [lecturer_response]);
ALTER TABLE [dbo].[appeals] DROP COLUMN [lecturer_response];
EXEC sp_rename N'dbo.appeals.lecturer_response_unicode_tmp', N'lecturer_response', N'COLUMN';

ALTER TABLE [dbo].[score_audit_logs] ADD [reason_unicode_tmp] NVARCHAR(MAX) NULL;
UPDATE [dbo].[score_audit_logs] SET [reason_unicode_tmp] = CONVERT(NVARCHAR(MAX), [reason]);
ALTER TABLE [dbo].[score_audit_logs] ALTER COLUMN [reason_unicode_tmp] NVARCHAR(MAX) NOT NULL;
ALTER TABLE [dbo].[score_audit_logs] DROP COLUMN [reason];
EXEC sp_rename N'dbo.score_audit_logs.reason_unicode_tmp', N'reason', N'COLUMN';

IF COL_LENGTH('dbo.submissions', 'test_results') IS NULL
BEGIN
    ALTER TABLE [dbo].[submissions] ADD [test_results] NVARCHAR(MAX) NULL;
END;
