import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, UserRole, validatePasswordComplexity } from '../authContext';

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { signUpWithEmail, isSignupHidden } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('faculty');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordValidation = validatePasswordComplexity(password);

  if (isSignupHidden) {
    return (
      <div className="max-w-md mx-auto my-16 bg-white border border-slate-200 p-8 rounded-3xl shadow-xl text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-[#b01c1e] rounded-full flex items-center justify-center mx-auto border border-red-200">
          🔒
        </div>
        <h2 className="text-2xl font-black text-[#002147]">Public Registration Closed</h2>
        <p className="text-slate-600 text-xs leading-relaxed font-medium">
          Public registration has been restricted by the Administrator. Please contact your administrator to obtain account credentials.
        </p>
        <Link
          to="/login"
          className="inline-block w-full py-3 bg-[#002147] hover:bg-[#001733] text-white font-bold rounded-xl text-xs transition-all shadow-sm"
        >
          Return to Sign In
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0]);
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail(email, password, fullName, role);
      if (role === 'faculty') {
        navigate('/dashboard');
      } else if (role === 'student') {
        navigate('/student-dashboard');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      if (err.status === 429 || String(err.message || '').includes('429') || String(err.message || '').toLowerCase().includes('rate limit')) {
        setError('⚠️ Security rate limit reached (429: Too Many Requests). Please wait 60 seconds before trying again.');
      } else if (err.name === 'TypeError' || String(err.message || '').includes('Failed to fetch') || String(err.message || '').includes('fetch failed')) {
        setError('🔌 Connection Refused: Local Supabase database (127.0.0.1:54321) is offline. Please start Docker / Supabase or set a remote VITE_SUPABASE_URL in .env');
      } else {
        setError(err.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] py-8 relative overflow-hidden">
      <div className="max-w-md w-full bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-xl relative z-10 animate-slide-up">
        <div className="text-center mb-6">
          <div className="inline-block p-2.5 bg-slate-50 rounded-2xl mb-3 border border-slate-200">
            <img src="/anurag-logo.png" alt="Anurag Logo" className="h-7 object-contain" />
          </div>
          <h2 className="text-2xl font-black text-[#002147]">Create Account</h2>
          <p className="text-slate-600 text-xs mt-1 font-medium">Join AutoCross-Edu to create or track your assessment performance.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-xs font-bold py-3 px-4 rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Account Role</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setRole('faculty')}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  role === 'faculty'
                    ? 'bg-[#002147] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Faculty Member
              </button>
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  role === 'student'
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Student
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Full Name</label>
            <input
              required
              type="text"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] placeholder:text-slate-400"
              placeholder={role === 'faculty' ? 'e.g. Prof. Ramesh Kumar' : 'e.g. Rahul Sharma'}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Email Address</label>
            <input
              required
              type="email"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] placeholder:text-slate-400"
              placeholder={role === 'faculty' ? 'e.g. ramesh@anurag.edu.in' : 'e.g. 24eg507f01@anurag.edu.in'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Password</label>
            <input
              required
              type="password"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Confirm Password</label>
            <input
              required
              type="password"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e]"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {/* Password Validation Checklist */}
          {password && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
              <p className="font-bold text-slate-600 uppercase">Security Requirements:</p>
              <p className={password.length >= 8 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                ✓ Minimum 8 characters
              </p>
              <p className={/[A-Z]/.test(password) ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                ✓ At least one uppercase letter (A-Z)
              </p>
              <p className={/[a-z]/.test(password) ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                ✓ At least one lowercase letter (a-z)
              </p>
              <p className={/[0-9!@#$%^&*()]/.test(password) ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                ✓ At least one digit or special character
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passwordValidation.isValid}
            className="w-full mt-2 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Complete Sign Up'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-600">
          Already registered?{' '}
          <Link to="/login" className="text-[#b01c1e] hover:underline font-bold">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
