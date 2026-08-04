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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignupHidden, setIsSignupHidden] = useState<boolean>(false);
  const isLocalMode = false;

  const toggleHideSignup = () => {
    setIsSignupHidden(prev => !prev);
  };

  useEffect(() => {
    // 1. Listen for auth state changes (login/logout/signup/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

    // 2. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        setUser({ id: u.id, email: u.email ?? '' });
        fetchSupabaseProfile(u.id, u.user_metadata, u.email);
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Fetch user profile from Supabase `profiles` table.
   * Auto-upserts profile if missing to prevent foreign key errors on assessment creation.
   */
  const fetchSupabaseProfile = async (
    userId: string,
    metadata?: Record<string, any>,
    email?: string | null
  ) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const defaultName = metadata?.full_name || (email ? email.split('@')[0] : '') || 'User';
      const defaultRole = (metadata?.role as UserRole) || 'faculty';

      if (data && data.full_name) {
        setProfile({
          id: data.id,
          full_name: data.full_name,
          role: (data.role as UserRole) || 'faculty'
        });
      } else {
        // Auto-insert profile row in database if missing
        const { data: inserted } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            full_name: defaultName,
            role: defaultRole
          })
          .select()
          .maybeSingle();

        setProfile({
          id: userId,
          full_name: inserted?.full_name || defaultName,
          role: (inserted?.role as UserRole) || defaultRole
        });
      }
    } catch (err) {
      console.error('Error syncing user profile:', err);
      setProfile({
        id: userId,
        full_name: metadata?.full_name || (email ? email.split('@')[0] : '') || 'User',
        role: (metadata?.role as UserRole) || 'faculty'
      });
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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

        // Ensure profile row exists in database immediately
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: fullName,
          role: role
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
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

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
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
