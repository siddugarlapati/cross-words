-- AutoCross-Edu Production Supabase Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'faculty' CHECK (role IN ('faculty', 'student', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Assessments Table
CREATE TABLE IF NOT EXISTS public.assessments (
    id TEXT PRIMARY KEY, -- 6 character code (e.g. 'X7K2P9')
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    faculty_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    faculty_name TEXT NOT NULL,
    class_section TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    clue TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('across', 'down')),
    row INT NOT NULL,
    col INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create Responses Table
CREATE TABLE IF NOT EXISTS public.responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    roll_number TEXT NOT NULL,
    student_name TEXT NOT NULL,
    score INT NOT NULL,
    total_questions INT NOT NULL,
    time_taken INT NOT NULL, -- in seconds
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_student_per_assessment UNIQUE (assessment_id, roll_number)
);

-- 6. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_assessments_faculty ON public.assessments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON public.questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_responses_assessment ON public.responses(assessment_id);
CREATE INDEX IF NOT EXISTS idx_responses_roll ON public.responses(roll_number);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies

-- Profiles: Users can view all profiles, but only edit their own
CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Assessments: Everyone can view assessments (needed for students solving with code)
CREATE POLICY "Assessments are viewable by everyone" 
    ON public.assessments FOR SELECT USING (true);

CREATE POLICY "Faculty can insert assessments" 
    ON public.assessments FOR INSERT WITH CHECK (auth.uid() = faculty_id);

CREATE POLICY "Faculty can update their own assessments" 
    ON public.assessments FOR UPDATE USING (auth.uid() = faculty_id);

CREATE POLICY "Faculty can delete their own assessments" 
    ON public.assessments FOR DELETE USING (auth.uid() = faculty_id);

-- Questions: Everyone can view questions for an assessment
CREATE POLICY "Questions are viewable by everyone" 
    ON public.questions FOR SELECT USING (true);

CREATE POLICY "Faculty can insert questions" 
    ON public.questions FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.assessments 
            WHERE assessments.id = questions.assessment_id 
            AND assessments.faculty_id = auth.uid()
        )
    );

-- Responses: Students can insert responses; Faculty can view responses for their assessments
CREATE POLICY "Students can submit responses" 
    ON public.responses FOR INSERT WITH CHECK (true);

CREATE POLICY "Faculty can view responses for their assessments" 
    ON public.responses FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.assessments 
            WHERE assessments.id = responses.assessment_id 
            AND assessments.faculty_id = auth.uid()
        )
    );

CREATE POLICY "Faculty can delete responses for re-attempts" 
    ON public.responses FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.assessments 
            WHERE assessments.id = responses.assessment_id 
            AND assessments.faculty_id = auth.uid()
        )
    );

-- 9. Automatically create profile on auth signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE(new.raw_user_meta_data->>'role', 'faculty')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
