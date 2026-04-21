-- Migration: Add scheduled_date column to assignments table
ALTER TABLE assignments ADD COLUMN scheduled_date TEXT;
