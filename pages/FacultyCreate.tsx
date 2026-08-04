import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateCrossword, FileData } from '../geminiService';
import { generateLayout } from '../layoutGenerator';
import { parseFile } from '../fileParser';
import { db } from '../db';
import { Question } from '../types';
import { useAuth } from '../authContext';

type Step = 'config' | 'generating' | 'review';

const FacultyCreate: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('config');
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isManualMode, setIsManualMode] = useState(false);

  const [formData, setFormData] = useState({
    facultyName: '',
    subject: '',
    title: '',
    academicYear: '1st Year',
    classSection: 'Section A',
    topic: '',
    content: '',
    questionsCount: 10,
    deadline: '',
    startTime: '',
    isScheduled: false
  });

  const [questions, setQuestions] = useState<Omit<Question, 'id' | 'assessment_id'>[]>([]);

  // Pre-fill faculty details
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        facultyName: profile?.full_name || user.email || ''
      }));
    }
  }, [user, profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      const text = await parseFile(file);
      setFormData(prev => ({ ...prev, content: text }));
    } catch (err) {
      console.error("Local file parsing exception:", err);
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      setSelectedFile({ data: base64String, mimeType: file.type || 'application/pdf' });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isManualMode) {
      const initialQuestions = Array(formData.questionsCount).fill(null).map((_, idx) => ({
        word: '',
        clue: '',
        direction: (idx % 2 === 0 ? 'across' : 'down') as 'across' | 'down',
        row: 0,
        col: 0
      }));
      setQuestions(initialQuestions);
      setStep('review');
      return;
    }

    setStep('generating');
    setLoading(true);
    try {
      const effectiveTopic = formData.topic || formData.subject || formData.title || 'General Knowledge';
      const aiResult = await generateCrossword(
        effectiveTopic,
        formData.content,
        formData.questionsCount,
        selectedFile || undefined
      );

      setQuestions(aiResult.questions);
      setStep('review');
    } catch (err) {
      console.error('Generation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Generation failed: ${errorMessage}\n\nPlease check your internet connection or document content.`);
      setStep('config');
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = (index: number, field: keyof Omit<Question, 'id' | 'assessment_id'>, value: any) => {
    const updated = [...questions];
    let cleanedVal = value;

    if (field === 'word') {
      cleanedVal = value.toUpperCase().replace(/[^A-Z]/g, '');
    } else if (field === 'row' || field === 'col') {
      cleanedVal = parseInt(value) || 0;
    }

    updated[index] = {
      ...updated[index],
      [field]: cleanedVal
    };
    setQuestions(updated);
  };

  const handleAutoArrange = () => {
    const filledWords = questions
      .filter(q => q.word.trim().length >= 3)
      .map(q => ({
        word: q.word.trim().toUpperCase(),
        clue: q.clue
      }));

    if (filledWords.length === 0) {
      alert('Please enter at least a few answer words before auto-arranging!');
      return;
    }

    const arranged = generateLayout(filledWords, filledWords.length);

    if (arranged.length === 0) {
      alert('Could not generate a fully connected grid. Ensure words share matching letters!');
      return;
    }

    const newQuestions = arranged.map(p => ({
      word: p.word,
      clue: p.clue,
      direction: p.direction,
      row: p.row,
      col: p.col
    }));

    const unplaced = questions.filter(q => !arranged.some(a => a.word === q.word.toUpperCase()));
    unplaced.forEach(uq => {
      newQuestions.push({
        word: uq.word,
        clue: uq.clue,
        direction: uq.direction,
        row: 0,
        col: 0
      });
    });

    setQuestions(newQuestions);
  };

  const handlePublish = async () => {
    setLoading(true);
    try {
      const validQuestions = questions.filter(q => q.word.trim().length > 0);
      if (validQuestions.length === 0) {
        alert('Please add at least one word before publishing.');
        setLoading(false);
        return;
      }

      const assessmentId = await db.createAssessment({
        title: formData.title || 'Educational Assessment',
        subject: formData.subject || 'General Studies',
        faculty_name: formData.facultyName || profile?.full_name || 'Faculty Member',
        faculty_email: user?.email || undefined,
        deadline: formData.deadline,
        class_section: `${formData.academicYear} • ${formData.classSection || 'Section A'}`,
        start_time: formData.isScheduled && formData.startTime ? formData.startTime : undefined,
      }, validQuestions);

      navigate(`/dashboard?id=${assessmentId}`);
    } catch (err: any) {
      console.error('Publishing exception:', err);
      alert(`Publishing failed: ${err.message || 'Please check your connection or database setup.'}`);
    } finally {
      setLoading(false);
    }
  };

  const getPreviewData = () => {
    const validQuestions = questions.filter(q => q.word.trim().length > 0);
    if (validQuestions.length === 0) return { grid: [], rows: 0, cols: 0, collisions: false, numberGrid: [] };

    let maxR = 0, maxC = 0;
    validQuestions.forEach(q => {
      const len = q.word.length;
      const endR = q.direction === 'across' ? q.row : q.row + len - 1;
      const endC = q.direction === 'across' ? q.col + len - 1 : q.col;
      maxR = Math.max(maxR, endR);
      maxC = Math.max(maxC, endC);
    });

    const rows = Math.max(maxR + 1, 1);
    const cols = Math.max(maxC + 1, 1);

    const grid = Array(rows).fill(null).map(() => Array(cols).fill(''));
    const numberGrid = Array(rows).fill(null).map(() => Array(cols).fill(null));
    let collisions = false;

    validQuestions.forEach((q, idx) => {
      const len = q.word.length;

      if (q.row < rows && q.col < cols) {
        if (!numberGrid[q.row][q.col]) {
          numberGrid[q.row][q.col] = idx + 1;
        }
      }

      for (let i = 0; i < len; i++) {
        const r = q.direction === 'across' ? q.row : q.row + i;
        const c = q.direction === 'across' ? q.col + i : q.col;
        const letter = q.word[i];

        if (r < rows && c < cols) {
          if (grid[r][c] !== '' && grid[r][c] !== letter) {
            collisions = true;
          }
          grid[r][c] = letter;
        }
      }
    });

    return { grid, rows, cols, collisions, numberGrid };
  };

  const preview = getPreviewData();

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center min-h-[60vh]">
        <div className="relative w-28 h-28 mb-10">
          <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[#b01c1e] border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-[#b01c1e] animate-pulse">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <h2 className="text-3xl font-black text-[#002147] mb-4 tracking-tight animate-slide-up">
          Generating Assessment <span className="text-[#b01c1e]">Puzzle</span>...
        </h2>

        <div className="space-y-3 max-w-sm mx-auto animate-slide-up">
          <div className="flex items-center gap-3 text-slate-700">
            <div className="w-2.5 h-2.5 rounded-full bg-[#b01c1e] animate-pulse"></div>
            <span className="text-xs font-bold uppercase tracking-wider text-left">Processing document text...</span>
          </div>
          <div className="flex items-center gap-3 text-slate-600">
            <div className="w-2.5 h-2.5 rounded-full bg-[#002147] animate-pulse"></div>
            <span className="text-xs font-bold uppercase tracking-wider text-left">Extracting curriculum concepts...</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse"></div>
            <span className="text-xs font-bold uppercase tracking-wider text-left">Constructing crossword grid...</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-black text-[#002147]">Review & Edit Crossword</h2>
            <p className="text-slate-600 text-xs mt-1 font-medium">Review the grid layout, modify questions, or change clues before publishing.</p>
          </div>
          <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleAutoArrange}
              className="px-4 py-2.5 bg-[#002147] hover:bg-[#001733] border border-[#002147] rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" /></svg>
              Auto-arrange Grid
            </button>
            <button
              type="button"
              onClick={() => setStep('config')}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
            >
              Back to Form
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={loading || preview.collisions}
              className="px-6 py-2.5 bg-[#b01c1e] hover:bg-[#851415] disabled:opacity-50 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? 'Publishing...' : 'Publish Assessment'}
              {!loading && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>}
            </button>
          </div>
        </div>

        {preview.collisions && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-4 rounded-2xl text-center">
            ⚠️ Grid Collision Detected! Multiple words overlap on conflicting letters. Click "Auto-arrange Grid" or adjust row/col indices manually.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Questions Editor */}
          <div className="lg:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs text-slate-700 font-bold uppercase tracking-wider">Words & Clues ({questions.length})</span>
              <button
                type="button"
                onClick={() => setQuestions(prev => [...prev, { word: '', clue: '', direction: (prev.length % 2 === 0 ? 'across' : 'down'), row: 0, col: 0 }])}
                className="px-3.5 py-2 bg-[#002147] hover:bg-[#001733] rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                + Add Term
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {questions.map((q, idx) => (
                <div key={idx} className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3 relative group shadow-sm hover:border-[#b01c1e]/40 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-[#002147] px-2.5 py-0.5 rounded-full">
                      Term #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuestions(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-600 hover:text-red-800 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Word</label>
                      <input
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-[#b01c1e] font-mono font-black uppercase outline-none focus:border-[#b01c1e] focus:bg-white"
                        value={q.word}
                        placeholder="ANSWER"
                        onChange={(e) => updateQuestion(idx, 'word', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Clue</label>
                      <textarea
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none resize-none focus:border-[#b01c1e] focus:bg-white"
                        value={q.clue}
                        placeholder="Definition clue..."
                        onChange={(e) => updateQuestion(idx, 'clue', e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Dir</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-800 outline-none"
                          value={q.direction}
                          onChange={(e) => updateQuestion(idx, 'direction', e.target.value)}
                        >
                          <option value="across">Across</option>
                          <option value="down">Down</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Row</label>
                        <input
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-800 text-center outline-none"
                          value={q.row}
                          onChange={(e) => updateQuestion(idx, 'row', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Col</label>
                        <input
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-800 text-center outline-none"
                          value={q.col}
                          onChange={(e) => updateQuestion(idx, 'col', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grid Layout Preview */}
          <div className="lg:col-span-1 bg-white border border-slate-200 p-6 rounded-3xl h-fit sticky top-24 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#002147]">Live Grid Preview</h3>
              {preview.grid.length > 0 && (
                <span className="text-[10px] font-bold bg-[#002147] text-white px-2.5 py-0.5 rounded-full">
                  {preview.rows} × {preview.cols}
                </span>
              )}
            </div>

            {preview.grid.length > 0 ? (
              <div className="flex flex-col items-center justify-center bg-slate-50 p-4 rounded-2xl border border-slate-200 overflow-auto max-h-[45vh]">
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: `repeat(${preview.cols}, minmax(28px, 1fr))`,
                    width: 'fit-content'
                  }}
                >
                  {preview.grid.map((row, r) => row.map((cell, c) => {
                    const hasLetter = cell !== '';
                    const qNum = preview.numberGrid[r]?.[c];

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`relative w-8 h-8 border-2 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                          hasLetter
                            ? 'bg-white border-[#002147] text-[#b01c1e] font-mono shadow-sm'
                            : 'bg-slate-100/50 border-slate-200/50'
                        }`}
                      >
                        {qNum && (
                          <span className="absolute top-0.5 left-0.5 text-[8px] text-[#002147] font-black leading-none pointer-events-none select-none">
                            {qNum}
                          </span>
                        )}
                        {cell}
                      </div>
                    );
                  }))}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 italic text-xs border border-dashed border-slate-300 rounded-2xl">
                Add terms to preview crossword grid.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white border border-slate-200 p-6 md:p-10 rounded-3xl shadow-xl">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-[#002147] tracking-tight">Create <span className="text-[#b01c1e]">Assessment</span></h2>
        <p className="text-slate-600 text-xs mt-1 font-medium">Configure assessment metadata, syllabus topic, or upload course documents.</p>
      </div>

      <form onSubmit={handleGenerate} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Faculty Name</label>
            <input
              required
              name="facultyName"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] focus:bg-white"
              placeholder="e.g. Dr. Ramesh Kumar"
              value={formData.facultyName}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Subject / Course</label>
            <input
              required
              name="subject"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] focus:bg-white"
              placeholder="e.g. Data Structures & Algorithms"
              value={formData.subject}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Academic Year</label>
            <select
              name="academicYear"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] focus:bg-white"
              value={formData.academicYear}
              onChange={handleChange}
            >
              <option value="1st Year">1st Year (B.Tech / UG)</option>
              <option value="2nd Year">2nd Year (B.Tech / UG)</option>
              <option value="3rd Year">3rd Year (B.Tech / UG)</option>
              <option value="4th Year">4th Year (B.Tech / UG)</option>
              <option value="PG / Masters">PG / Masters</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Class Section</label>
            <input
              required
              name="classSection"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] focus:bg-white"
              placeholder="e.g. Section A, CSE-1, etc."
              value={formData.classSection}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1 md:col-span-2">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Assessment Title</label>
            <input
              required
              name="title"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] focus:bg-white"
              placeholder="e.g. Mid-Term Review: Binary Trees & Graphs"
              value={formData.title}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">
              Word Count (Custom Number)
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="number"
                min={3}
                max={30}
                name="questionsCount"
                className="w-full sm:w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-bold focus:border-[#b01c1e] focus:bg-white text-center outline-none"
                placeholder="e.g. 10"
                value={formData.questionsCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setFormData(prev => ({
                    ...prev,
                    questionsCount: isNaN(val) ? 8 : Math.max(3, Math.min(30, val))
                  }));
                }}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {[5, 8, 10, 12, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, questionsCount: num }))}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      formData.questionsCount === num
                        ? 'bg-[#002147] text-white border-[#002147] shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* File Upload Box */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Upload Course Document (PDF, DOCX)</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
              fileName ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
            }`}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.doc,.pptx,.ppt" onChange={handleFileChange} />
            {fileName ? (
              <>
                <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center mb-3 border border-teal-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <p className="text-sm font-bold text-teal-800">{fileName}</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setFileName(''); setSelectedFile(null); }} className="text-xs text-red-600 font-bold uppercase mt-2 hover:underline">
                  Remove File
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-slate-200 text-slate-600 rounded-xl flex items-center justify-center mb-3 border border-slate-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                </div>
                <p className="text-sm text-slate-800 font-bold">Click or drag & drop syllabus document</p>
                <p className="text-xs text-slate-500 mt-1">Supports PDF, DOCX, and PPTX up to 10MB</p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Specific Topic Focus (Optional)</label>
          <input
            name="topic"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 focus:border-[#b01c1e] focus:bg-white"
            placeholder="e.g. Graph Traversal Algorithms & Dijkstra"
            value={formData.topic}
            onChange={handleChange}
          />
        </div>

        {/* Schedule & Deadline Config */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[#002147]">Scheduled Release</h4>
              <p className="text-slate-500 text-[11px]">Set optional future release time or make active immediately.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isScheduled}
                onChange={(e) => setFormData(prev => ({ ...prev, isScheduled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#b01c1e]"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {formData.isScheduled && (
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Start Date & Time</label>
                <input
                  required={formData.isScheduled}
                  type="datetime-local"
                  name="startTime"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs text-slate-800"
                  value={formData.startTime}
                  onChange={handleChange}
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Submission Deadline</label>
              <input
                required
                type="datetime-local"
                name="deadline"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs text-slate-800"
                value={formData.deadline}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => { setIsManualMode(true); handleGenerate({ preventDefault: () => { } } as React.FormEvent); }}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold py-3.5 rounded-xl text-sm transition-all cursor-pointer"
          >
            Manual Entry
          </button>
          <button
            type="submit"
            onClick={() => setIsManualMode(false)}
            className="flex-[2] bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            Generate AI Crossword
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default FacultyCreate;
