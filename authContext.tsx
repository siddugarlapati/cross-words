import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export type UserRole = 'faculty' | 'student' | 'admin';

export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validatePasswordComplexity = (password: string): PasswordValidationResult => {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push('Must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Must contain at least one uppercase letter (A-Z)');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Must contain at least one lowercase letter (a-z)');
  }
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Must contain at least one digit or special character');
  }
  return {
    isValid: errors.length === 0,
    errors
  };
};

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isLocalMode: boolean;
  isSignupHidden: boolean;
  toggleHideSignup: () => void;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_USER_KEY = 'autocross_mock_user';
const LOCAL_PROFILE_KEY = 'autocross_mock_profile';
const LOCAL_USERS_DB_KEY = 'autocross_mock_users_db';
const HIDE_SIGNUP_KEY = 'autocross_hide_signup';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignupHidden, setIsSignupHidden] = useState<boolean>(() => {
    return localStorage.getItem(HIDE_SIGNUP_KEY) === 'true';
  });
  const isLocalMode = !supabase;

  const toggleHideSignup = () => {
    setIsSignupHidden(prev => {
      const next = !prev;
      localStorage.setItem(HIDE_SIGNUP_KEY, String(next));
      return next;
    });
  };

  useEffect(() => {
    if (supabase) {
      let initialSessionHandled = false;

      // 1. Get existing session on mount
      supabase.auth.getSession().then(({ data: { session } }) => {
        initialSessionHandled = true;
        if (session?.user) {
          const u = session.user;
          setUser({ id: u.id, email: u.email ?? '' });
          fetchSupabaseProfile(u.id, u.user_metadata, u.email);
        } else {
          setLoading(false);
        }
      });

      // 2. Listen for auth state changes (login/logout/signup)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        // Skip if getSession already handled the initial load
        if (!initialSessionHandled) return;

        if (session?.user) {
          const u = session.user;
          setUser({ id: u.id, email: u.email ?? '' });
          fetchSupabaseProfile(u.id, u.user_metadata, u.email);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // 2. Setup local storage fallback auth (offline mode)
      const dbStr = localStorage.getItem(LOCAL_USERS_DB_KEY);
      if (!dbStr) {
        const defaultUsers = [{
          id: 'faculty-1',
          email: 'faculty@anurag.edu.in',
          password: 'Password123!',
          fullName: 'Professor Anurag',
          role: 'faculty'
        }];
        localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(defaultUsers));
      }

      const savedUser = localStorage.getItem(LOCAL_USER_KEY);
      const savedProfile = localStorage.getItem(LOCAL_PROFILE_KEY);
      if (savedUser && savedProfile) {
        setUser(JSON.parse(savedUser));
        setProfile(JSON.parse(savedProfile));
      }
      setLoading(false);
    }
  }, []);

  /**
   * Fetch user profile from Supabase `profiles` table.
   * Falls back to session metadata if profile row doesn't exist yet
   * (avoids extra auth API calls that trigger 429 rate limits).
   */
  const fetchSupabaseProfile = async (
    userId: string,
    metadata?: Record<string, any>,
    email?: string | null
  ) => {
    try {
      const { data } = await supabase!
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile({
          id: data.id,
          full_name: data.full_name,
          role: (data.role as UserRole) || 'faculty'
        });
      } else {
        // Use session metadata directly — no extra auth API call needed
        setProfile({
          id: userId,
          full_name: metadata?.full_name || email || 'Faculty Member',
          role: (metadata?.role as UserRole) || 'faculty'
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      // Graceful fallback using whatever metadata we have
      setProfile({
        id: userId,
        full_name: metadata?.full_name || email || 'Faculty Member',
        role: (metadata?.role as UserRole) || 'faculty'
      });
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setLoading(true);
    try {
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // Mock sign in
        const dbStr = localStorage.getItem(LOCAL_USERS_DB_KEY);
        const users = dbStr ? JSON.parse(dbStr) : [];
        const found = users.find(
          (u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
        );

        if (!found) {
          throw new Error('Invalid email or password.');
        }

        const loggedUser: User = { id: found.id, email: found.email };
        const loggedProfile: Profile = {
          id: found.id,
          full_name: found.fullName,
          role: found.role || 'faculty'
        };

        localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(loggedUser));
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(loggedProfile));
        setUser(loggedUser);
        setProfile(loggedProfile);
      }
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = 'faculty'
  ) => {
    // Validate password policy
    const validation = validatePasswordComplexity(password);
    if (!validation.isValid) {
      throw new Error(`Password policy violation: ${validation.errors.join(', ')}`);
    }

    setLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email ?? '' });
          setProfile({ id: data.user.id, full_name: fullName, role: role });
        }
      } else {
        // Mock sign up
        const dbStr = localStorage.getItem(LOCAL_USERS_DB_KEY);
        const users = dbStr ? JSON.parse(dbStr) : [];
        const exists = users.some((u: any) => u.email.toLowerCase() === email.toLowerCase());

        if (exists) {
          throw new Error('An account already exists with this email address.');
        }

        const id = Math.random().toString(36).substring(2, 11);
        const newUser = { id, email, password, fullName, role };
        users.push(newUser);
        localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));

        const loggedUser: User = { id, email };
        const loggedProfile: Profile = { id, full_name: fullName, role };

        localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(loggedUser));
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(loggedProfile));
        setUser(loggedUser);
        setProfile(loggedProfile);
      }
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } else {
        localStorage.removeItem(LOCAL_USER_KEY);
        localStorage.removeItem(LOCAL_PROFILE_KEY);
      }
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.isValid) {
      throw new Error(`Password policy violation: ${validation.errors.join(', ')}`);
    }

    if (supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } else {
      const dbStr = localStorage.getItem(LOCAL_USERS_DB_KEY);
      const users = dbStr ? JSON.parse(dbStr) : [];
      const idx = users.findIndex((u: any) => u.id === user?.id);
      if (idx === -1) throw new Error('User account not found.');
      if (users[idx].password !== currentPassword) throw new Error('Current password is incorrect.');
      users[idx].password = newPassword;
      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isLocalMode,
        isSignupHidden,
        toggleHideSignup,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        changePassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
