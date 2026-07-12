
import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const Success: React.FC = () => {
  const location = useLocation();
  const { score, total, autoSubmitted, violations } = location.state || { score: 0, total: 0 };
  const percentage = Math.round((score / total) * 100);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
        {autoSubmitted ? (
          <>
            <div className="w-24 h-24 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-8 animate-pulse">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h1 className="text-4xl font-extrabold mb-2">Assessment Auto-Submitted</h1>
            <p className="text-red-400 font-bold text-sm mb-2">Auto-submitted due to integrity violations ({violations} alerts).</p>
            <p className="text-slate-400 text-sm mb-10 max-w-md">You cannot reattempt until your faculty grants permission. Contact your instructor to request a retake.</p>
          </>
        ) : (
          <>
            <div className="w-24 h-24 bg-teal-500/20 text-teal-500 rounded-full flex items-center justify-center mb-8 animate-bounce">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h1 className="text-4xl font-extrabold mb-4">Assessment Submitted!</h1>
            <p className="text-xl text-slate-400 mb-12">Your response has been recorded successfully.</p>
          </>
        )}

        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl w-full max-w-sm mb-12 shadow-2xl">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mb-2">Final Score</p>
            <div className="text-6xl font-black text-white mb-4">
                {score}<span className="text-slate-700">/</span>{total}
            </div>
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mb-4">
                <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-teal-500" 
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
            <p className="text-teal-400 font-bold text-lg">{percentage}% Accuracy</p>
        </div>

        <Link to="/" className="text-slate-400 hover:text-white flex items-center gap-2 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Return to Homepage
        </Link>
    </div>
  );
};

export default Success;
