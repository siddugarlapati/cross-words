import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import FacultyCreate from './pages/FacultyCreate';
import FacultyDashboard from './pages/FacultyDashboard';
import StudentSolve from './pages/StudentSolve';
import Success from './pages/Success';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SuperAdmin from './pages/SuperAdmin';
import StudentDashboard from './pages/StudentDashboard';
import { AuthProvider, useAuth, validatePasswordComplexity } from './authContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode; facultyOnly?: boolean; adminOnly?: boolean }> = ({ children, facultyOnly, adminOnly }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 min-h-screen bg-[#f8f9fc]">
        <div className="w-16 h-16 border-4 border-slate-200 rounded-full mb-6 relative">
          <div className="absolute inset-0 border-4 border-[#b01c1e] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-slate-500 font-mono uppercase tracking-widest text-sm animate-pulse">
          Authenticating Session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = profile?.role || 'faculty';

  if (adminOnly && role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-black text-[#002147] mb-2">SuperAdmin Access Required</h2>
        <p className="text-slate-600 text-xs mb-6 font-medium">This panel is restricted to SuperAdmin account authorization.</p>
        <Link to="/" className="inline-block px-6 py-3 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold rounded-xl text-xs transition-all">Return to Home</Link>
      </div>
    );
  }

  if (facultyOnly && role !== 'faculty' && role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-black text-[#002147] mb-2">Faculty Access Required</h2>
        <p className="text-slate-600 text-xs mb-6 font-medium">Faculty creation tools are restricted to faculty members.</p>
        <Link to="/" className="inline-block px-6 py-3 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold rounded-xl text-xs transition-all">Return to Home</Link>
      </div>
    );
  }

  return <>{children}</>;
};

