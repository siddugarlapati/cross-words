import { supabase } from './supabaseClient';
import { Assessment, Question, Response } from './types';

const STORAGE_KEYS = {
  ASSESSMENTS: 'autocross_assessments',
  QUESTIONS: 'autocross_questions',
  RESPONSES: 'autocross_responses',
  MOCK_LOGGED_USER: 'autocross_mock_user'
};

// Local storage helper functions
const getFromStorage = <T,>(key: string): T[] => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

const saveToStorage = <T,>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const db = {
  async createAssessment(
    assessment: Omit<Assessment, 'id' | 'created_at'>,
    questions: Omit<Question, 'id' | 'assessment_id'>[]
  ): Promise<string> {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 character code

    if (supabase) {
      // 1. Get logged-in user id
      const { data: { user } } = await supabase.auth.getUser();

      // 2. Insert into Supabase assessments
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

      // 3. Insert questions in bulk
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
    } else {
      // LocalStorage Fallback
      const assessments = getFromStorage<Assessment>(STORAGE_KEYS.ASSESSMENTS);
      const newAssessment: Assessment = {
        ...assessment,
        id,
        created_at: new Date().toISOString(),
      };
      assessments.push(newAssessment);
      saveToStorage(STORAGE_KEYS.ASSESSMENTS, assessments);

      const allQuestions = getFromStorage<Question>(STORAGE_KEYS.QUESTIONS);
      const newQuestions: Question[] = questions.map((q) => ({
        ...q,
        id: Math.random().toString(36).substring(2, 11),
        assessment_id: id,
      }));
      allQuestions.push(...newQuestions);
      saveToStorage(STORAGE_KEYS.QUESTIONS, allQuestions);

      return id;
    }
  },

  async getAssessment(id: string): Promise<{ assessment: Assessment; questions: Question[] } | null> {
    const code = id.toUpperCase();

    if (supabase) {
      // Query assessment
      const { data: assessment, error: aError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', code)
        .maybeSingle();

      if (aError || !assessment) return null;

      // Query questions
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
    } else {
      // LocalStorage Fallback
      const assessments = getFromStorage<Assessment>(STORAGE_KEYS.ASSESSMENTS);
      const assessment = assessments.find((a) => a.id.toUpperCase() === code);
      if (!assessment) return null;

      const allQuestions = getFromStorage<Question>(STORAGE_KEYS.QUESTIONS);
      const questions = allQuestions.filter((q) => q.assessment_id.toUpperCase() === code);
      return { assessment, questions };
    }
  },

  async getAssessmentsByFaculty(facultyName: string): Promise<Assessment[]> {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();

      let query = supabase.from('assessments').select('*');
      if (user?.id && user?.email) {
        query = query.or(`faculty_id.eq.${user.id},faculty_email.eq.${user.email},faculty_name.ilike.%${facultyName || ''}%`);
      } else if (facultyName) {
        query = query.ilike('faculty_name', `%${facultyName}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching assessments:', error);
        return [];
      }

      return data || [];
    } else {
      // LocalStorage Fallback
      // If mock user is logged in, filter by their profile name (or fallback to searching name)
      const mockUserStr = localStorage.getItem(STORAGE_KEYS.MOCK_LOGGED_USER);
      let filterName = facultyName.toLowerCase();
      
      if (mockUserStr) {
        const profileStr = localStorage.getItem('autocross_mock_profile');
        if (profileStr) {
          const prof = JSON.parse(profileStr);
          if (prof && prof.full_name) {
            filterName = prof.full_name.toLowerCase();
          }
        }
      }

      const assessments = getFromStorage<Assessment>(STORAGE_KEYS.ASSESSMENTS);
      return assessments.filter(
        a => a.faculty_name.toLowerCase() === filterName || a.faculty_name.toLowerCase() === facultyName.toLowerCase()
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  },

  async submitResponse(response: Omit<Response, 'id' | 'submitted_at'>): Promise<string> {
    const code = response.assessment_id.toUpperCase();
    const rollNo = response.roll_number.trim().toUpperCase();

    if (supabase) {
      // Check if roll number already submitted
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
        student_email: response.student_email,
        score: response.score,
        total_questions: response.total_questions,
        time_taken: response.time_taken
      });

      if (error) throw error;
      return id;

      if (error) throw error;
      return id;
    } else {
      // LocalStorage Fallback
      const responses = getFromStorage<Response>(STORAGE_KEYS.RESPONSES);
      
      const existing = responses.find(
        r => r.assessment_id.toUpperCase() === code && r.roll_number.trim().toUpperCase() === rollNo
      );
      if (existing) {
        throw new Error('You have already submitted this assessment.');
      }

      const id = Math.random().toString(36).substring(2, 11);
      const newResponse: Response = {
        ...response,
        assessment_id: code,
        roll_number: rollNo,
        id,
        submitted_at: new Date().toISOString(),
      };
      responses.push(newResponse);
      saveToStorage(STORAGE_KEYS.RESPONSES, responses);
      return id;
    }
  },

  async getResponses(assessmentId: string): Promise<Response[]> {
    const code = assessmentId.toUpperCase();

    if (supabase) {
      const { data, error } = await supabase
        .from('responses')
        .select('*')
        .eq('assessment_id', code)
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('Error fetching responses:', error);
        return [];
      }

      return data || [];
    } else {
      // LocalStorage Fallback
      const responses = getFromStorage<Response>(STORAGE_KEYS.RESPONSES);
      return responses
        .filter((r) => r.assessment_id.toUpperCase() === code)
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    }
  },

  async allowReattempt(assessmentId: string, rollNumber: string): Promise<void> {
    const code = assessmentId.toUpperCase();
    const rollNo = rollNumber.trim().toUpperCase();

    if (supabase) {
      const { error } = await supabase
        .from('responses')
        .delete()
        .eq('assessment_id', code)
        .eq('roll_number', rollNo);

      if (error) throw error;
    } else {
      const responses = getFromStorage<Response>(STORAGE_KEYS.RESPONSES);
      const filtered = responses.filter(
        r => !(r.assessment_id.toUpperCase() === code && r.roll_number.trim().toUpperCase() === rollNo)
      );
      saveToStorage(STORAGE_KEYS.RESPONSES, filtered);
    }
  },

  async hasStudentSubmitted(assessmentId: string, rollNumber: string): Promise<boolean> {
    const code = assessmentId.toUpperCase();
    const rollNo = rollNumber.trim().toUpperCase();

    if (supabase) {
      const { data, error } = await supabase
        .from('responses')
        .select('id')
        .eq('assessment_id', code)
        .eq('roll_number', rollNo)
        .maybeSingle();

      if (error) return false;
      return !!data;
    } else {
      const responses = getFromStorage<Response>(STORAGE_KEYS.RESPONSES);
      return responses.some(r => r.assessment_id.toUpperCase() === code && r.roll_number.trim().toUpperCase() === rollNo);
    }
  },

  async getAllAssessments(): Promise<Assessment[]> {
    if (supabase) {
      const { data, error } = await supabase.from('assessments').select('*').order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } else {
      return getFromStorage<Assessment>(STORAGE_KEYS.ASSESSMENTS);
    }
  },

  async getAllResponses(): Promise<Response[]> {
    if (supabase) {
      const { data, error } = await supabase.from('responses').select('*').order('submitted_at', { ascending: false });
      if (error) return [];
      return data || [];
    } else {
      return getFromStorage<Response>(STORAGE_KEYS.RESPONSES);
    }
  },

  async getAllProfiles(): Promise<any[]> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) return [];
      return data || [];
    } else {
      return [
        { id: '1', full_name: 'Professor Anurag', email: 'faculty@anurag.edu.in', role: 'faculty' },
        { id: '2', full_name: 'Super Admin', email: 'admin@anurag.edu.in', role: 'admin' }
      ];
    }
  },

  async getStudentResponses(email: string): Promise<Response[]> {
    const target = email.trim().toLowerCase();
    if (supabase) {
      const { data, error } = await supabase
        .from('responses')
        .select('*')
        .ilike('student_email', target)
        .order('submitted_at', { ascending: false });

      if (error) return [];
      return data || [];
    } else {
      const responses = getFromStorage<Response>(STORAGE_KEYS.RESPONSES);
      return responses.filter(r => (r.student_email || '').toLowerCase() === target);
    }
  }
};
