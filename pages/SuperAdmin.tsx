import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useAuth } from '../authContext';
import { Assessment, Response } from '../types';

interface AccountRecord {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at?: string;
}

const SuperAdmin: React.FC = () => {
  const { user, profile, isSignupHidden, toggleHideSignup, signUpWithEmail } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [usersList, setUsersList] = useState<AccountRecord[]>([]);

  // Create User Form State
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'faculty' | 'student'>('faculty');
  const [createMsg, setCreateMsg] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all assessments & responses from db
      const allAssessments = await db.getAllAssessments();
      const allResponses = await db.getAllResponses();
      const allProfiles = await db.getAllProfiles();

      setAssessments(allAssessments);
      setResponses(allResponses);
      setUsersList(allProfiles);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg('');
    setCreateErr('');

    if (newPassword.length < 8) {
      setCreateErr('Password must be at least 8 characters long.');
      return;
    }

    setCreatingUser(true);
    try {
      await signUpWithEmail(newEmail, newPassword, newFullName, newRole);
      setCreateMsg(`✅ Account successfully created for ${newFullName} (${newRole})!`);
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');
      loadAdminData();
    } catch (err: any) {
      setCreateErr(err.message || 'Failed to create account.');
    } finally {
      setCreatingUser(false);
    }
  };

  // Infographic Calculations
  const facultyCount = usersList.filter(u => u.role === 'faculty').length;
  const studentCount = usersList.filter(u => u.role === 'student').length;
  const totalSubmissions = responses.length;

  const avgOverallScore = totalSubmissions > 0
    ? (responses.reduce((sum, r) => sum + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0), 0) / totalSubmissions).toFixed(1)
    : '0';

  // Section-wise metrics
  const sectionStats: Record<string, { count: number; totalPct: number }> = {};
  responses.forEach(r => {
    const sec = r.roll_number?.toUpperCase().startsWith('24') ? '1st Year'
      : r.roll_number?.toUpperCase().startsWith('23') ? '2nd Year'
      : r.roll_number?.toUpperCase().startsWith('22') ? '3rd Year'
      : r.roll_number?.toUpperCase().startsWith('21') ? '4th Year'
      : 'General Section';

    const pct = r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0;
    if (!sectionStats[sec]) {
      sectionStats[sec] = { count: 0, totalPct: 0 };
    }
    sectionStats[sec].count += 1;
    sectionStats[sec].totalPct += pct;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* SuperAdmin Top Header */}
      <div className="bg-[#002147] text-white p-6 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest mb-1">
            <span>🛡️ System SuperAdmin Portal</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">University Oversight & Control</h1>
          <p className="text-slate-300 text-xs mt-1 font-medium">Manage user accounts, view infographics, and control system registration access.</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-right">
          <span className="text-[10px] font-bold text-slate-300 uppercase block">Logged in as</span>
          <span className="text-sm font-black text-amber-400">{profile?.full_name || user?.email}</span>
        </div>
      </div>

      {/* Security Controls: Hide/Show Signup Toggle */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-[#002147]">Public Registration Control</h3>
            <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
              isSignupHidden ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {isSignupHidden ? 'Registration Hidden' : 'Registration Public'}
            </span>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed font-medium">
            Toggle this switch to completely hide or reveal the public Sign Up page across the application navigation and routes.
          </p>
        </div>

        <button
          onClick={toggleHideSignup}
          className={`px-6 py-3 rounded-2xl text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0 ${
            isSignupHidden
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
              : 'bg-[#b01c1e] hover:bg-[#851415] text-white'
          }`}
        >
          {isSignupHidden ? '🔓 Reveal Public Signup Page' : '🔒 Hide Public Signup Page'}
        </button>
      </div>

      {/* System Infographics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Faculty Accounts</span>
          <p className="text-3xl font-black text-[#002147] mt-1 font-mono">{facultyCount}</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Student Accounts</span>
          <p className="text-3xl font-black text-teal-800 mt-1 font-mono">{studentCount}</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Created Assessments</span>
          <p className="text-3xl font-black text-[#b01c1e] mt-1 font-mono">{assessments.length}</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Submissions</span>
          <p className="text-3xl font-black text-purple-900 mt-1 font-mono">{totalSubmissions}</p>
        </div>
      </div>

      {/* Year-wise Performance Infographics */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
        <h3 className="text-base font-black text-[#002147] uppercase tracking-wider">Year-wise & Section Infographic Analytics</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.entries(sectionStats).map(([sec, stat]) => {
            const avgPct = stat.count > 0 ? Math.round(stat.totalPct / stat.count) : 0;
            return (
              <div key={sec} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-xs font-bold text-[#002147] block mb-1">{sec}</span>
                <div className="text-2xl font-black text-slate-800 font-mono">{stat.count} <span className="text-xs text-slate-500 font-normal">attempts</span></div>
                <div className="text-xs font-bold text-teal-800 mt-1">Avg Score: {avgPct}%</div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                  <div className="bg-teal-600 h-full" style={{ width: `${avgPct}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create User Account Panel */}
        <div className="lg:col-span-1 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-black text-[#002147]">Create User Account</h3>
            <p className="text-slate-500 text-xs mt-0.5">SuperAdmin authorization to issue new accounts directly.</p>
          </div>

          {createMsg && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl">{createMsg}</div>}
          {createErr && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">{createErr}</div>}

          <form onSubmit={handleCreateAccount} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Account Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as 'faculty' | 'student')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
              >
                <option value="faculty">Faculty Member</option>
                <option value="student">Student</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Full Name</label>
              <input
                required
                type="text"
                placeholder="e.g. Dr. K. Sharma"
                value={newFullName}
                onChange={e => setNewFullName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#b01c1e]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Email Address</label>
              <input
                required
                type="email"
                placeholder="e.g. sharma@anurag.edu.in"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#b01c1e]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Initial Password</label>
              <input
                required
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#b01c1e]"
              />
            </div>

            <button
              type="submit"
              disabled={creatingUser}
              className="w-full mt-2 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {creatingUser ? 'Creating...' : '+ Create Account'}
            </button>
          </form>
        </div>

        {/* Directory of System Accounts */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-black text-[#002147]">Registered Accounts Directory</h3>
            <span className="text-xs text-slate-500 font-mono">Total {usersList.length} Accounts</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3">Full Name</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3 text-center">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-[#002147]">{u.full_name}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono">{u.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.role === 'admin'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : u.role === 'faculty'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-teal-100 text-teal-800 border border-teal-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* All Submissions Audit Master Table */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-[#002147]">Master Student Submissions Audit</h3>
            <p className="text-slate-500 text-xs">Full records of student test attempts across all university assessments.</p>
          </div>
          <span className="text-xs text-slate-500 font-mono">{responses.length} Submissions</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <th className="px-4 py-3">Roll No</th>
                <th className="px-4 py-3">Student Name & Email</th>
                <th className="px-4 py-3 text-center">Assessment Code</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Time</th>
                <th className="px-4 py-3">Submitted At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {responses.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-bold text-[#002147]">{r.roll_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-800">{r.student_name || 'Student'}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{r.student_email || 'No Email'}</div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-bold text-teal-800">{r.assessment_id}</td>
                  <td className="px-4 py-3 text-center font-mono font-bold text-[#b01c1e]">{r.score} / {r.total_questions}</td>
                  <td className="px-4 py-3 text-center font-mono text-slate-600">{r.time_taken}s</td>
                  <td className="px-4 py-3 text-slate-500 text-[11px]">{new Date(r.submitted_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdmin;
