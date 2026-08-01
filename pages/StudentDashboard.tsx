import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useAuth } from '../authContext';
import { Response } from '../types';

const StudentDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [myResponses, setMyResponses] = useState<Response[]>([]);

  useEffect(() => {
    if (user?.email) {
      loadStudentData(user.email);
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadStudentData = async (email: string) => {
    setLoading(true);
    try {
      const data = await db.getStudentResponses(email);
      setMyResponses(data);
    } catch (err) {
      console.error('Failed to load student responses:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalAttempted = myResponses.length;
  const avgAccuracy = totalAttempted > 0
    ? Math.round(myResponses.reduce((sum, r) => sum + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0), 0) / totalAttempted)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] font-bold text-teal-800 uppercase tracking-widest block mb-1">👨‍🎓 Student Learning Hub</span>
          <h1 className="text-3xl font-black text-[#002147] tracking-tight">Welcome, {profile?.full_name || user?.email}</h1>
          <p className="text-slate-600 text-xs mt-1 font-medium">Track your completed crossword assessments, scores, and accuracy performance.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center min-w-[120px]">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">Tests Solved</span>
            <span className="text-2xl font-black text-[#002147] font-mono">{totalAttempted}</span>
          </div>
          <div className="bg-teal-50 border border-teal-200 p-3 rounded-2xl text-center min-w-[120px]">
            <span className="text-[9px] font-bold text-teal-800 uppercase block">Avg Accuracy</span>
            <span className="text-2xl font-black text-teal-900 font-mono">{avgAccuracy}%</span>
          </div>
        </div>
      </div>

      {/* Attempt History Table */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-black text-[#002147]">Your Attempt History</h3>
          <span className="text-xs text-slate-500 font-mono">{totalAttempted} Records</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#002147] rounded-full animate-spin"></div>
          </div>
        ) : myResponses.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3">Assessment Code</th>
                  <th className="px-4 py-3">Hall Ticket / Roll No</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3">Accuracy</th>
                  <th className="px-4 py-3 text-center">Time Taken</th>
                  <th className="px-4 py-3">Submitted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myResponses.map(r => {
                  const accuracy = r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3.5 font-mono font-bold text-[#002147]">{r.assessment_id}</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{r.roll_number}</td>
                      <td className="px-4 py-3.5 text-center font-mono font-bold text-[#b01c1e]">
                        {r.score} / {r.total_questions}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div className="h-full bg-teal-600" style={{ width: `${accuracy}%` }}></div>
                          </div>
                          <span className="text-xs font-bold text-teal-800 font-mono">{accuracy}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-slate-600">{r.time_taken}s</td>
                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">{new Date(r.submitted_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-500 italic text-xs border border-dashed border-slate-300 rounded-2xl">
            No completed assessment records found for your registered email address ({user?.email}).
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