const NavigationBar: React.FC = () => {
  const { user, profile, signOut, changePassword, isSignupHidden } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const handleLogout = async () => {
    await signOut();
    setMobileMenuOpen(false);
    navigate('/');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    const validation = validatePasswordComplexity(pwdNew);
    if (!validation.isValid) {
      setPwdError(validation.errors[0]);
      return;
    }

    try {
      await changePassword(pwdCurrent, pwdNew);
      setPwdSuccess('Password successfully updated!');
      setTimeout(() => {
        setShowPwdModal(false);
        setPwdCurrent('');
        setPwdNew('');
        setPwdSuccess('');
      }, 1500);
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password');
    }
  };

  const pwdValidation = validatePasswordComplexity(pwdNew);
  const userRole = profile?.role || (user?.email === 'admin@anurag.edu.in' ? 'admin' : 'faculty');

  return (
    <>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group" onClick={() => setMobileMenuOpen(false)}>
            <div className="bg-white px-2.5 py-1 rounded-xl flex items-center justify-center shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
              <img src="/anurag-logo.png" alt="Anurag University Logo" className="h-6 object-contain" />
            </div>
            <div className="h-5 w-px bg-slate-300 hidden sm:block" />
            <span className="text-xl font-black text-[#002147] hidden sm:block">
              AutoCross-Edu
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
            {user ? (
              <>
                {userRole === 'admin' && (
                  <Link to="/admin" className="text-amber-700 hover:text-amber-900 font-bold transition-colors">
                    🛡️ SuperAdmin Panel
                  </Link>
                )}
                {userRole === 'student' ? (
                  <Link to="/student-dashboard" className="text-[#002147] hover:text-[#b01c1e] transition-colors">
                    Student Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/create" className="text-slate-600 hover:text-[#002147] transition-colors">Create Assessment</Link>
                    <Link to="/dashboard" className="text-slate-600 hover:text-[#002147] transition-colors">Faculty Dashboard</Link>
                  </>
                )}
                <div className="h-4 w-px bg-slate-300" />
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-[#002147] font-bold leading-none">{profile?.full_name || user.email}</p>
                    <span className="text-[10px] font-bold text-[#b01c1e] uppercase">{userRole}</span>
                  </div>
                  <button
                    onClick={() => setShowPwdModal(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    Change Password
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-3.5 py-1.5 bg-[#b01c1e] hover:bg-[#851415] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    Log Out
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="text-slate-600 hover:text-[#002147] transition-colors">Portal Login</Link>
                {!isSignupHidden && (
                  <Link to="/signup" className="px-4 py-2 bg-[#b01c1e] hover:bg-[#851415] text-white rounded-xl text-xs font-bold transition-all shadow-sm">
                    Sign Up
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-[#002147] rounded-lg focus:outline-none"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-6 space-y-4 animate-slide-up">
            {user ? (
              <>
                <div className="pb-3 border-b border-slate-200">
                  <p className="text-sm font-bold text-[#002147]">{profile?.full_name || user.email}</p>
                  <span className="text-xs text-slate-500 capitalize">Role: {userRole}</span>
                </div>
                {userRole === 'admin' && (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block text-amber-700 font-bold py-2">
                    🛡️ SuperAdmin Panel
                  </Link>
                )}
                {userRole === 'student' ? (
                  <Link to="/student-dashboard" onClick={() => setMobileMenuOpen(false)} className="block text-slate-700 font-medium py-2">
                    Student Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/create" onClick={() => setMobileMenuOpen(false)} className="block text-slate-700 hover:text-[#002147] font-medium py-2">Create Assessment</Link>
                    <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block text-slate-700 hover:text-[#002147] font-medium py-2">Faculty Dashboard</Link>
                  </>
                )}
                <button onClick={() => { setShowPwdModal(true); setMobileMenuOpen(false); }} className="w-full text-left py-2 text-slate-600 hover:text-[#002147] font-medium">Change Password</button>
                <button onClick={handleLogout} className="w-full py-2.5 bg-[#b01c1e] text-white font-bold rounded-xl text-center shadow-sm">Log Out</button>
              </>
            ) : (
              <div className="space-y-3">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block w-full py-2.5 text-center bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200">Portal Login</Link>
                {!isSignupHidden && (
                  <Link to="/signup" onClick={() => setMobileMenuOpen(false)} className="block w-full py-2.5 text-center bg-[#b01c1e] text-white font-bold rounded-xl">Sign Up</Link>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Password Change Modal */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPwdModal(false)}>
          <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-[#002147] mb-1">Change Password</h3>
            <p className="text-slate-500 text-xs mb-6">Ensure your account meets security requirements.</p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Current Password</label>
                <input type="password" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">New Password</label>
                <input type="password" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm" value={pwdNew} onChange={e => setPwdNew(e.target.value)} />
              </div>

              {pwdNew && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Security Requirements:</p>
                  <p className={pwdNew.length >= 8 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>✓ Minimum 8 characters</p>
                  <p className={/[A-Z]/.test(pwdNew) ? 'text-emerald-600 font-bold' : 'text-slate-400'}>✓ At least one uppercase letter (A-Z)</p>
                  <p className={/[a-z]/.test(pwdNew) ? 'text-emerald-600 font-bold' : 'text-slate-400'}>✓ At least one lowercase letter (a-z)</p>
                  <p className={/[0-9!@#$%^&*()]/.test(pwdNew) ? 'text-emerald-600 font-bold' : 'text-slate-400'}>✓ At least one digit or special character</p>
                </div>
              )}

              {pwdError && <p className="text-red-600 text-xs font-bold text-center bg-red-50 p-2 rounded-lg border border-red-200">{pwdError}</p>}
              {pwdSuccess && <p className="text-emerald-600 text-xs font-bold text-center bg-emerald-50 p-2 rounded-lg border border-emerald-200">{pwdSuccess}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPwdModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-all cursor-pointer">Cancel</button>
                <button type="submit" disabled={!pwdValidation.isValid} className="flex-1 bg-[#b01c1e] hover:bg-[#851415] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all cursor-pointer shadow-sm">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const AppContent: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fc] text-slate-800 relative selection:bg-red-100">
      <NavigationBar />

      {/* Main Container */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-8 relative z-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><SuperAdmin /></ProtectedRoute>} />
          <Route path="/student-dashboard" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute facultyOnly><FacultyCreate /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute facultyOnly><FacultyDashboard /></ProtectedRoute>} />
          <Route path="/solve/:id" element={<StudentSolve />} />
          <Route path="/success" element={<Success />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-200 text-center text-xs text-slate-400 relative z-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#002147]">Anurag University</span>
            <span>•</span>
            <span>AutoCross-Edu AI Assessment Engine</span>
          </div>
          <p>© 2026 AutoCross-Edu. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;
