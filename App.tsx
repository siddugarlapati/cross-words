import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import FacultyCreate from './pages/FacultyCreate';
import FacultyDashboard from './pages/FacultyDashboard';
import StudentSolve from './pages/StudentSolve';
import Success from './pages/Success';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { AuthProvider, useAuth } from './authContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 bg-slate-950 text-slate-100 min-h-screen">
        <div className="w-16 h-16 border-4 border-slate-800 rounded-full mb-6 relative">
          <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-slate-400 font-mono uppercase tracking-widest text-sm animate-pulse">
          Authenticating User...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const NavigationBar: React.FC = () => {
  const { user, profile, signOut, isLocalMode, changePassword } = useAuth();
  const navigate = useNavigate();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdError, setPwdError] = useState('');

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (pwdNew.length < 6) { setPwdError('New password must be at least 6 characters.'); return; }
    try {
      await changePassword(pwdCurrent, pwdNew);
      setShowPwdModal(false);
      setPwdCurrent('');
      setPwdNew('');
    } catch (err: any) {
      setPwdError(err.message);
    }
  };

  return (
    <>
    <header className="border-b-2 border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 shadow-[0_4px_20px_rgba(38,47,75,0.06)]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="bg-white px-3 py-1.5 rounded-xl flex items-center justify-center shadow-md border border-slate-200">
            <img src="/anurag-logo.png" alt="Anurag University Logo" className="h-6 object-contain" />
          </div>
          <div className="h-5 w-px bg-slate-800 hidden sm:block" />
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-teal-400 bg-clip-text text-transparent hidden sm:block">
            AutoCross-Edu
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          {user ? (
            <>
              <Link to="/create" className="text-slate-400 hover:text-teal-400 transition-colors">Create Assessment</Link>
              <Link to="/dashboard" className="text-slate-400 hover:text-purple-400 transition-colors">Dashboard</Link>
              <div className="h-4 w-px bg-slate-800" />
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-300 font-bold leading-none">{profile?.full_name || user.email}</p>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                    {isLocalMode ? 'Local Mode' : 'Cloud Mode'}
                  </span>
                </div>
                <button
                  onClick={() => setShowPwdModal(true)}
                  className="px-3 py-1.5 bg-slate-850 hover:bg-teal-950/40 hover:text-teal-400 border border-slate-700 hover:border-teal-900/50 rounded-xl text-slate-400 font-bold transition-all text-xs cursor-pointer"
                >
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 bg-slate-850 hover:bg-red-950/40 hover:text-red-400 border border-slate-700 hover:border-red-900/50 rounded-xl text-slate-300 font-bold transition-all text-xs cursor-pointer"
                >
                  Log Out
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="text-slate-400 hover:text-purple-400 transition-colors">Faculty Login</Link>
              <Link to="/signup" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:brightness-110 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-purple-500/10">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>

    {showPwdModal && (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowPwdModal(false)}>
        <div className="bg-slate-900 border-2 border-slate-700 p-8 rounded-[2.5rem] max-w-sm w-full shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-black text-white mb-2">Change Password</h3>
          <p className="text-slate-400 text-xs mb-6">Update your account password.</p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Current Password</label>
              <input type="password" required className="w-full bg-slate-950/50 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-3 outline-none text-sm text-slate-200" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">New Password</label>
              <input type="password" required className="w-full bg-slate-950/50 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-3 outline-none text-sm text-slate-200" value={pwdNew} onChange={e => setPwdNew(e.target.value)} />
            </div>
            {pwdError && <p className="text-red-400 text-xs font-bold text-center">{pwdError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowPwdModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-sm transition-all cursor-pointer">Cancel</button>
              <button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 rounded-xl text-sm transition-all cursor-pointer">Update</button>
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-teal-500/30 relative">
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(176,28,30,0.05), transparent), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(96,165,250,0.03), transparent)'
      }} />
      <NavigationBar />

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-8 relative">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/create" element={
            <ProtectedRoute>
              <FacultyCreate />
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <FacultyDashboard />
            </ProtectedRoute>
          } />
          <Route path="/solve/:id" element={<StudentSolve />} />
          <Route path="/success" element={<Success />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t-2 border-slate-800 text-center text-sm text-slate-500 relative">
        <p>© 2026 AutoCross-Edu. AI-Powered Educational Assessment System.</p>
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
