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
      navigate(`/solve/${assessmentCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-8 text-center relative overflow-hidden">
      {/* Ambient Background Radial Accent */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-red-100/50 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-10 -right-20 w-96 h-96 bg-blue-100/50 rounded-full blur-[128px] pointer-events-none" />

      <div className="max-w-5xl w-full z-10 px-4">
        {/* Header Hero Title */}
        <div className="animate-slide-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 mb-6 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#b01c1e] animate-pulse" />
            Anurag University Assessment Platform
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-tight text-[#002147]">
            AI-Powered Educational
            <br />
            <span className="text-[#b01c1e]">
              Crossword Assessments
            </span>
          </h1>

          <p className="text-base md:text-lg text-slate-600 mb-12 leading-relaxed max-w-2xl mx-auto font-medium">
            Turn lecture notes, syllabus topics, or PDFs into interactive, curriculum-aligned crosswords in seconds. Built for high student engagement & instant grading.
          </p>
        </div>

        {/* Primary Action Cards */}
        <div className={user ? "grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 animate-slide-up" : "flex justify-center mb-16 animate-slide-up"}>
          {/* Faculty Card */}
          {user && (
            <Link
              to="/create"
              className="group bg-white p-8 rounded-3xl text-left flex flex-col h-full hover:-translate-y-1 relative overflow-hidden border border-slate-200 shadow-sm hover:border-[#b01c1e]/40 hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-6 border border-red-100 text-[#b01c1e] group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-2xl font-black mb-2 text-[#002147]">Create Assessment</h3>
              <p className="text-slate-600 text-sm flex-grow mb-6">Generate customized crosswords from course topics or PDF uploads using Gemini AI.</p>
              <div className="flex items-center gap-2 text-[#b01c1e] font-bold text-sm group-hover:gap-3 transition-all">
                Launch Creator <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </Link>
          )}

          {/* Student Solve Card */}
          <div className={user ? "bg-white p-8 rounded-3xl text-left flex flex-col h-full border border-teal-200 shadow-sm relative overflow-hidden" : "bg-white p-8 rounded-3xl text-left flex flex-col w-full max-w-md border border-teal-200 shadow-xl relative overflow-hidden"}>
            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mb-6 border border-teal-100 text-teal-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a2 2 0 01-2 2 2 2 0 01-2-2V4zM4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
              </svg>
            </div>
            <div className="mb-6">
              <h3 className="text-2xl font-black mb-1 text-[#002147]">Student Join</h3>
              <p className="text-slate-600 text-sm">Enter the 6-character assessment code provided by your faculty.</p>
            </div>

            <form onSubmit={handleJoin} className="mt-auto relative">
              <input
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-teal-600 font-mono font-bold tracking-widest text-base uppercase text-slate-800 placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400"
                placeholder="Assessment Code (e.g. X7K9A2)..."
                value={assessmentCode}
                onChange={(e) => setAssessmentCode(e.target.value)}
              />
              <button
                type="submit"
                className="absolute right-2 top-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 rounded-xl text-white font-bold transition-all shadow-sm"
              >
                Join
              </button>
            </form>
          </div>

          {/* Analytics Dashboard Card */}
          {user && (
            <Link
              to="/dashboard"
              className="group bg-white p-8 rounded-3xl text-left flex flex-col h-full hover:-translate-y-1 relative overflow-hidden border border-slate-200 shadow-sm hover:border-blue-500/40 hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 border border-blue-100 text-blue-700 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-black mb-2 text-[#002147]">Faculty Dashboard</h3>
              <p className="text-slate-600 text-sm flex-grow mb-6">Review student submissions, scores, attempt timestamps, and manage re-attempts.</p>
              <div className="flex items-center gap-2 text-blue-700 font-bold text-sm group-hover:gap-3 transition-all">
                Open Analytics <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </div>
            </Link>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left border-t border-slate-200 pt-12">
          <div className="p-4 rounded-2xl bg-white border border-slate-200">
            <h4 className="text-base font-bold text-[#002147] mb-1 flex items-center gap-2">
              <span className="text-[#b01c1e]">⚡</span> AI Word Extraction
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Gemini AI automatically parses technical terms and definitions directly from curriculum files or course topics.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200">
            <h4 className="text-base font-bold text-[#002147] mb-1 flex items-center gap-2">
              <span className="text-amber-600">📱</span> Mobile-Optimized Grid
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Students can solve assessments seamlessly on smartphones or tablets with responsive touch cell inputs and live clue highlights.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
