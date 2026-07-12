import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Check if credentials are valid (and not placeholder DEMO)
const isValidConfig = 
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'DEMO' && 
  supabaseAnonKey !== 'DEMO';

export const supabase = isValidConfig 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn(
    '⚠️ Supabase is not configured or set to DEMO. The application will run in Local Storage Mode.'
  );
}
