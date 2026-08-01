import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../authContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signInWithEmail, isSignupHidden } = useAuth();
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

      // Check role or email for navigation
      const lowerEmail = email.toLowerCase().trim();
      if (lowerEmail === 'admin@anurag.edu.in') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      if (err.status === 429 || String(err.message || '').includes('429') || String(err.message || '').toLowerCase().includes('rate limit')) {
        setError('⚠️ Security rate limit reached (429: Too Many Requests). Please wait 60 seconds before trying again.');
      } else {
        setError(err.message || 'Failed to sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

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
              placeholder="e.g. professor@anurag.edu.in or admin@anurag.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
