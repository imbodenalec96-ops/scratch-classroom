-- Migration: Add content column to assignments table (SQLite)
ALTER TABLE assignments ADD COLUMN content TEXT;
