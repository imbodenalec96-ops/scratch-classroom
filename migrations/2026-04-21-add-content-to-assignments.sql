-- Migration: Add content column to assignments table
ALTER TABLE assignments ADD COLUMN content TEXT;
