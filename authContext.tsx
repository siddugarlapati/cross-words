import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

  // Track initialization to prevent double-fetching profile from both
  // onAuthStateChange and getSession firing simultaneously on startup.
  const initializedRef = useRef(false);
  const profileFetchInProgressRef = useRef<string | null>(null);

  const toggleHideSignup = () => {
    setIsSignupHidden(prev => !prev);
  };

  useEffect(() => {
    // 1. Listen for auth state changes — this is the SINGLE source of truth.
    //    getSession() below is ONLY used as a one-shot fallback if the
    //    onAuthStateChange hasn't fired yet.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      initializedRef.current = true;

      if (session?.user) {
        const u = session.user;
        const userRecord: User = { id: u.id, email: u.email ?? '' };
        setUser(userRecord);
        // Avoid fetching the same user's profile twice concurrently
        if (profileFetchInProgressRef.current !== u.id) {
          fetchSupabaseProfile(u.id, u.user_metadata, u.email);
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    // 2. Only use getSession as a fallback if onAuthStateChange hasn't already fired.
    //    We wait a short tick to allow onAuthStateChange to fire first.
    const sessionFallback = setTimeout(() => {
      if (!initializedRef.current) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!initializedRef.current) {
            // onAuthStateChange still hasn't fired; handle session manually
            if (session?.user) {
              const u = session.user;
              setUser({ id: u.id, email: u.email ?? '' });
              fetchSupabaseProfile(u.id, u.user_metadata, u.email);
            } else {
              setLoading(false);
            }
          }
        });
      }
    }, 100);

    return () => {
      subscription.unsubscribe();
      clearTimeout(sessionFallback);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Fetch user profile from Supabase `profiles` table.
   * Auto-upserts profile if missing to prevent foreign key errors.
   * Guards against concurrent duplicate fetches.
   */
  const fetchSupabaseProfile = async (
    userId: string,
    metadata?: Record<string, any>,
    email?: string | null
  ) => {
    // Prevent concurrent fetches for the same user
    if (profileFetchInProgressRef.current === userId) return;
    profileFetchInProgressRef.current = userId;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      const defaultName = metadata?.full_name || (email ? email.split('@')[0] : '') || 'User';
      // Only use DB role, NEVER fall back to frontend metadata for admin
      const dbRole = data?.role as UserRole | undefined;

      if (data && data.full_name) {
        setProfile({
          id: data.id,
          full_name: data.full_name,
          role: dbRole || 'faculty'
        });
      } else {
        // Auto-insert profile row if missing (handles race on first sign-up)
        const metaRole = (metadata?.role as UserRole) || 'faculty';
        // Never escalate to admin via metadata
        const safeRole: UserRole = metaRole === 'admin' ? 'faculty' : metaRole;

        const { data: inserted, error: upsertErr } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            full_name: defaultName,
            role: safeRole
          }, { onConflict: 'id' })
          .select('id, full_name, role')
          .maybeSingle();

        if (upsertErr) throw upsertErr;

        setProfile({
          id: userId,
          full_name: inserted?.full_name || defaultName,
          role: (inserted?.role as UserRole) || safeRole
        });
      }
    } catch (err) {
      console.error('[Auth] Error syncing user profile:', err);
      // Fallback: set minimal profile to prevent white screen
      // NEVER grant admin role from fallback
      const metaRole = metadata?.role as UserRole | undefined;
      const safeRole: UserRole = (metaRole && metaRole !== 'admin') ? metaRole : 'faculty';
      setProfile({
        id: userId,
        full_name: metadata?.full_name || (email ? email.split('@')[0] : '') || 'User',
        role: safeRole
      });
    } finally {
      profileFetchInProgressRef.current = null;
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    // Do NOT set loading here — let onAuthStateChange handle it.
    // This prevents the double loading state / flicker issue.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange will fire and update user/profile/loading automatically.
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = 'faculty'
  ) => {
    const validation = validatePasswordComplexity(password);
    if (!validation.isValid) {
      throw new Error(`Password policy violation: ${validation.errors.join(', ')}`);
    }

    // Never allow self-granting admin role via signup
    const safeRole: UserRole = role === 'admin' ? 'faculty' : role;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: safeRole
        }
      }
    });
    if (error) throw error;

    if (data.user && data.session) {
      try {
        // The DB trigger public.handle_new_user() automatically populates public.profiles on auth.users insert.
        // We attempt a client upsert only as a fallback if the user is authenticated.
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: fullName,
          role: safeRole
        }, { onConflict: 'id' });
      } catch (profileErr) {
        console.warn('Client-side profile upsert skipped (DB trigger handles profile creation):', profileErr);
      }
    }
    // onAuthStateChange will handle state update
  };

  const signOut = async () => {
    // Clear local state first for immediate UI response
    setUser(null);
    setProfile(null);
    profileFetchInProgressRef.current = null;
    initializedRef.current = false;

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Auth] Sign out error:', error);
      // State already cleared — user is effectively logged out in UI
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.isValid) {
      throw new Error(`Password policy violation: ${validation.errors.join(', ')}`);
    }

    if (!user?.email) {
      throw new Error('No authenticated user found.');
    }

    // Verify current password BEFORE allowing the change.
    // supabase.auth.updateUser does not verify the old password.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      throw new Error('Current password is incorrect.');
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
