import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../authContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signInWithEmail, profile, user, loading: authLoading, isSignupHidden } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Once the user is authenticated AND the profile has loaded,
  // navigate to the correct dashboard based on their DB role.
  // This prevents navigating before we know the actual role.
  useEffect(() => {
    if (user && profile && !authLoading) {
      if (profile.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (profile.role === 'student') {
        navigate('/student-dashboard', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, profile, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email.trim().toLowerCase(), password);
      // Navigation is handled by the useEffect above once profile loads.
    } catch (err: any) {
      if (err.status === 429 || String(err.message || '').includes('429') || String(err.message || '').toLowerCase().includes('rate limit')) {
        setError('⚠️ Security rate limit reached. Please wait 60 seconds before trying again.');
      } else if (err.message?.toLowerCase().includes('invalid login credentials') || err.message?.toLowerCase().includes('invalid_grant') || err.status === 400) {
        setError('Invalid email or password. Please check your credentials or click "Sign Up" below to create a new account.');
      } else if (err.name === 'TypeError' || String(err.message || '').includes('Failed to fetch') || String(err.message || '').includes('fetch failed')) {
        setError('🔌 Connection Refused: Local Supabase database (127.0.0.1:54321) is offline. Please start Docker / Supabase or set a remote VITE_SUPABASE_URL in .env');
      } else {
        setError(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // If already logged in and profile is loaded, show loading while redirect happens
  if (user && profile) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-[#b01c1e] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[75vh] py-8 relative overflow-hidden">
      <div className="max-w-md w-full bg-white border border-slate-200 shadow-xl p-6 md:p-8 rounded-3xl relative z-10 animate-slide-up">

        <div className="text-center mb-6">
          <div className="inline-block p-3 bg-slate-50 rounded-2xl border border-slate-100 mb-3">
            <img src="/anurag-logo.png" alt="Anurag Logo" className="h-8 object-contain" />
          </div>
          <h2 className="text-2xl font-black text-[#002147]">Portal Sign In</h2>
          <p className="text-slate-500 text-xs mt-1">Access your Anurag University assessment portal.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-xs font-bold py-3 px-4 rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Email</label>
            <input
              required
              type="email"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none text-sm text-slate-800 focus:border-[#b01c1e] transition-colors"
              placeholder="e.g. professor@anurag.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Password</label>
            <input
              required
              type="password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none text-sm text-slate-800 focus:border-[#b01c1e] transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || authLoading}
            className="w-full mt-2 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            {(loading || authLoading) ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Sign In to Dashboard'
            )}
          </button>
        </form>

        {!isSignupHidden && (
          <p className="text-center text-xs text-slate-600 mt-4">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#b01c1e] font-bold hover:underline">Create Account</Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default Login;
