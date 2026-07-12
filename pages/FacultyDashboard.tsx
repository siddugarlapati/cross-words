import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { Assessment, Response, Question } from '../types';
import { useAuth } from '../authContext';

const FacultyDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const assessmentId = searchParams.get('id');
  const { user, profile, isLocalMode } = useAuth();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state for student response details
  const [activeStudentResponse, setActiveStudentResponse] = useState<Response | null>(null);

  useEffect(() => {
    if (assessmentId) {
      loadAssessment(assessmentId);
    } else if (user) {
      loadAssessmentsList();
    }
  }, [assessmentId, user]);

  const loadAssessmentsList = async () => {
    setLoading(true);
    try {
      const facultyName = profile?.full_name || user?.email || '';
      const data = await db.getAssessmentsByFaculty(facultyName);
      setAssessments(data);
    } catch (error) {
      console.error("Failed to load assessments list:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssessment = async (id: string) => {
    setLoading(true);
    try {
      const data = await db.getAssessment(id);
      if (data) {
        setSelectedAssessment(data.assessment);
        setQuestions(data.questions);
        const resData = await db.getResponses(id);
        setResponses(resData);
      }
    } catch (error) {
      console.error("Failed to load assessment details:", error);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!responses.length || !selectedAssessment) return;
    
    const headers = ['Roll Number', 'Name', 'Score', 'Total Questions', 'Time Taken (s)', 'Submitted At'];
    const rows = responses.map(r => [
      r.roll_number,
      r.student_name || 'N/A',
      r.score,
      r.total_questions,
      r.time_taken,
      new Date(r.submitted_at).toLocaleString()
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `results_${selectedAssessment.title}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- STATS CALCULATIONS ---
  const totalSubmissions = responses.length;
  
  const avgScore = totalSubmissions > 0 
    ? (responses.reduce((sum, r) => sum + r.score, 0) / totalSubmissions).toFixed(1)
    : '0';

  const avgTime = totalSubmissions > 0 
    ? Math.round(responses.reduce((sum, r) => sum + r.time_taken, 0) / totalSubmissions)
    : 0;

  const highestScore = totalSubmissions > 0 
    ? Math.max(...responses.map(r => r.score))
    : 0;

  const lowestScore = totalSubmissions > 0 
    ? Math.min(...responses.map(r => r.score))
    : 0;

  // Calculate success rate per question
  const getQuestionStats = () => {
    if (totalSubmissions === 0 || questions.length === 0) return [];

    return questions.map((q, idx) => {
      let correctCount = 0;
      responses.forEach(r => {
        // Read from answers_json
        const qId = q.id || idx.toString();
        const ans = r.answers_json?.[qId];
        if (ans === 'true') {
          correctCount++;
        }
      });

      const pct = Math.round((correctCount / totalSubmissions) * 100);
      return {
        ...q,
        correctCount,
        pct
      };
    }).sort((a, b) => a.pct - b.pct); // hardest first
  };

  const questionStats = getQuestionStats();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Banner Indicator */}
      <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-900/30 px-6 py-3 rounded-2xl border border-slate-800/80">
        <span>Dashboard Hub</span>
        <span className={isLocalMode ? 'text-purple-400' : 'text-teal-400'}>
          ● {isLocalMode ? 'Local Database Mode' : 'Cloud Supabase Connected'}
        </span>
      </div>

      {!selectedAssessment && (
        <div className="space-y-6">
          <div className="mb-4">
            <h1 className="text-4xl font-black text-white">Your Assessments</h1>
            <p className="text-slate-400 text-sm mt-1">Select an assessment below to view student submissions and concept analytics.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-slate-800 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : assessments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assessments.map(a => (
                <div 
                  key={a.id} 
                  className="p-6 bg-slate-900/40 border border-slate-800 rounded-[2rem] hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/5 transition-all cursor-pointer group flex flex-col justify-between min-h-[180px]"
                  onClick={() => loadAssessment(a.id)}
                >
                  <div>
                    <h3 className="font-black text-xl text-white mb-1 group-hover:text-purple-400 transition-colors leading-snug">{a.title}</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">{a.subject} • {a.class_section || 'All Sections'}</p>
                  </div>
                  <div className="flex justify-between items-end border-t border-slate-800/50 pt-4">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Access Code</span>
                      <span className="text-base font-mono font-black text-teal-400 tracking-wider uppercase">{a.id}</span>
                    </div>
                    <span className="text-xs font-black text-purple-400 group-hover:translate-x-1 transition-transform">Analyze →</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/10">
              <svg className="w-16 h-16 text-slate-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <h3 className="text-lg font-bold text-slate-400">No assessments found</h3>
              <p className="text-slate-600 text-sm max-w-xs mx-auto mt-1 mb-6">Create a crossword assessment to share with your students.</p>
              <button 
                onClick={() => navigate('/create')}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold tracking-wider transition-all"
              >
                Create Now
              </button>
            </div>
          )}
        </div>
      )}

      {selectedAssessment && (
        <div className="space-y-8">
          {/* Header Card */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-900/40 p-8 rounded-3xl border border-slate-800">
            <div className="space-y-2">
              <button 
                onClick={() => {
                  setSelectedAssessment(null);
                  loadAssessmentsList();
                }} 
                className="text-xs font-black text-purple-400 uppercase tracking-widest hover:underline mb-2 flex items-center gap-1 cursor-pointer"
              >
                ← Return to Assessments
              </button>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">{selectedAssessment.title}</h1>
              <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">{selectedAssessment.subject} • Class: {selectedAssessment.class_section || 'All Sections'}</p>
            </div>
            
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl text-center min-w-[220px] shadow-inner shadow-black/80 ring-1 ring-teal-500/10">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Share Access Code</p>
              <div className="text-3xl font-mono font-black text-teal-400 tracking-widest uppercase mb-2">
                {selectedAssessment.id}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(selectedAssessment.id);
                  alert('Code copied to clipboard!');
                }}
                className="text-[10px] font-black text-slate-500 hover:text-white transition-colors flex items-center gap-1 mx-auto cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                Copy Code
              </button>
            </div>
          </div>

          {/* Aggregate Analytics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Submissions</span>
              <p className="text-3xl font-black text-white mt-2 font-mono">{totalSubmissions}</p>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Average Score</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-black text-white font-mono">{avgScore}</span>
                <span className="text-slate-500 text-sm font-bold">/ {questions.length}</span>
              </div>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg Time Spent</span>
              <p className="text-3xl font-black text-white mt-2 font-mono">{avgTime}s</p>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">High / Low Score</span>
              <p className="text-3xl font-black text-white mt-2 font-mono">
                {highestScore} <span className="text-slate-600 text-lg">/</span> {lowestScore}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Submissions List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xl font-bold text-slate-200">Submissions</h3>
                {totalSubmissions > 0 && (
                  <button 
                    onClick={downloadCSV}
                    className="bg-teal-900/20 text-teal-400 border border-teal-900/30 hover:bg-teal-900/40 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Export CSV
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-[2rem] border border-slate-800 bg-slate-900/20 backdrop-blur-sm shadow-xl">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      <th className="px-6 py-4">Roll No.</th>
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4 text-center">Score</th>
                      <th className="px-6 py-4">Accuracy</th>
                      <th className="px-6 py-4 text-center">Time</th>
                      <th className="px-6 py-4 text-center">Violations</th>
                      <th className="px-6 py-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {responses.length > 0 ? responses.map(r => {
                      const accuracy = questions.length > 0 ? Math.round((r.score / questions.length) * 100) : 0;
                      const violations = parseInt(r.answers_json?.['_violations'] || '0', 10);
                      const hasViolations = violations > 0;
                      return (
                        <tr key={r.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="px-6 py-4.5 font-mono text-purple-400 font-bold text-sm">{r.roll_number}</td>
                          <td className="px-6 py-4.5 font-medium text-slate-200 text-sm">
                            <div>{r.student_name || 'Anonymous'}</div>
                            {r.answers_json?.['_college'] && (
                              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                {r.answers_json['_college']}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4.5 text-center font-mono">
                            <span className="font-black text-white">{r.score}</span>
                            <span className="text-slate-600 font-bold"> / {questions.length}</span>
                          </td>
                          <td className="px-6 py-4.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-teal-500" style={{ width: `${accuracy}%` }}></div>
                              </div>
                              <span className="text-xs font-black text-teal-400 font-mono">{accuracy}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4.5 text-slate-400 text-center font-mono text-xs">{r.time_taken}s</td>
                          <td className="px-6 py-4.5 text-center font-mono">
                            {hasViolations ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                {violations} alerts
                              </span>
                            ) : (
                              <span className="text-slate-500 text-xs font-bold">0</span>
                            )}
                          </td>
                          <td className="px-6 py-4.5 text-right">
                            <button
                              onClick={() => setActiveStudentResponse(r)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg text-[10px] font-black uppercase text-slate-400 cursor-pointer transition-colors"
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center text-slate-500 font-medium italic">
                          Waiting for students to join using code {selectedAssessment.id}...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Question Success Rate Analytics */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xl font-bold text-slate-200 px-1">Concept Insights</h3>
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Concept Difficulty</h4>
                  <p className="text-slate-500 text-xs">Questions sorted from hardest to easiest based on class success rate.</p>
                </div>

                {totalSubmissions === 0 ? (
                  <p className="text-slate-600 text-xs italic py-10 text-center">Analytics will populate once students submit answers.</p>
                ) : (
                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
                    {questionStats.map((qs, idx) => {
                      const needsReview = qs.pct < 50;
                      return (
                        <div key={qs.id || idx} className="space-y-2 pb-3 border-b border-slate-800/40 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="font-mono text-teal-400 font-bold text-xs uppercase tracking-wide">{qs.word}</span>
                              <p className="text-slate-400 text-[10px] leading-normal mt-0.5">{qs.clue}</p>
                            </div>
                            <span className={`text-xs font-mono font-black shrink-0 px-2 py-0.5 rounded-md ${
                              needsReview 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                            }`}>
                              {qs.pct}% Pass
                            </span>
                          </div>
                          
                          <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${needsReview ? 'bg-red-500' : 'bg-teal-500'}`} 
                              style={{ width: `${qs.pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT RESPONSE DETAIL MODAL */}
      {activeStudentResponse && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-6 animate-slide-up shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Student Response Card</span>
                <h3 className="text-2xl font-black text-white mt-1">{activeStudentResponse.student_name}</h3>
                <p className="text-slate-500 font-mono text-xs font-bold uppercase mt-0.5">Roll No: {activeStudentResponse.roll_number}</p>
              </div>
              <button 
                onClick={() => setActiveStudentResponse(null)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Score Summary */}
            <div className="grid grid-cols-3 gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 text-center">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Score</span>
                <p className="text-2xl font-black text-white font-mono mt-1">
                  {activeStudentResponse.score} <span className="text-slate-600 text-sm">/ {questions.length}</span>
                </p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Time</span>
                <p className="text-2xl font-black text-white font-mono mt-1">{activeStudentResponse.time_taken}s</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Violations</span>
                <p className={`text-2xl font-black font-mono mt-1 ${parseInt(activeStudentResponse.answers_json?.['_violations'] || '0', 10) > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                  {activeStudentResponse.answers_json?.['_violations'] || '0'}
                </p>
              </div>
            </div>

            {/* Question Breakdown */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Answer Breakdown</h4>
              <div className="space-y-3">
                {questions.map((q, idx) => {
                  const qId = q.id || idx.toString();
                  const isCorrect = activeStudentResponse.answers_json?.[qId] === 'true';

                  return (
                    <div key={q.id || idx} className="flex justify-between items-center gap-4 bg-slate-950/20 border border-slate-800/50 p-4 rounded-xl">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-mono text-xs font-bold">{idx + 1}.</span>
                          <span className="font-mono text-white text-sm font-black uppercase tracking-wide">{q.word}</span>
                        </div>
                        <p className="text-slate-400 text-xs pl-5 leading-normal">{q.clue}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md border ${
                        isCorrect 
                          ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' 
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setActiveStudentResponse(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3.5 rounded-xl transition-all cursor-pointer"
              >
                Close Review
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`Allow ${activeStudentResponse.student_name || activeStudentResponse.roll_number} to reattempt this assessment?`)) return;
                  try {
                    await db.allowReattempt(activeStudentResponse.assessment_id, activeStudentResponse.roll_number);
                    setActiveStudentResponse(null);
                    if (selectedAssessment) loadAssessment(selectedAssessment.id);
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
                className="px-5 bg-teal-600 hover:bg-teal-500 text-white font-bold py-3.5 rounded-xl transition-all cursor-pointer text-sm"
              >
                Allow Reattempt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyDashboard;
