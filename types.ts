
export type Direction = 'across' | 'down';

export interface Question {
  id: string;
  assessment_id: string;
  word: string;
  clue: string;
  direction: Direction;
  row: number;
  col: number;
}

export interface Assessment {
  id: string;
  title: string;
  subject: string;
  faculty_name: string;
  faculty_email?: string;
  deadline: string;
  created_at: string;
  class_section: string;
  start_time?: string;
}

export interface Response {
  id: string;
  assessment_id: string;
  roll_number: string;
  student_name?: string;
  student_email?: string;
  answers_json: Record<string, string>;
  score: number;
  total_questions: number;
  submitted_at: string;
  time_taken: number; // in seconds
}

export interface CrosswordGenerationResult {
  title: string;
  subject: string;
  visual_check?: string;
  questions: Omit<Question, 'id' | 'assessment_id'>[];
}
