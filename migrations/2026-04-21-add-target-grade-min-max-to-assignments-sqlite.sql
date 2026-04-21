-- Migration: Add target_grade_min and target_grade_max columns to assignments table (SQLite)
ALTER TABLE assignments ADD COLUMN target_grade_min INTEGER;
ALTER TABLE assignments ADD COLUMN target_grade_max INTEGER;
