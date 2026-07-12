import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../authContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signInWithEmail, isLocalMode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[75vh] py-12 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="max-w-md w-full glass border border-slate-800 p-8 md:p-10 rounded-[2.5rem] shadow-2xl relative z-10 animate-slide-up">
        {/* Local mode banner */}
        {isLocalMode ? (
          <div className="mb-6 bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold py-2.5 px-4 rounded-xl text-center flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            Running in Local Storage Mode (Mock Login)
          </div>
        ) : (
          <div className="mb-6 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-bold py-2.5 px-4 rounded-xl text-center flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></span>
            Connected to Cloud Database (Supabase)
          </div>
        )}

        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white">Faculty Sign In</h2>
          <p className="text-slate-400 text-sm mt-2">Access your assessments and students\' analytics.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold py-3 px-4 rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
            <input
              required
              type="email"
              className="w-full bg-slate-950/50 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-2xl px-5 py-4 outline-none transition-all text-slate-100 placeholder:text-slate-700"
              placeholder="prof.wright@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Password</label>
            </div>
            <input
              required
              type="password"
              className="w-full bg-slate-950/50 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-2xl px-5 py-4 outline-none transition-all text-slate-100 placeholder:text-slate-700"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:brightness-110 active:scale-[0.98] text-white font-black py-4.5 rounded-2xl transition-all shadow-xl shadow-purple-500/20 flex items-center justify-center gap-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          Don\'t have an account?{' '}
          <Link to="/signup" className="text-purple-400 hover:text-purple-300 font-bold transition-colors">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
