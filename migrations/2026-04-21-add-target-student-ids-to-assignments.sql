-- Migration: Add target_student_ids column to assignments table
ALTER TABLE assignments ADD COLUMN target_student_ids TEXT;