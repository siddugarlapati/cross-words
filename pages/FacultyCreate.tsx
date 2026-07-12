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
    topic: '',
    content: '',
    questionsCount: 10,
    deadline: '',
    classSection: '',
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
      console.error("Local parsing failed:", err);
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
      // Initialize empty template for manual entry
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
      const aiResult = await generateCrossword(
        formData.topic,
        formData.content,
        formData.questionsCount,
        selectedFile || undefined
      );

      setQuestions(aiResult.questions);
      setStep('review');
    } catch (err) {
      console.error('Generation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Generation failed: ${errorMessage}\n\nPlease check your internet connection, API key, and document formatting.`);
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

  // Automatically arrange coordinates for manual entries
  const handleAutoArrange = () => {
    const filledWords = questions
      .filter(q => q.word.trim().length >= 3)
      .map(q => ({
        word: q.word.trim().toUpperCase(),
        clue: q.clue
      }));

    if (filledWords.length === 0) {
      alert('Please fill out at least some answers before arranging!');
      return;
    }

    const arranged = generateLayout(filledWords, filledWords.length);

    if (arranged.length === 0) {
      alert('Could not generate a connected layout. Check that your words share at least some letters!');
      return;
    }

    // Map back and pad with any unplaced words (setting their row/col to 0)
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
      const assessmentId = await db.createAssessment({
        title: formData.title,
        subject: formData.subject,
        faculty_name: formData.facultyName,
        deadline: formData.deadline,
        class_section: formData.classSection,
        start_time: formData.isScheduled && formData.startTime ? formData.startTime : undefined,
      }, questions.filter(q => q.word.trim().length > 0)); // only publish non-empty
      navigate(`/dashboard?id=${assessmentId}`);
    } catch (err) {
      alert('Publishing failed.');
    } finally {
      setLoading(false);
    }
  };

  // Crossword Preview Calculation
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

    // Track grid letters to check overlaps
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
            collisions = true; // collision!
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
      <div className="flex flex-col items-center justify-center py-32 text-center min-h-[60vh]">
        <div className="relative w-32 h-32 mb-12">
          <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-teal-400 animate-pulse">
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <h2 className="text-4xl font-black text-white mb-6 tracking-tight animate-slide-up">
          Cooking your <span className="text-teal-400">Puzzle</span>...
        </h2>

        <div className="space-y-4 max-w-sm mx-auto animate-slide-up animate-delay-100">
          <div className="flex items-center gap-4 text-slate-400">
            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-left">Reading Document...</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <div className="w-2 h-2 rounded-full bg-slate-700 animate-pulse animate-delay-200"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-left">Identifying Concepts...</span>
          </div>
          <div className="flex items-center gap-4 text-slate-600">
            <div className="w-2 h-2 rounded-full bg-slate-800 animate-pulse animate-delay-300"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-left">Drafting Clues...</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-black text-white">Review & Fine-Tune</h2>
            <p className="text-slate-400 text-sm mt-1">Review the grid placement and edit educational terms or definitions.</p>
          </div>
          <div className="flex flex-wrap gap-4 w-full md:w-auto justify-end">
            <button
              onClick={handleAutoArrange}
              className="px-5 py-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-2xl text-sm font-black text-purple-700 transition-all flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" /></svg>
              Auto-arrange Grid
            </button>
            <button
              onClick={() => setStep('config')}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-sm font-bold transition-all cursor-pointer"
            >
              Start Over
            </button>
            <button
              onClick={handlePublish}
              disabled={loading || preview.collisions}
              className="px-10 py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-2xl text-sm font-black text-white transition-all shadow-xl shadow-teal-500/10 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? 'Publishing...' : 'Publish Assessment'}
              {!loading && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>}
            </button>
          </div>
        </div>

        {preview.collisions && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold p-4 rounded-2xl text-center">
            ⚠️ Grid Collision Detected! Multiple words overlap on differing letters. Use "Auto-arrange Grid" or correct coordinates manually.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Questions Editor */}
          <div className="lg:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Configure Words ({questions.length})</span>
              <button
                onClick={() => setQuestions([...questions, { word: '', clue: '', direction: 'across', row: 0, col: 0 }])}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Add Term
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {questions.map((q, idx) => (
                <div key={idx} className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl space-y-3 hover:border-purple-500/30 transition-all group relative">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                      Term {idx + 1}
                    </span>
                    <button
                      onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-400 text-xs font-bold uppercase transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 col-span-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Answer Word</label>
                      <input
                        className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-3 py-2 text-sm text-teal-400 font-mono font-bold uppercase outline-none transition-all"
                        value={q.word}
                        placeholder="ALGORITHM"
                        onChange={(e) => updateQuestion(idx, 'word', e.target.value)}
                      />
                    </div>

                    <div className="space-y-1 col-span-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Definition Clue</label>
                      <textarea
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none resize-none transition-all"
                        value={q.clue}
                        placeholder="A step-by-step procedure to solve a problem"
                        onChange={(e) => updateQuestion(idx, 'clue', e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Direction</label>
                      <select
                        className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none"
                        value={q.direction}
                        onChange={(e) => updateQuestion(idx, 'direction', e.target.value)}
                      >
                        <option value="across">Across</option>
                        <option value="down">Down</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Row</label>
                        <input
                          type="number"
                          className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none text-center"
                          value={q.row}
                          onChange={(e) => updateQuestion(idx, 'row', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Col</label>
                        <input
                          type="number"
                          className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none text-center"
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
          <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800 p-6 rounded-3xl h-fit sticky top-24">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Board Layout</h3>
              {preview.grid.length > 0 && (
                <span className="text-[10px] font-bold bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-full text-slate-400 uppercase">
                  {preview.rows} × {preview.cols} Grid
                </span>
              )}
            </div>

            {preview.grid.length > 0 ? (
              <div className="flex flex-col items-center justify-center bg-slate-950 p-6 rounded-2xl border border-slate-800/80 overflow-auto max-h-[45vh] shadow-inner shadow-black">
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
                        className={`relative w-7 h-7 md:w-8 md:h-8 border rounded-lg flex items-center justify-center font-bold text-xs md:text-sm transition-all ${
                          hasLetter
                            ? 'bg-slate-900 border-slate-700 text-teal-400 font-mono shadow-md'
                            : 'bg-transparent border-transparent'
                        }`}
                      >
                        {qNum && (
                          <span className="absolute top-0.5 left-0.5 text-[7px] text-slate-500 font-black leading-none pointer-events-none select-none">
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
              <div className="py-20 text-center text-slate-500 italic text-sm border border-dashed border-slate-800 rounded-2xl">
                Add terms to preview crossword layout.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-slate-900/40 border border-slate-800 p-8 md:p-12 rounded-[2.5rem] shadow-2xl">
      <div className="mb-10 text-center md:text-left">
        <h2 className="text-4xl font-black text-white tracking-tight">Generate <span className="text-purple-500">Puzzle</span></h2>
        <p className="text-slate-400 text-base mt-2">Create an AI-powered crossword assessment in seconds.</p>
      </div>

      <form onSubmit={handleGenerate} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Faculty Name</label>
            <input required name="facultyName" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-purple-500 transition-all text-slate-200" placeholder="Dr. Alexander Wright" value={formData.facultyName} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Subject</label>
            <input required name="subject" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-teal-500 transition-all text-slate-200" placeholder="Modern Physics" value={formData.subject} onChange={handleChange} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Assessment Title</label>
            <input required name="title" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-200" placeholder="Weekly Quiz: Quantum Mechanics" value={formData.title} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Word Count</label>
            <select name="questionsCount" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none text-slate-100" value={formData.questionsCount} onChange={handleChange}>
              <option value={8}>8 Questions (Fastest)</option>
              <option value={12}>12 Questions (Balanced)</option>
              <option value={15}>15 Questions (Complex)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Study Material (PDF)</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`group border-2 border-dashed rounded-[2rem] p-12 transition-all cursor-pointer flex flex-col items-center justify-center text-center ${fileName ? 'border-teal-500 bg-teal-500/5' : 'border-slate-800 bg-slate-950/30 hover:border-slate-600 hover:bg-slate-900/50'
              }`}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.doc,.pptx,.ppt" onChange={handleFileChange} />
            {fileName ? (
              <>
                <div className="w-16 h-16 bg-teal-500/20 text-teal-400 rounded-2xl flex items-center justify-center mb-5"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>
                <p className="text-base font-black text-teal-400">{fileName}</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setFileName(''); setSelectedFile(null); }} className="text-xs text-red-400 font-bold uppercase mt-3 hover:underline">Replace File</button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg></div>
                <p className="text-base text-slate-300 font-bold">Drag & Drop PDF, DOCX, or PPTX</p>
                <p className="text-xs text-slate-500 mt-2 font-medium">Text will be extracted for generation or manual use.</p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Specific Topic Focus (Optional)</label>
          <input name="topic" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-purple-500 transition-all text-slate-200" placeholder="e.g. Wave-Particle Duality" value={formData.topic} onChange={handleChange} />
        </div>

        <div className="bg-slate-900/20 border border-slate-800/80 p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold text-slate-200">Schedule Start Time</h4>
              <p className="text-slate-500 text-xs font-medium">Do you want to start the assessment immediately or at a specific date & time?</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={formData.isScheduled} 
                onChange={(e) => setFormData(prev => ({ ...prev, isScheduled: e.target.checked }))}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {formData.isScheduled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Start Date & Time</label>
                <input 
                  required={formData.isScheduled} 
                  type="datetime-local" 
                  name="startTime" 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none text-slate-400" 
                  value={formData.startTime} 
                  onChange={handleChange} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">End Deadline</label>
                <input 
                  required 
                  type="datetime-local" 
                  name="deadline" 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none text-slate-400" 
                  value={formData.deadline} 
                  onChange={handleChange} 
                />
              </div>
            </div>
          )}

          {!formData.isScheduled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Start Time</label>
                <div className="w-full bg-slate-950/30 border border-slate-800/50 rounded-2xl px-5 py-4 text-slate-500 font-bold text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Start Immediately (On Publish)
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">End Deadline</label>
                <input 
                  required 
                  type="datetime-local" 
                  name="deadline" 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 outline-none text-slate-400" 
                  value={formData.deadline} 
                  onChange={handleChange} 
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => { setIsManualMode(true); handleGenerate({ preventDefault: () => { } } as React.FormEvent); }}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-5 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3 text-lg cursor-pointer"
          >
            Manual Entry
          </button>
          <button
            type="submit"
            onClick={() => setIsManualMode(false)}
            className="flex-[2] bg-gradient-to-r from-purple-600 to-blue-600 hover:brightness-110 active:scale-[0.98] text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-purple-500/20 flex items-center justify-center gap-3 text-lg cursor-pointer"
          >
            High-Speed AI Extraction
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default FacultyCreate;
