import { supabase } from './supabaseClient';
import { Assessment, Question, Response } from './types';

export const db = {
  async createAssessment(
    assessment: Omit<Assessment, 'id' | 'created_at'>,
    questions: Omit<Question, 'id' | 'assessment_id'>[]
  ): Promise<string> {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 character code
    const { data: { user } } = await supabase.auth.getUser();

    const { error: aError } = await supabase.from('assessments').insert({
      id,
      title: assessment.title,
      subject: assessment.subject,
      faculty_id: user?.id ?? null,
      faculty_name: assessment.faculty_name,
      faculty_email: assessment.faculty_email || user?.email || null,
      deadline: assessment.deadline || null,
      class_section: assessment.class_section,
      start_time: assessment.start_time || null
    });
    if (aError) throw aError;

    const questionsData = questions.map(q => ({
      assessment_id: id,
      word: q.word.toUpperCase(),
      clue: q.clue,
      direction: q.direction,
      row: q.row,
      col: q.col
    }));
    const { error: qError } = await supabase.from('questions').insert(questionsData);
    if (qError) throw qError;

    return id;
  },

  async getAssessment(id: string): Promise<{ assessment: Assessment; questions: Question[] } | null> {
    const code = id.toUpperCase();

    const { data: assessment, error: aError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', code)
      .maybeSingle();

    if (aError || !assessment) return null;

    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('assessment_id', code);

    if (qError) return null;

    return {
      assessment: {
        id: assessment.id,
        title: assessment.title,
        subject: assessment.subject,
        faculty_name: assessment.faculty_name,
        faculty_email: assessment.faculty_email ?? '',
        deadline: assessment.deadline ?? '',
        class_section: assessment.class_section ?? '',
        created_at: assessment.created_at,
        start_time: assessment.start_time
      },
      questions: questions || []
    };
  },

  async getAssessmentsByFaculty(facultyName: string): Promise<Assessment[]> {
    const { data: { user } } = await supabase.auth.getUser();

    const cleanName = (facultyName || '').trim();
    let data: any[] | null = null;
    let error: any = null;

    if (user?.id) {
      const filterStr = user.email
        ? (cleanName ? `faculty_id.eq.${user.id},faculty_email.eq.${user.email},faculty_name.ilike.%${cleanName}%` : `faculty_id.eq.${user.id},faculty_email.eq.${user.email}`)
        : (cleanName ? `faculty_id.eq.${user.id},faculty_name.ilike.%${cleanName}%` : `faculty_id.eq.${user.id}`);

      const res = await supabase.from('assessments').select('*').or(filterStr).order('created_at', { ascending: false });
      data = res.data;
      error = res.error;

      if (error) {
        const fbRes = await supabase.from('assessments').select('*').eq('faculty_id', user.id).order('created_at', { ascending: false });
        data = fbRes.data;
        error = fbRes.error;
      }
    } else if (cleanName.length > 0) {
      const res = await supabase.from('assessments').select('*').ilike('faculty_name', `%${cleanName}%`).order('created_at', { ascending: false });
      data = res.data;
      error = res.error;
    } else {
      return [];
    }

    if (error) throw error;
    return data || [];
  },

  async submitResponse(response: Omit<Response, 'id' | 'submitted_at'>): Promise<string> {
    const code = response.assessment_id.toUpperCase();
    const rollNo = response.roll_number.trim().toUpperCase();

    const { data: existing, error: checkError } = await supabase
      .from('responses')
      .select('id')
      .eq('assessment_id', code)
      .eq('roll_number', rollNo)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) {
      throw new Error('You have already submitted this assessment.');
    }

    const id = Math.random().toString(36).substring(2, 11);
    const { error } = await supabase.from('responses').insert({
      assessment_id: code,
      roll_number: rollNo,
      student_name: response.student_name,
      student_email: response.student_email || null,
      answers_json: response.answers_json || null,
      score: response.score,
      total_questions: response.total_questions,
      time_taken: response.time_taken
    });

    if (error) throw error;
    return id;
  },

  async getResponses(assessmentId: string): Promise<Response[]> {
    const code = assessmentId.toUpperCase();
    const { data, error } = await supabase
      .from('responses')
      .select('*')
      .eq('assessment_id', code)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async allowReattempt(assessmentId: string, rollNumber: string): Promise<void> {
    const code = assessmentId.toUpperCase();
    const rollNo = rollNumber.trim().toUpperCase();

    const { error } = await supabase
      .from('responses')
      .delete()
      .eq('assessment_id', code)
      .eq('roll_number', rollNo);

    if (error) throw error;
  },

  async hasStudentSubmitted(assessmentId: string, rollNumber: string): Promise<boolean> {
    const code = assessmentId.toUpperCase();
    const rollNo = rollNumber.trim().toUpperCase();

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
    const { data, error } = await supabase.from('assessments').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAllResponses(): Promise<Response[]> {
    const { data, error } = await supabase.from('responses').select('*').order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAllProfiles(): Promise<any[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) throw error;
    return data || [];
  },

  async getStudentResponses(email: string): Promise<Response[]> {
    const target = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('responses')
      .select('*')
      .ilike('student_email', target)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
