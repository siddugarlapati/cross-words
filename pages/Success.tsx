import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const Success: React.FC = () => {
  const location = useLocation();
  const { score, totalQuestions, total, autoSubmitted, violations, studentName, assessmentTitle } = location.state || { score: 0, totalQuestions: 0, total: 0 };
  const totalCount = totalQuestions || total || 0;
  const percentage = totalCount > 0 ? Math.round((score / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in min-h-[70vh]">
      {autoSubmitted ? (
        <>
          <div className="w-20 h-20 bg-red-100 border border-red-300 text-red-700 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-black text-[#002147] mb-2">Assessment Auto-Submitted</h1>
          <p className="text-red-600 font-bold text-sm mb-2">Submitted due to integrity alerts ({violations || 0} tab switch violations recorded).</p>
          <p className="text-slate-600 text-xs mb-8 max-w-sm">Contact your faculty member to request a re-attempt permission if needed.</p>
        </>
      ) : (
        <>
          <div className="w-20 h-20 bg-emerald-100 border border-emerald-300 text-emerald-700 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 className="text-3xl font-black text-[#002147] mb-2">Assessment Completed!</h1>
          <p className="text-slate-600 text-sm mb-2 font-medium">Great job, {studentName || 'Student'}! Your answers have been recorded in the database.</p>
          {assessmentTitle && <p className="text-xs font-bold text-[#b01c1e] uppercase tracking-wider mb-6">{assessmentTitle}</p>}
        </>
      )}

      <div className="bg-white border border-slate-200 p-8 rounded-3xl w-full max-w-sm mb-8 shadow-xl">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Score</p>
        <div className="text-5xl font-black text-[#002147] mb-4 font-mono">
          {score} <span className="text-slate-400 font-normal">/</span> {totalCount}
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200">
          <div
            className="h-full bg-teal-600 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <p className="text-teal-800 font-black text-base font-mono">{percentage}% Accuracy</p>
      </div>

      <div className="flex gap-4">
        <Link to="/" className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-300">
          ← Return to Homepage
        </Link>
        <Link to="/student-dashboard" className="px-6 py-2.5 bg-[#002147] hover:bg-[#001733] text-white font-bold rounded-xl text-xs transition-all shadow-sm">
          View Student Dashboard →
        </Link>
      </div>
    </div>
  );
};

export default Success;
