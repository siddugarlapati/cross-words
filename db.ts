import { supabase } from './supabaseClient';
import { Assessment, Question, Response } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random 6-character uppercase assessment ID.
 * Uses only unambiguous characters (no O, 0, 1, I).
 * Retries up to 5 times to handle unlikely collisions.
 */
async function generateUniqueAssessmentId(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const randomBytes = new Uint8Array(6);
    crypto.getRandomValues(randomBytes);
    const id = Array.from(randomBytes)
      .map(b => chars[b % chars.length])
      .join('');

    const { data, error } = await supabase
      .from('assessments')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return id;
  }

  throw new Error('Failed to generate unique assessment ID after 5 attempts. Please try again.');
}

// ─── Database API ─────────────────────────────────────────────────────────────

export const db = {
  async createAssessment(
    assessment: Omit<Assessment, 'id' | 'created_at'>,
    questions: Omit<Question, 'id' | 'assessment_id'>[]
  ): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('You must be logged in to create an assessment.');

    const id = await generateUniqueAssessmentId();

    const { error: aError } = await supabase.from('assessments').insert({
      id,
      title: assessment.title.trim().slice(0, 200),
      subject: assessment.subject.trim().slice(0, 200),
      faculty_id: user.id,
      faculty_name: (assessment.faculty_name || '').trim().slice(0, 200),
      faculty_email: assessment.faculty_email || user.email || null,
      deadline: assessment.deadline || null,
      class_section: (assessment.class_section || '').trim().slice(0, 100),
      start_time: assessment.start_time || null
    });
    if (aError) throw aError;

    if (questions.length > 0) {
      const questionsData = questions.map(q => ({
        assessment_id: id,
        word: q.word.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 15),
        clue: q.clue.trim().slice(0, 500),
        direction: q.direction,
        row: Math.max(0, q.row),
        col: Math.max(0, q.col)
      }));
      const { error: qError } = await supabase.from('questions').insert(questionsData);
      if (qError) throw qError;
    }

    return id;
  },

  async getAssessment(id: string): Promise<{ assessment: Assessment; questions: Question[] } | null> {
    const code = id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (code.length < 4) return null;

    const [assessmentRes, questionsRes] = await Promise.all([
      supabase.from('assessments').select('*').eq('id', code).maybeSingle(),
      supabase.from('questions').select('*').eq('assessment_id', code).order('id')
    ]);

    if (assessmentRes.error || !assessmentRes.data) return null;
    if (questionsRes.error) return null;

    const a = assessmentRes.data;
    return {
      assessment: {
        id: a.id,
        title: a.title,
        subject: a.subject,
        faculty_name: a.faculty_name,
        faculty_email: a.faculty_email ?? '',
        deadline: a.deadline ?? '',
        class_section: a.class_section ?? '',
        created_at: a.created_at,
        start_time: a.start_time
      },
      questions: questionsRes.data || []
    };
  },

  async getAssessmentsByFaculty(_facultyName: string): Promise<Assessment[]> {
    const { data: { user } } = await supabase.auth.getUser();

    // SECURITY: Always filter strictly by faculty_id (UUID) which is server-validated.
    // Never build OR filters with user-controlled strings — that risks exposing other
    // faculty's assessments via filter manipulation.
    if (!user?.id) return [];

    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('faculty_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async submitResponse(response: Omit<Response, 'id' | 'submitted_at'>): Promise<string> {
    const code = response.assessment_id.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rollNo = response.roll_number.trim().toUpperCase().slice(0, 50);

    if (!code || !rollNo) {
      throw new Error('Invalid assessment ID or roll number.');
    }

    // FIXED: Removed TOCTOU (check-then-insert) race condition.
    // Insert directly and let the UNIQUE constraint handle duplicates — this is atomic.
    // Note: no .select() — RLS grants anon INSERT but not SELECT on responses, so
    // RETURNING would fail. The caller does not use the returned id.
    const { error } = await supabase
      .from('responses')
      .insert({
        assessment_id: code,
        roll_number: rollNo,
        student_name: (response.student_name || 'Student').trim().slice(0, 100),
        student_email: response.student_email?.trim().slice(0, 200) || null,
        answers_json: response.answers_json || null,
        score: Math.max(0, response.score),
        total_questions: Math.max(0, response.total_questions),
        time_taken: Math.max(0, response.time_taken)
      });

    if (error) {
      // Handle unique constraint violation — student already submitted
      if (error.code === '23505' || error.message?.includes('unique_student_per_assessment')) {
        throw new Error('You have already submitted this assessment.');
      }
      throw error;
    }

    return code;
  },

  async getResponses(assessmentId: string): Promise<Response[]> {
    const code = assessmentId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const { data, error } = await supabase
      .from('responses')
      .select('*')
      .eq('assessment_id', code)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async allowReattempt(assessmentId: string, rollNumber: string): Promise<void> {
    const code = assessmentId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rollNo = rollNumber.trim().toUpperCase().slice(0, 50);

    const { error } = await supabase
      .from('responses')
      .delete()
      .eq('assessment_id', code)
      .eq('roll_number', rollNo);

    if (error) throw error;
  },

  async hasStudentSubmitted(assessmentId: string, rollNumber: string): Promise<boolean> {
    const code = assessmentId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rollNo = rollNumber.trim().toUpperCase().slice(0, 50);

    const { data, error } = await supabase
      .from('responses')
      .select('id')
      .eq('assessment_id', code)
      .eq('roll_number', rollNo)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  async getAllAssessments(): Promise<Assessment[]> {
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAllResponses(): Promise<Response[]> {
    const { data, error } = await supabase
      .from('responses')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    return data || [];
  },

  async getAllProfiles(): Promise<any[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at');
    if (error) throw error;
    return data || [];
  },

  async getStudentResponses(email: string): Promise<Response[]> {
    const target = email.trim().toLowerCase().slice(0, 200);
    if (!target || !target.includes('@')) return [];

    const { data, error } = await supabase
      .from('responses')
      .select('*')
      .ilike('student_email', target)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
