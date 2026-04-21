-- Migration: Add target_subject column to assignments table
ALTER TABLE assignments ADD COLUMN target_subject TEXT;
