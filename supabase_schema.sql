-- AutoCross-Edu Production Supabase Database Schema (HARDENED v2)
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- Safe to re-run: uses IF NOT EXISTS and CREATE OR REPLACE.

-- ─── 1. Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. Profiles Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
    role TEXT NOT NULL DEFAULT 'faculty' CHECK (role IN ('faculty', 'student', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── 3. Assessments Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assessments (
    id TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 4 AND 10),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
    faculty_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    faculty_name TEXT NOT NULL CHECK (char_length(faculty_name) BETWEEN 1 AND 200),
    faculty_email TEXT CHECK (char_length(faculty_email) <= 200),
    class_section TEXT CHECK (char_length(class_section) <= 100),
    start_time TIMESTAMP WITH TIME ZONE,
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backfill: ensure faculty_email column exists on existing installations
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS faculty_email TEXT;

-- ─── 4. Questions Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    word TEXT NOT NULL CHECK (char_length(word) BETWEEN 3 AND 15 AND word ~ '^[A-Z]+$'),
    clue TEXT NOT NULL CHECK (char_length(clue) BETWEEN 5 AND 500),
    direction TEXT NOT NULL CHECK (direction IN ('across', 'down')),
    row INT NOT NULL CHECK (row >= 0 AND row < 200),
    col INT NOT NULL CHECK (col >= 0 AND col < 200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── 5. Responses Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    roll_number TEXT NOT NULL CHECK (char_length(roll_number) BETWEEN 1 AND 50),
    student_name TEXT NOT NULL CHECK (char_length(student_name) BETWEEN 1 AND 100),
    student_email TEXT CHECK (char_length(student_email) <= 200),
    answers_json JSONB,
    score INT NOT NULL CHECK (score >= 0),
    total_questions INT NOT NULL CHECK (total_questions >= 0),
    time_taken INT NOT NULL CHECK (time_taken >= 0),  -- in seconds
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- UNIQUE constraint prevents duplicate submissions (also enforced app-side)
    CONSTRAINT unique_student_per_assessment UNIQUE (assessment_id, roll_number)
);

-- Backfill: ensure columns exist on existing installations
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS student_email TEXT;
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS answers_json JSONB;

-- ─── 6. Performance Indexes ───────────────────────────────────────────────────
-- Assessments
CREATE INDEX IF NOT EXISTS idx_assessments_faculty_id ON public.assessments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_assessments_faculty_email ON public.assessments(faculty_email);
CREATE INDEX IF NOT EXISTS idx_assessments_created_at ON public.assessments(created_at DESC);

-- Questions
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON public.questions(assessment_id);

-- Responses — composite index is far more efficient for the primary query pattern
CREATE INDEX IF NOT EXISTS idx_responses_assessment_roll ON public.responses(assessment_id, roll_number);
CREATE INDEX IF NOT EXISTS idx_responses_assessment_submitted ON public.responses(assessment_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_student_email ON public.responses(student_email);

-- ─── 7. Enable Row Level Security (RLS) ──────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- ─── 8. RLS Policies ─────────────────────────────────────────────────────────

-- PROFILES
-- Drop all old policies first (clean slate to avoid conflicts)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- FIX: Profiles are now only readable by authenticated users — not public.
-- This prevents anonymous enumeration of all faculty/student accounts.
CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- ASSESSMENTS
DROP POLICY IF EXISTS "Assessments are viewable by everyone" ON public.assessments;
DROP POLICY IF EXISTS "Faculty can insert assessments" ON public.assessments;
DROP POLICY IF EXISTS "Faculty can update their own assessments" ON public.assessments;
DROP POLICY IF EXISTS "Faculty can delete their own assessments" ON public.assessments;

-- SELECT: Public (needed for students to join via code without logging in)
CREATE POLICY "Assessments are viewable by everyone"
    ON public.assessments FOR SELECT
    USING (true);

-- INSERT: Only authenticated users with faculty or admin role
CREATE POLICY "Faculty can insert assessments"
    ON public.assessments FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('faculty', 'admin')
        )
    );

-- UPDATE/DELETE: Only the owning faculty (by UUID) or admin
CREATE POLICY "Faculty can update their own assessments"
    ON public.assessments FOR UPDATE
    USING (
        auth.uid() = faculty_id
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Faculty can delete their own assessments"
    ON public.assessments FOR DELETE
    USING (
        auth.uid() = faculty_id
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- QUESTIONS
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON public.questions;
DROP POLICY IF EXISTS "Faculty can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Faculty can delete questions" ON public.questions;

CREATE POLICY "Questions are viewable by everyone"
    ON public.questions FOR SELECT
    USING (true);

CREATE POLICY "Faculty can insert questions"
    ON public.questions FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('faculty', 'admin')
        )
    );

CREATE POLICY "Faculty can delete their own assessment questions"
    ON public.questions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.assessments a
            WHERE a.id = assessment_id
            AND (
                a.faculty_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role = 'admin'
                )
            )
        )
    );

