import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { Assessment, Response, Question } from '../types';
import { useAuth } from '../authContext';
import { emailService } from '../emailService';

const FacultyDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const assessmentId = searchParams.get('id');
  const { user, profile } = useAuth();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>('ALL');

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

  // Section / Year extraction from roll number or section field
  const getSectionFromRollNo = (rollNo: string): string => {
    if (!rollNo) return 'General';
    const upper = rollNo.toUpperCase();
    if (upper.startsWith('24')) return '1st Year';
    if (upper.startsWith('23')) return '2nd Year';
    if (upper.startsWith('22')) return '3rd Year';
    if (upper.startsWith('21')) return '4th Year';
    return 'General Section';
  };

  // Unique sections list
  const availableSections = ['ALL', ...Array.from(new Set(responses.map(r => getSectionFromRollNo(r.roll_number))))];

  // Filtered responses based on selected section/year
  const filteredResponses = selectedSection === 'ALL'
    ? responses
    : responses.filter(r => getSectionFromRollNo(r.roll_number) === selectedSection);

  const downloadCSV = () => {
    if (!filteredResponses.length || !selectedAssessment) return;

    const headers = ['Roll Number', 'Section/Year', 'Student Name', 'Student Email', 'Score', 'Total Questions', 'Accuracy (%)', 'Time Taken (s)', 'Submitted At'];
    const rows = filteredResponses.map(r => {
      const acc = questions.length > 0 ? Math.round((r.score / questions.length) * 100) : 0;
      return [
        r.roll_number,
        getSectionFromRollNo(r.roll_number),
        `"${r.student_name || 'N/A'}"`,
        `"${r.student_email || 'N/A'}"`,
        r.score,
        r.total_questions,
        acc,
        r.time_taken,
        new Date(r.submitted_at).toLocaleString()
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `results_${selectedAssessment.title.replace(/\s+/g, '_')}_${selectedSection}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- STATS CALCULATIONS ---
  const totalSubmissions = filteredResponses.length;

  const avgScore = totalSubmissions > 0
    ? (filteredResponses.reduce((sum, r) => sum + r.score, 0) / totalSubmissions).toFixed(1)
    : '0';

  const avgTime = totalSubmissions > 0
    ? Math.round(filteredResponses.reduce((sum, r) => sum + r.time_taken, 0) / totalSubmissions)
    : 0;

  const highestScore = totalSubmissions > 0
    ? Math.max(...filteredResponses.map(r => r.score))
    : 0;

  const lowestScore = totalSubmissions > 0
    ? Math.min(...filteredResponses.map(r => r.score))
    : 0;

  // Grade Distribution (High >= 80%, Medium 50-79%, Needs Work < 50%)
  const gradeDistribution = {
    high: filteredResponses.filter(r => questions.length > 0 && (r.score / questions.length) >= 0.8).length,
    medium: filteredResponses.filter(r => questions.length > 0 && (r.score / questions.length) >= 0.5 && (r.score / questions.length) < 0.8).length,
    low: filteredResponses.filter(r => questions.length > 0 && (r.score / questions.length) < 0.5).length,
  };

  // Calculate success rate per question
  const getQuestionStats = () => {
    if (totalSubmissions === 0 || questions.length === 0) return [];

    return questions.map((q, idx) => {
      let correctCount = 0;
      filteredResponses.forEach(r => {
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
    }).sort((a, b) => a.pct - b.pct);
  };

  const questionStats = getQuestionStats();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center text-xs font-bold text-slate-600 uppercase tracking-wider bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm">
        <span className="flex items-center gap-2">
          <span>🏛️</span>
          <span className="text-[#002147] font-black">Anurag University Faculty Hub</span>
        </span>
        <span className="text-teal-700 font-bold">
          ● Assessment Database Active
        </span>
      </div>

      {!selectedAssessment && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-black text-[#002147] tracking-tight">Your Assessments</h1>
              <p className="text-slate-600 text-xs mt-1 font-medium">Select an assessment to view student grades, section-wise reports, and analytics.</p>
            </div>
            <button
              onClick={() => navigate('/create')}
              className="bg-[#b01c1e] hover:bg-[#851415] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-2"
            >
              + Create Assessment
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-[#b01c1e] rounded-full animate-spin"></div>
            </div>
          ) : assessments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assessments.map(a => (
                <div
                  key={a.id}
                  className="bg-white border border-slate-200 p-6 rounded-3xl hover:border-[#b01c1e]/40 transition-all cursor-pointer group flex flex-col justify-between min-h-[180px] shadow-sm hover:shadow-md"
                  onClick={() => loadAssessment(a.id)}
                >
                  <div>
                    <h3 className="font-black text-lg text-[#002147] mb-1 group-hover:text-[#b01c1e] transition-colors leading-snug">{a.title}</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-4">{a.subject} • {a.class_section || 'All Sections'}</p>
                  </div>
                  <div className="flex justify-between items-end border-t border-slate-100 pt-4">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Access Code</span>
                      <span className="text-base font-mono font-black text-[#002147] tracking-wider uppercase">{a.id}</span>
                    </div>
                    <span className="text-xs font-bold text-[#b01c1e] group-hover:translate-x-1 transition-transform">Analyze →</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center border border-dashed border-slate-300 rounded-3xl bg-white">
              <h3 className="text-base font-bold text-slate-700">No assessments created yet</h3>
              <p className="text-slate-500 text-xs max-w-xs mx-auto mt-1 mb-6">Create a crossword assessment to publish to your students.</p>
              <button
                onClick={() => navigate('/create')}
                className="px-5 py-2.5 bg-[#b01c1e] hover:bg-[#851415] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                Create First Assessment
              </button>
            </div>
          )}
        </div>
      )}

      {selectedAssessment && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <button
                onClick={() => {
                  setSelectedAssessment(null);
                  loadAssessmentsList();
                }}
                className="text-xs font-bold text-[#b01c1e] uppercase tracking-wider hover:underline mb-1 flex items-center gap-1 cursor-pointer"
              >
                ← Back to All Assessments
              </button>
              <h1 className="text-2xl md:text-3xl font-black text-[#002147] tracking-tight leading-tight">{selectedAssessment.title}</h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{selectedAssessment.subject} • Class: {selectedAssessment.class_section || 'All Sections'}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center min-w-[180px]">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assessment Code</p>
                <div className="text-2xl font-mono font-black text-[#002147] tracking-widest uppercase mb-1">
                  {selectedAssessment.id}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAssessment.id);
                    alert('Code copied to clipboard!');
                  }}
                  className="text-[10px] font-bold text-slate-600 hover:text-[#002147] transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                >
                  Copy Share Code
                </button>
              </div>
            </div>
          </div>

          {/* Section & Year Filter Toolbar */}
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filter Section / Year:</span>
              <div className="flex flex-wrap gap-2">
                {availableSections.map(sec => (
                  <button
                    key={sec}
                    onClick={() => setSelectedSection(sec)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedSection === sec
                        ? 'bg-[#b01c1e] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={downloadCSV}
                disabled={totalSubmissions === 0}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                📥 Export CSV Report
              </button>
              <button
                onClick={() => window.print()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                🖨️ Print Report
              </button>
            </div>
          </div>

          {/* Aggregate Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Submissions</span>
              <p className="text-2xl font-black text-[#002147] mt-1 font-mono">{totalSubmissions}</p>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Average Score</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-[#002147] font-mono">{avgScore}</span>
                <span className="text-slate-400 text-xs font-bold">/ {questions.length}</span>
              </div>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Avg Duration</span>
              <p className="text-2xl font-black text-[#002147] mt-1 font-mono">{avgTime}s</p>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Highest / Lowest</span>
              <p className="text-2xl font-black text-[#002147] mt-1 font-mono">
                {highestScore} <span className="text-slate-400 text-sm">/</span> {lowestScore}
              </p>
            </div>
          </div>

          {/* Class Grade Performance Distribution Chart */}
          {totalSubmissions > 0 && (
            <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-3 shadow-sm">
              <h3 className="text-sm font-bold text-[#002147] uppercase tracking-wider">Class Grade Distribution ({selectedSection})</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-center">
                  <div className="text-xs font-bold text-emerald-800 uppercase">High Mastery (80-100%)</div>
                  <div className="text-2xl font-black text-slate-800 font-mono mt-1">{gradeDistribution.high} <span className="text-xs text-slate-500 font-normal">students</span></div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-emerald-600 h-full" style={{ width: `${Math.round((gradeDistribution.high / totalSubmissions) * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-center">
                  <div className="text-xs font-bold text-amber-800 uppercase">Average (50-79%)</div>
                  <div className="text-2xl font-black text-slate-800 font-mono mt-1">{gradeDistribution.medium} <span className="text-xs text-slate-500 font-normal">students</span></div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-amber-600 h-full" style={{ width: `${Math.round((gradeDistribution.medium / totalSubmissions) * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 p-3.5 rounded-2xl text-center">
                  <div className="text-xs font-bold text-red-800 uppercase">Needs Revision (&lt;50%)</div>
                  <div className="text-2xl font-black text-slate-800 font-mono mt-1">{gradeDistribution.low} <span className="text-xs text-slate-500 font-normal">students</span></div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-red-600 h-full" style={{ width: `${Math.round((gradeDistribution.low / totalSubmissions) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Student Submissions Table */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-lg font-bold text-[#002147]">Student Scores & Submissions</h3>
                <span className="text-xs text-slate-500 font-mono">Showing {filteredResponses.length} records</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3">Roll No</th>
                      <th className="px-4 py-3">Student Name & Email</th>
                      <th className="px-4 py-3 text-center">Score</th>
                      <th className="px-4 py-3">Accuracy</th>
                      <th className="px-4 py-3 text-center">Time</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredResponses.length > 0 ? filteredResponses.map(r => {
                      const accuracy = questions.length > 0 ? Math.round((r.score / questions.length) * 100) : 0;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3.5 font-mono text-[#002147] font-bold text-xs">{r.roll_number}</td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-800 text-xs">{r.student_name || 'Student'}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{r.student_email || 'No email registered'}</div>
                          </td>
                          <td className="px-4 py-3.5 text-center font-mono text-xs">
                            <span className="font-bold text-[#002147]">{r.score}</span>
                            <span className="text-slate-400 font-bold"> / {questions.length}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <div className="h-full bg-teal-600" style={{ width: `${accuracy}%` }}></div>
                              </div>
                              <span className="text-xs font-bold text-teal-800 font-mono">{accuracy}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 text-center font-mono text-xs">{r.time_taken}s</td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => setActiveStudentResponse(r)}
                                className="px-2.5 py-1 bg-[#002147] hover:bg-[#001733] text-white rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer shadow-sm"
                              >
                                Review & Feedback
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-medium italic text-xs">
                          No student submissions found for section filter "{selectedSection}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Concept Success Rates */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-lg font-bold text-[#002147] px-1">Concept Analytics</h3>
              <div className="bg-white border border-slate-200 p-5 rounded-3xl space-y-4 shadow-sm">
                <div>
                  <h4 className="text-xs font-bold text-[#002147] mb-0.5">Question Success Rate</h4>
                  <p className="text-slate-500 text-[11px]">Sorted from lowest to highest accuracy percentage.</p>
                </div>

                {totalSubmissions === 0 ? (
                  <p className="text-slate-400 text-xs italic py-8 text-center">Analytics will appear once students submit responses.</p>
                ) : (
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
                    {questionStats.map((qs, idx) => {
                      const needsReview = qs.pct < 50;
                      return (
                        <div key={qs.id || idx} className="space-y-1.5 pb-2.5 border-b border-slate-100 last:border-0">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="font-mono text-[#002147] font-bold text-xs uppercase">{qs.word}</span>
                              <p className="text-slate-600 text-[10px] leading-snug">{qs.clue}</p>
                            </div>
                            <span className={`text-[11px] font-mono font-bold shrink-0 px-2 py-0.5 rounded ${
                              needsReview
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-teal-100 text-teal-800 border border-teal-200'
                            }`}>
                              {qs.pct}%
                            </span>
                          </div>

                          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${needsReview ? 'bg-red-600' : 'bg-teal-600'}`}
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

      {/* INDIVIDUAL STUDENT RESPONSE & FEEDBACK MODAL */}
      {activeStudentResponse && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveStudentResponse(null)}>
          <div className="bg-white border border-slate-200 p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-[#b01c1e] uppercase tracking-wider">Individual Student Performance</span>
                <h3 className="text-xl font-black text-[#002147]">{activeStudentResponse.student_name}</h3>
                <p className="text-slate-500 font-mono text-xs">Roll No: {activeStudentResponse.roll_number} • {activeStudentResponse.student_email || 'No Email'}</p>
              </div>
              <button
                onClick={() => setActiveStudentResponse(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Score</span>
                <p className="text-xl font-black text-[#002147] font-mono mt-0.5">
                  {activeStudentResponse.score} <span className="text-slate-400 text-xs">/ {questions.length}</span>
                </p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Accuracy</span>
                <p className="text-xl font-black text-teal-700 font-mono mt-0.5">
                  {questions.length > 0 ? Math.round((activeStudentResponse.score / questions.length) * 100) : 0}%
                </p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Time</span>
                <p className="text-xl font-black text-[#002147] font-mono mt-0.5">{activeStudentResponse.time_taken}s</p>
              </div>
            </div>

            {/* Performance Feedback Box */}
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs space-y-1">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Instructor AI Feedback</span>
              <p className="text-slate-700 text-xs leading-relaxed font-medium">
                {questions.length > 0 && (activeStudentResponse.score / questions.length) >= 0.8
                  ? '🌟 Excellent performance! Student showed strong command of key terms and concepts.'
                  : questions.length > 0 && (activeStudentResponse.score / questions.length) >= 0.5
                  ? '👍 Good attempt. Student solved most core clues with minor concept gaps.'
                  : '⚠️ Student requires revision on fundamental course topics.'}
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Question Breakdown</h4>
              <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                {questions.map((q, idx) => {
                  const qId = q.id || idx.toString();
                  const isCorrect = activeStudentResponse.answers_json?.[qId] === 'true';

                  return (
                    <div key={q.id || idx} className="flex justify-between items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <div>
                        <span className="font-mono text-[#002147] text-xs font-bold uppercase">{q.word}</span>
                        <p className="text-slate-600 text-[10px]">{q.clue}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        isCorrect
                          ? 'bg-teal-100 text-teal-800 border border-teal-200'
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {isCorrect ? 'Correct ✓' : 'Incorrect ✗'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {activeStudentResponse.student_email && selectedAssessment && (
                <button
                  onClick={async () => {
                    const ok = await emailService.sendStudentResultEmail({
                      studentName: activeStudentResponse.student_name || 'Student',
                      studentEmail: activeStudentResponse.student_email!,
                      rollNumber: activeStudentResponse.roll_number,
                      assessmentTitle: selectedAssessment.title,
                      subject: selectedAssessment.subject,
                      score: activeStudentResponse.score,
                      totalQuestions: questions.length,
                      timeTakenSeconds: activeStudentResponse.time_taken
                    });
                    if (ok) alert(`Result email sent to ${activeStudentResponse.student_email}!`);
                  }}
                  className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                >
                  ✉️ Resend Email
                </button>
              )}
              <button
                onClick={() => setActiveStudentResponse(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer border border-slate-300"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`Allow re-attempt for student ${activeStudentResponse.student_name || activeStudentResponse.roll_number}?`)) return;
                  try {
                    await db.allowReattempt(activeStudentResponse.assessment_id, activeStudentResponse.roll_number);
                    setActiveStudentResponse(null);
                    if (selectedAssessment) loadAssessment(selectedAssessment.id);
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
                className="px-4 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
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
