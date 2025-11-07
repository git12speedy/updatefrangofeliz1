-- Add is_completed field to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE NOT NULL;