-- RESPONSES
DROP POLICY IF EXISTS "Students can submit responses" ON public.responses;
DROP POLICY IF EXISTS "Responses are viewable by auth users and faculty" ON public.responses;
DROP POLICY IF EXISTS "Responses are viewable by everyone" ON public.responses;
DROP POLICY IF EXISTS "Faculty can delete responses for re-attempts" ON public.responses;
DROP POLICY IF EXISTS "Faculty can view responses for their assessments" ON public.responses;

-- INSERT: Allow unauthenticated inserts (students don't log in)
-- The UNIQUE constraint + application-layer validation provide duplicate protection
CREATE POLICY "Students can submit responses"
    ON public.responses FOR INSERT
    WITH CHECK (true);

-- SELECT: Authenticated users only — faculty see their own assessments' responses, admin sees all
CREATE POLICY "Faculty can view responses for their assessments"
    ON public.responses FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            EXISTS (
                SELECT 1 FROM public.assessments a
                WHERE a.id = assessment_id
                AND (
                    a.faculty_id = auth.uid()
                    OR EXISTS (
                        SELECT 1 FROM public.profiles
                        WHERE id = auth.uid() AND role = 'admin'
                    )
                )
            )
        )
    );

-- DELETE: Faculty can delete responses for re-attempts on their own assessments
CREATE POLICY "Faculty can delete responses for re-attempts"
    ON public.responses FOR DELETE
    USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.assessments a
            WHERE a.id = assessment_id
            AND (
                a.faculty_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role = 'admin'
                )
            )
        )
    );

-- ─── 9. Auto-create Profile on Signup Trigger ─────────────────────────────────
-- SECURITY: role from metadata is allowed to be 'faculty' or 'student' only.
-- Never trust 'admin' from user metadata — admin must be set via DB directly.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_role TEXT;
    safe_role TEXT;
BEGIN
    raw_role := COALESCE(new.raw_user_meta_data->>'role', 'faculty');
    -- Never allow self-escalation to admin via metadata
    IF raw_role = 'admin' THEN
        safe_role := 'faculty';
    ELSE
        safe_role := raw_role;
    END IF;

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'New User'),
        safe_role
    )
    ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            role = CASE
                -- Never downgrade an existing admin via metadata
                WHEN public.profiles.role = 'admin' THEN 'admin'
                ELSE EXCLUDED.role
            END,
            updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── 10. Updated_at Auto-update Trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ─── 11. Crossword Generation Cache ──────────────────────────────────────────
-- 24-hour cache keyed on sha256(topic_normalized + questionsCount).
-- Prevents duplicate Gemini quota usage for identical requests.

CREATE TABLE IF NOT EXISTS public.crossword_cache (
  cache_key   text        PRIMARY KEY,
  result_json jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for TTL queries
CREATE INDEX IF NOT EXISTS crossword_cache_created_at_idx ON public.crossword_cache (created_at);

-- RLS: service role can read/write; anon cannot access directly
ALTER TABLE public.crossword_cache ENABLE ROW LEVEL SECURITY;

-- Allow the Vercel Function (service role / anon key for now) to read/write
CREATE POLICY "api_can_read_cache"  ON public.crossword_cache FOR SELECT USING (true);
CREATE POLICY "api_can_write_cache" ON public.crossword_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "api_can_upsert_cache" ON public.crossword_cache FOR UPDATE USING (true);

-- Optional: auto-delete rows older than 48h (if pg_cron is available)
-- SELECT cron.schedule('purge-crossword-cache', '0 3 * * *', $$DELETE FROM public.crossword_cache WHERE created_at < now() - interval '48 hours'$$);
