-- Separate automatic and lecturer scores; total_score remains the official score.
IF COL_LENGTH('submissions', 'automatic_score') IS NULL
BEGIN
    ALTER TABLE [submissions] ADD [automatic_score] FLOAT NULL;
    UPDATE [submissions] SET [automatic_score] = [total_score] WHERE [total_score] IS NOT NULL;
END;
IF COL_LENGTH('submissions', 'manual_score') IS NULL
BEGIN
    ALTER TABLE [submissions] ADD [manual_score] FLOAT NULL;
END;
IF COL_LENGTH('test_cases', 'is_hidden') IS NULL
BEGIN
    ALTER TABLE [test_cases] ADD [is_hidden] BIT NOT NULL CONSTRAINT [DF_test_cases_is_hidden] DEFAULT (0);
END;
