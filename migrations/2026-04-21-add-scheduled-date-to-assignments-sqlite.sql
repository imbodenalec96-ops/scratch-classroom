-- Migration: Add scheduled_date column to assignments table (SQLite)
ALTER TABLE assignments ADD COLUMN scheduled_date TEXT;
