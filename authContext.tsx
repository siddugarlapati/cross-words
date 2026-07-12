import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

interface User {
  id: string;
  email: string;
}

interface Profile {
  id: string;
  full_name: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isLocalMode: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_USER_KEY = 'autocross_mock_user';
const LOCAL_PROFILE_KEY = 'autocross_mock_profile';
const LOCAL_USERS_DB_KEY = 'autocross_mock_users_db';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const isLocalMode = !supabase;

  useEffect(() => {
    if (supabase) {
      // 1. Setup real Supabase auth listeners
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email ?? '' });
          fetchSupabaseProfile(session.user.id);
        } else {
          setLoading(false);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email ?? '' });
          fetchSupabaseProfile(session.user.id);
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
      // 2. Setup local storage mock auth
      const db = localStorage.getItem(LOCAL_USERS_DB_KEY);
      if (!db) {
        const defaultUsers = [{
          id: 'faculty-1',
          email: 'faculty@anurag.edu.in',
          password: 'password123',
          fullName: 'Professor Anurag'
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

  const fetchSupabaseProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase!
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setProfile({ id: data.id, full_name: data.full_name });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
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
        const db = localStorage.getItem(LOCAL_USERS_DB_KEY);
        const users = db ? JSON.parse(db) : [];
        const found = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        
        if (!found) {
          throw new Error('Invalid email or password.');
        }

        const loggedUser = { id: found.id, email: found.email };
        const loggedProfile = { id: found.id, full_name: found.fullName };

        localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(loggedUser));
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(loggedProfile));
        setUser(loggedUser);
        setProfile(loggedProfile);
      }
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, full_name: fullName }]);
          if (profileError) throw profileError;
        }
      } else {
        // Mock sign up
        const db = localStorage.getItem(LOCAL_USERS_DB_KEY);
        const users = db ? JSON.parse(db) : [];
        const exists = users.some((u: any) => u.email.toLowerCase() === email.toLowerCase());
        
        if (exists) {
          throw new Error('User already exists with this email.');
        }

        const id = Math.random().toString(36).substring(2, 11);
        const newUser = { id, email, password, fullName };
        users.push(newUser);
        localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));

        const loggedUser = { id, email };
        const loggedProfile = { id, full_name: fullName };

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
        setUser(null);
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } else {
      const db = localStorage.getItem(LOCAL_USERS_DB_KEY);
      const users = db ? JSON.parse(db) : [];
      const idx = users.findIndex((u: any) => u.id === user?.id);
      if (idx === -1) throw new Error('User not found.');
      if (users[idx].password !== currentPassword) throw new Error('Current password is incorrect.');
      users[idx].password = newPassword;
      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(users));
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isLocalMode, signInWithEmail, signUpWithEmail, signOut, changePassword }}>
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
