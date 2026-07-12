
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';

const Home: React.FC = () => {
  const [assessmentCode, setAssessmentCode] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (assessmentCode.trim()) {
      navigate(`/solve/${assessmentCode.trim()}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-12 text-center relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="max-w-6xl w-full z-10 px-4">
        <div className="animate-slide-up">
          <h1 className="text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-none">
            Learning in
            <br />
            <span className="text-gradient">Another Dimension</span>
          </h1>
          <p className="text-xl text-slate-400 mb-16 leading-relaxed max-w-2xl mx-auto font-medium">
            Transform static lectures into interactive crossword battles. <br className="hidden md:block" />
            Powered by Gemini AI, designed for modern education.
          </p>
        </div>

        <div className={user ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20 animate-slide-up animate-delay-100" : "flex justify-center mb-20 animate-slide-up animate-delay-100"}>
          {/* Faculty Card */}
          {user && (
            <Link to="/create" className="group glass-card p-10 rounded-[2.5rem] text-left flex flex-col h-full hover:-translate-y-2 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-bl-[2.5rem] transition-all group-hover:bg-purple-500/20" />

              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mb-8 border border-slate-700 group-hover:border-purple-500/50 group-hover:bg-purple-500/20 transition-all">
                <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.727 2.903a2 2 0 01-3.577 1.12l-1.914-1.914a2 2 0 00-2.45-.308l-2.903.727a2 2 0 01-1.414-1.96l.477-2.387a2 2 0 00-.547-1.022L1.22 11.22a2 2 0 011.12-3.577l2.903-.727a2 2 0 001.414-1.96l.477-2.387a2 2 0 013.577-1.12l1.914 1.914a2 2 0 002.45.308l2.903-.727a2 2 0 011.414 1.96l-.477 2.387a2 2 0 00.547 1.022l1.782 1.782a2 2 0 01-1.12 3.577l-2.903.727a2 2 0 00-1.414 1.96l-.477 2.387a2 2 0 01-3.577 1.12l-1.914-1.914a2 2 0 00-2.45-.308l-2.903.727a2 2 0 01-1.414-1.96l.477-2.387a2 2 0 00-.547-1.022L1.22 12.78a2 2 0 011.12-3.577l2.903-.727a2 2 0 001.414-1.96l.477-2.387a2 2 0 013.577-1.12l1.914 1.914a2 2 0 002.45.308l2.903-.727a2 2 0 011.414 1.96l-.477 2.387a2 2 0 00.547 1.022l1.782 1.782z" /></svg>
              </div>
              <h3 className="text-3xl font-black mb-4 text-slate-100">Faculty</h3>
              <p className="text-slate-400 font-medium flex-grow mb-8">Generate AI assessments from any PDF or topic in seconds.</p>
              <div className="flex items-center gap-2 text-purple-400 font-bold group-hover:gap-4 transition-all">
                Launch Generator <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </Link>
          )}

          {/* Student Card */}
          <div className={user ? "glass-card p-10 rounded-[2.5rem] text-left flex flex-col h-full ring-2 ring-teal-500/30 relative overflow-hidden" : "glass-card p-10 rounded-[2.5rem] text-left flex flex-col w-full max-w-md ring-2 ring-teal-500/30 relative overflow-hidden"}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-bl-[2.5rem]" />

            <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mb-8 border border-slate-700">
              <svg className="w-7 h-7 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>
            <div className="mb-8">
              <h3 className="text-3xl font-black mb-2 text-slate-100">Student</h3>
              <p className="text-slate-400 font-medium">Join a live session.</p>
            </div>

            <form onSubmit={handleJoin} className="mt-auto relative">
              <input
                className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-teal-500 transition-all font-mono font-bold tracking-widest text-lg uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-600"
                placeholder="Enter Code..."
                value={assessmentCode}
                onChange={(e) => setAssessmentCode(e.target.value)}
              />
              <button className="absolute right-2 top-2 p-2.5 bg-teal-500 hover:bg-teal-400 rounded-xl text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </form>
          </div>

          {/* Analytics Card */}
          {user && (
            <Link to="/dashboard" className="group glass-card p-10 rounded-[2.5rem] text-left flex flex-col h-full hover:-translate-y-2 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-[2.5rem] transition-all group-hover:bg-blue-500/20" />

              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mb-8 border border-slate-700 group-hover:border-blue-500/50 group-hover:bg-blue-500/20 transition-all">
                <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <h3 className="text-3xl font-black mb-4 text-slate-100">Analytics</h3>
              <p className="text-slate-400 font-medium flex-grow mb-8">Deep dive into student performance and class metrics.</p>
              <div className="flex items-center gap-2 text-blue-400 font-bold group-hover:gap-4 transition-all">
                View Dashboard <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
