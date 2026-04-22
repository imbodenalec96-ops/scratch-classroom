-- Migration: Add hints_allowed column to assignments table
ALTER TABLE assignments ADD COLUMN hints_allowed INTEGER DEFAULT 1;