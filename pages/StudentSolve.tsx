import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { Assessment, Question } from '../types';
import { generateLayout, createSeededRandom, seededShuffle, stringToSeed } from '../layoutGenerator';
import { emailService } from '../emailService';

const StudentSolve: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [rollNumber, setRollNumber] = useState('');
    const [studentName, setStudentName] = useState('');
    const [studentEmail, setStudentEmail] = useState('');
    const [isStarted, setIsStarted] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [startTime, setStartTime] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [gridData, setGridData] = useState<string[][]>([]);
    const [gridSize, setGridSize] = useState({ rows: 0, cols: 0 });
    const [focusedCell, setFocusedCell] = useState<{ r: number, c: number } | null>(null);
    const [activeDirection, setActiveDirection] = useState<'across' | 'down'>('across');
    const [integrityViolations, setIntegrityViolations] = useState(0);
    const [isBlurred, setIsBlurred] = useState(false);

    // Submission state — prevents double submission
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const violationsRef = useRef(0);
    // Track if we're focused on an input cell (to avoid false window-blur violations)
    const isCellFocusedRef = useRef(false);

    useEffect(() => {
        if (id) loadData(id);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [id]);

    useEffect(() => {
        if (!isStarted) return;
        const startMs = startTime;
        timerRef.current = setInterval(() => {
            setElapsedTime(Math.round((Date.now() - startMs) / 1000));
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isStarted, startTime]);

    // ── Anti-cheat: Window blur / visibility change ─────────────────────────
    useEffect(() => {
        if (!isStarted) return;

        const handleViolation = (reason: string) => {
            const newCount = violationsRef.current + 1;
            violationsRef.current = newCount;
            setIntegrityViolations(newCount);
            setIsBlurred(true);
            console.warn(`[Integrity] Violation #${newCount}: ${reason}`);
            if (newCount >= 3) {
                // Auto-submit on 3rd violation (more lenient than 2)
                handleSubmitInternal(true);
            }
        };

        const handleWindowBlur = () => {
            // FIXED: Only count as a violation if we're NOT currently focused on
            // a crossword input cell. Input focus-out (blur) also triggers window
            // blur briefly — this was causing false violations.
            if (!isCellFocusedRef.current) {
                handleViolation('Window lost focus (possible tab switch)');
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleViolation('Tab switched or window hidden');
            }
        };

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Block copy/cut/paste
            if ((e.metaKey || e.ctrlKey) && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
            // Block screenshots and printing
            const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(e.key.toLowerCase());
            const isWinScreenshot = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's';
            const isPrint = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p';
            if (isMacScreenshot || isWinScreenshot || isPrint) {
                e.preventDefault();
                handleViolation('Screenshot or print attempt blocked');
            }
        };

        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isStarted]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadData = async (code: string) => {
        setLoading(true);
        try {
            const data = await db.getAssessment(code);
            if (!data) {
                setError('Assessment code not found. Please verify the 6-character code with your faculty.');
                return;
            }

            setAssessment(data.assessment);
            setQuestions(data.questions);
            buildGrid(data.questions);
        } catch (err) {
            console.error('[StudentSolve] Failed to load assessment:', err);
            setError('Failed to connect to assessment database. Please check your internet connection.');
        } finally {
            setLoading(false);
        }
    };

    const buildGrid = (qs: Question[]) => {
        let maxR = 0, maxC = 0;
        qs.forEach(q => {
            const len = q.word.length;
            const endR = q.direction === 'across' ? q.row : q.row + len - 1;
            const endC = q.direction === 'across' ? q.col + len - 1 : q.col;
            maxR = Math.max(maxR, endR);
            maxC = Math.max(maxC, endC);
        });

        const rows = Math.max(maxR + 1, 1);
        const cols = Math.max(maxC + 1, 1);
        setGridSize({ rows, cols });

        const initialGrid = Array(rows).fill(null).map(() => Array(cols).fill(' '));
        qs.forEach(q => {
            for (let i = 0; i < q.word.length; i++) {
                const r = q.direction === 'across' ? q.row : q.row + i;
                const c = q.direction === 'across' ? q.col + i : q.col;
                if (r < rows && c < cols) {
                    initialGrid[r][c] = '_';
                }
            }
        });
        setGridData(initialGrid);
    };

    const isScheduledInFuture = () => {
        if (!assessment?.start_time) return false;
        return new Date(assessment.start_time).getTime() > Date.now();
    };

    const isPastDeadline = () => {
        if (!assessment?.deadline) return false;
        return new Date(assessment.deadline).getTime() < Date.now();
    };

    const handleStart = async () => {
        if (!rollNumber.trim()) {
            alert('Please enter your Roll Number / Hall Ticket Number.');
            return;
        }
        if (!studentName.trim()) {
            alert('Please enter your full name.');
            return;
        }

        if (isScheduledInFuture()) {
            alert(`This assessment opens at ${new Date(assessment!.start_time!).toLocaleString()}`);
            return;
        }

        if (isPastDeadline()) {
            alert('The deadline for this assessment has passed.');
            return;
        }

        setIsStarting(true);
        try {
            const hasAlreadySubmitted = await db.hasStudentSubmitted(
                assessment!.id,
                rollNumber.trim().toUpperCase()
            );
            if (hasAlreadySubmitted) {
                alert('You have already submitted a response for this assessment.');
                return;
            }
        } catch (e) {
            console.warn('[StudentSolve] Submission check failed:', e);
        }

        // Generate a deterministic, student-unique crossword layout using roll number + assessment ID as seed.
        // The same student ALWAYS gets the same crossword for the same assessment.
        // Different students get different layouts.
        const seedStr = rollNumber.trim().toUpperCase() + '_' + (assessment?.id || '');
        const seed = stringToSeed(seedStr);
        const rng = createSeededRandom(seed);

        // Shuffle questions using our unbiased Fisher-Yates with seeded PRNG
        const shuffledQuestions: Question[] = seededShuffle<Question>(questions, rng);
        const wordItems = shuffledQuestions.map((q: Question) => ({ word: q.word, clue: q.clue }));
        const studentLayout = generateLayout(wordItems, wordItems.length);

        let finalQuestions: Question[];
        if (studentLayout.length >= 3) {
            finalQuestions = studentLayout.map((p, idx) => ({
                id: `q-${idx}`,
                assessment_id: assessment!.id,
                word: p.word,
                clue: p.clue,
                direction: p.direction,
                row: p.row,
                col: p.col
            }));
        } else {
            // Fallback: use original questions if layout fails (should be rare after our fixes)
            finalQuestions = shuffledQuestions;
        }

        setQuestions(finalQuestions);
        buildGrid(finalQuestions);
        setIsStarted(true);
        setStartTime(Date.now());
        setIsStarting(false);
    };

    const handleCellChange = (r: number, c: number, val: string) => {
        const char = val.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
        const updated = gridData.map(row => [...row]);
        updated[r][c] = char || '_';
        setGridData(updated);

        if (char && focusedCell) {
            moveFocus(1);
        }
    };

    const moveFocus = (delta: number) => {
        if (!focusedCell) return;
        const { r, c } = focusedCell;
        let nextR = r;
        let nextC = c;

        if (activeDirection === 'across') {
            nextC = c + delta;
        } else {
            nextR = r + delta;
        }

        if (nextR >= 0 && nextR < gridSize.rows && nextC >= 0 && nextC < gridSize.cols) {
            if (gridData[nextR]?.[nextC] !== ' ') {
                setFocusedCell({ r: nextR, c: nextC });
                const el = inputRefs.current[`${nextR}-${nextC}`];
                if (el) el.focus();
            }
        }
    };

    const handleKeyDown = (r: number, c: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && gridData[r][c] === '_') {
            moveFocus(-1);
        } else if (e.key === 'ArrowRight') {
            setActiveDirection('across');
            moveFocus(1);
        } else if (e.key === 'ArrowLeft') {
            setActiveDirection('across');
            moveFocus(-1);
        } else if (e.key === 'ArrowDown') {
            setActiveDirection('down');
            moveFocus(1);
        } else if (e.key === 'ArrowUp') {
            setActiveDirection('down');
            moveFocus(-1);
        }
    };

    const handleCellFocus = (r: number, c: number) => {
        isCellFocusedRef.current = true;
        setFocusedCell({ r, c });
    };

    const handleCellBlur = () => {
        // Small delay so isCellFocusedRef reflects reality when window blur fires
        setTimeout(() => {
            isCellFocusedRef.current = false;
        }, 50);
    };

    const toggleDirection = (r: number, c: number) => {
        if (focusedCell?.r === r && focusedCell?.c === c) {
            setActiveDirection(prev => prev === 'across' ? 'down' : 'across');
        } else {
            setFocusedCell({ r, c });
        }
    };

    const handleClueClick = (q: Question) => {
        setActiveDirection(q.direction);
        setFocusedCell({ r: q.row, c: q.col });
        const el = inputRefs.current[`${q.row}-${q.col}`];
        if (el) el.focus();
    };

    const activeQuestion = questions.find(q => {
        if (!focusedCell) return false;
        const { r, c } = focusedCell;
        const len = q.word.length;
        if (q.direction !== activeDirection) return false;
        if (q.direction === 'across') {
            return r === q.row && c >= q.col && c < q.col + len;
        } else {
            return c === q.col && r >= q.row && r < q.row + len;
        }
    });

    const isCellInActiveWord = (r: number, c: number) => {
        if (!activeQuestion) return false;
        const len = activeQuestion.word.length;
        if (activeQuestion.direction === 'across') {
            return r === activeQuestion.row && c >= activeQuestion.col && c < activeQuestion.col + len;
        } else {
            return c === activeQuestion.col && r >= activeQuestion.row && r < activeQuestion.row + len;
        }
    };

    const calculateScore = () => {
        let correctCount = 0;
        const answersMap: Record<string, string> = {};

        questions.forEach((q, idx) => {
            const qId = q.id || idx.toString();
            let userWord = '';
            for (let i = 0; i < q.word.length; i++) {
                const r = q.direction === 'across' ? q.row : q.row + i;
                const c = q.direction === 'across' ? q.col + i : q.col;
                userWord += gridData[r]?.[c] || '_';
            }
            const isCorrect = userWord.toUpperCase() === q.word.toUpperCase();
            if (isCorrect) correctCount++;
            answersMap[qId] = isCorrect ? 'true' : 'false';
        });

        return { correctCount, answersMap };
    };

    // Internal submit function — used by both the button and auto-submit (violations)
    const handleSubmitInternal = useCallback(async (isAutoSubmit = false) => {
        // Prevent double submission — critical fix
        if (isSubmitting || hasSubmitted) return;

        if (!isAutoSubmit && !window.confirm('Are you sure you want to submit your assessment?')) {
            return;
        }

        setIsSubmitting(true);
        if (timerRef.current) clearInterval(timerRef.current);

        const { correctCount, answersMap } = calculateScore();
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);

        try {
            await db.submitResponse({
                assessment_id: assessment!.id,
                roll_number: rollNumber.trim().toUpperCase(),
                student_name: studentName.trim() || 'Student',
                student_email: studentEmail.trim() || undefined,
                score: correctCount,
                total_questions: questions.length,
                answers_json: answersMap,
                time_taken: durationSeconds
            });

            setHasSubmitted(true);

            // Fire-and-forget email notifications — don't block navigation on email failure
            if (studentEmail.trim()) {
                emailService.sendStudentResultEmail({
                    studentName: studentName.trim() || 'Student',
                    studentEmail: studentEmail.trim(),
                    rollNumber: rollNumber.trim().toUpperCase(),
                    assessmentTitle: assessment!.title,
                    subject: assessment!.subject,
                    score: correctCount,
                    totalQuestions: questions.length,
                    timeTakenSeconds: durationSeconds,
                    violations: violationsRef.current
                }).catch(e => console.warn('[Email] Student email failed:', e));
            }

            if (assessment?.faculty_email) {
                emailService.sendFacultyReportEmail({
                    facultyEmail: assessment.faculty_email,
                    facultyName: assessment.faculty_name,
                    studentName: studentName.trim() || 'Student',
                    rollNumber: rollNumber.trim().toUpperCase(),
                    studentEmail: studentEmail.trim() || 'Not Provided',
                    assessmentTitle: assessment.title,
                    subject: assessment.subject,
                    score: correctCount,
                    totalQuestions: questions.length,
                    timeTakenSeconds: durationSeconds
                }).catch(e => console.warn('[Email] Faculty email failed:', e));
            }

            navigate('/success', {
                state: {
                    score: correctCount,
                    totalQuestions: questions.length,
                    timeTaken: durationSeconds,
                    studentName: studentName.trim() || rollNumber.toUpperCase(),
                    studentEmail: studentEmail.trim(),
                    assessmentTitle: assessment!.title,
                    subject: assessment!.subject
                }
            });
        } catch (err: any) {
            console.error('[StudentSolve] Submission failed:', err);
            setIsSubmitting(false);
            if (err.message?.includes('already submitted')) {
                alert('This assessment has already been submitted from your roll number.');
                navigate('/');
            } else {
                alert(`Failed to save submission: ${err.message || 'Please check your internet connection and try again.'}`);
            }
        }
    }, [isSubmitting, hasSubmitted, assessment, rollNumber, studentName, studentEmail, questions, startTime, gridData, navigate]);

    const handleSubmit = () => handleSubmitInternal(false);

    const getProgress = () => {
        let totalCells = 0;
        let filledCells = 0;
        gridData.forEach(row => row.forEach(cell => {
            if (cell !== ' ') {
                totalCells++;
                if (cell !== '_') filledCells++;
            }
        }));
        const pct = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
        return { totalCells, filledCells, pct };
    };

    const progress = getProgress();

    const formatTimer = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) return (
        <div className="flex justify-center py-32">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-[#b01c1e] rounded-full animate-spin"></div>
        </div>
    );

    if (error) return (
        <div className="max-w-md mx-auto text-center py-16 px-4">
            <div className="bg-white border border-red-200 p-8 rounded-3xl shadow-lg">
                <h2 className="text-2xl font-black text-[#002147] mb-2">Assessment Unavailable</h2>
                <p className="text-red-600 text-xs mb-6 font-medium">{error}</p>
                <button onClick={() => navigate('/')} className="w-full bg-[#b01c1e] hover:bg-[#851415] text-white font-bold py-3 rounded-xl text-xs transition-all shadow-sm">
                    Return to Home
                </button>
            </div>
        </div>
    );

    if (!isStarted) {
        return (
            <div className="max-w-md mx-auto bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-xl mt-8 animate-slide-up">
                <div className="text-center mb-6">
                    <div className="inline-block p-2.5 bg-slate-50 rounded-2xl mb-3 border border-slate-200">
                        <img src="/anurag-logo.png" alt="Anurag University Logo" className="h-7 object-contain" />
                    </div>
                    <h1 className="text-2xl font-black text-[#002147]">{assessment?.title}</h1>
                    <p className="text-xs font-bold text-[#b01c1e] uppercase tracking-wider mt-1">{assessment?.subject}</p>

                    {assessment?.deadline && (
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-3 font-semibold">
                            Deadline: {new Date(assessment.deadline).toLocaleString()}
                        </p>
                    )}
                </div>

                {isScheduledInFuture() ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold p-4 rounded-2xl text-center">
                        ⏳ Scheduled Assessment
                        <p className="text-[11px] text-slate-600 font-normal mt-1">
                            Opens at: {new Date(assessment!.start_time!).toLocaleString()}
                        </p>
                    </div>
                ) : isPastDeadline() ? (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-4 rounded-2xl text-center">
                        ⚠️ Assessment submission deadline has passed.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">
                                Hall Ticket / Roll Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 outline-none font-mono text-base uppercase text-slate-800 focus:border-[#b01c1e]"
                                placeholder="e.g. 21BCS1042"
                                value={rollNumber}
                                onChange={(e) => setRollNumber(e.target.value)}
                                disabled={isStarting}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">
                                Full Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 outline-none text-sm text-slate-800 focus:border-[#b01c1e]"
                                placeholder="Enter your full name"
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                                disabled={isStarting}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Email Address (for score delivery)</label>
                            <input
                                type="email"
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 outline-none text-sm text-slate-800 focus:border-[#b01c1e]"
                                placeholder="e.g. 24eg507f01@anurag.edu.in"
                                value={studentEmail}
                                onChange={(e) => setStudentEmail(e.target.value)}
                                disabled={isStarting}
                            />
                        </div>
                        <button
                            onClick={handleStart}
                            disabled={isStarting || !rollNumber.trim() || !studentName.trim()}
                            className="w-full mt-2 bg-[#b01c1e] hover:bg-[#851415] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all shadow-md text-sm cursor-pointer flex items-center justify-center gap-2"
                        >
                            {isStarting ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Preparing your crossword...</>
                            ) : (
                                'START ASSESSMENT NOW'
                            )}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6 items-start animate-fade-in relative select-none">
            {/* Puzzle Board Panel */}
            <div className="flex-grow w-full bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-lg overflow-auto relative">
                {/* Timer & Progress Bar */}
                <div className="flex flex-wrap justify-between items-center mb-6 bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl text-xs gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Timer</span>
                        <span className="font-mono font-bold text-[#002147] text-base">{formatTimer(elapsedTime)}</span>
                    </div>

                    {integrityViolations > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                            <span className="text-[10px] font-bold text-amber-700 uppercase">⚠️ Violations: {integrityViolations}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filled:</span>
                        <span className="font-mono font-bold text-slate-800">{progress.filledCells} / {progress.totalCells} ({progress.pct}%)</span>
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                            <div className="h-full bg-teal-600 transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                        </div>
                    </div>
                </div>

                {/* Crossword Grid */}
                <div
                    className="grid mx-auto bg-slate-100 rounded-2xl p-3 border border-slate-200 overflow-x-auto"
                    style={{
                        gridTemplateColumns: `repeat(${gridSize.cols}, minmax(36px, 1fr))`,
                        width: 'fit-content'
                    }}
                >
                    {gridData.map((row, r) => row.map((cell, c) => {
                        const isInput = cell !== ' ';
                        const qAcross = questions.find(q => q.row === r && q.col === c && q.direction === 'across');
                        const qDown = questions.find(q => q.row === r && q.col === c && q.direction === 'down');
                        const qAcrossIdx = qAcross ? questions.indexOf(qAcross) + 1 : null;
                        const qDownIdx = qDown ? questions.indexOf(qDown) + 1 : null;
                        const qNum = qAcrossIdx || qDownIdx;
                        const isFocused = focusedCell?.r === r && focusedCell?.c === c;
                        const inActiveWord = isCellInActiveWord(r, c);

                        return (
                            <div
                                key={`${r}-${c}`}
                                className={`relative w-9 h-9 sm:w-11 sm:h-11 border-2 rounded-lg transition-all ${
                                    isInput
                                        ? isFocused
                                            ? 'bg-white border-[#b01c1e] shadow-md z-20 ring-2 ring-red-200'
                                            : inActiveWord
                                                ? 'bg-teal-50 border-teal-600'
                                                : 'bg-white border-slate-300'
                                        : 'bg-transparent border-transparent'
                                }`}
                                onClick={() => isInput && toggleDirection(r, c)}
                            >
                                {qNum && (
                                    <span className="absolute top-0.5 left-0.5 text-[8px] sm:text-[9px] text-[#002147] font-black leading-none pointer-events-none select-none z-10">
                                        {qNum}
                                    </span>
                                )}
                                {isInput && (
                                    <input
                                        ref={el => inputRefs.current[`${r}-${c}`] = el}
                                        className="w-full h-full text-center bg-transparent text-[#002147] font-black text-base sm:text-xl outline-none uppercase caret-[#b01c1e]"
                                        maxLength={1}
                                        value={cell === '_' ? '' : cell}
                                        onFocus={() => handleCellFocus(r, c)}
                                        onBlur={handleCellBlur}
                                        onChange={(e) => handleCellChange(r, c, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(r, c, e)}
                                    />
                                )}
                            </div>
                        );
                    }))}
                </div>

                <div className="mt-8 flex justify-center">
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || hasSubmitted}
                        className="px-8 py-3 bg-[#b01c1e] hover:bg-[#851415] disabled:opacity-60 text-white font-bold rounded-xl shadow-md transition-all text-sm cursor-pointer flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</>
                        ) : (
                            <>Submit Assessment <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></>
                        )}
                    </button>
                </div>
            </div>

            {/* Clues List Panel */}
            <div className="lg:w-80 w-full space-y-4 lg:sticky lg:top-20">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-md max-h-[80vh] overflow-y-auto scrollbar-thin">
                    <h2 className="text-base font-bold text-[#002147] mb-4 pb-2 border-b border-slate-100">Clues List</h2>

                    <div className="space-y-6">
                        {/* Across Clues */}
                        <div>
                            <h3 className="text-xs font-bold text-[#002147] mb-3 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#002147]"></span>
                                Across
                            </h3>
                            <div className="space-y-1.5">
                                {questions.filter(q => q.direction === 'across').map((q) => {
                                    const isHighlighted = activeQuestion?.word === q.word && activeDirection === 'across';
                                    return (
                                        <div
                                            key={q.id || q.word}
                                            className={`p-2.5 rounded-xl transition-all cursor-pointer border text-xs ${
                                                isHighlighted
                                                    ? 'bg-teal-50 border-teal-500 text-slate-900 font-bold'
                                                    : 'border-transparent hover:bg-slate-50 text-slate-700'
                                            }`}
                                            onClick={() => handleClueClick(q)}
                                        >
                                            <div className="flex gap-2.5">
                                                <span className="font-mono font-bold text-[#002147] w-4 shrink-0">
                                                    {questions.indexOf(q) + 1}.
                                                </span>
                                                <span className="leading-snug">{q.clue}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Down Clues */}
                        <div>
                            <h3 className="text-xs font-bold text-[#b01c1e] mb-3 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#b01c1e]"></span>
                                Down
                            </h3>
                            <div className="space-y-1.5">
                                {questions.filter(q => q.direction === 'down').map((q) => {
                                    const isHighlighted = activeQuestion?.word === q.word && activeDirection === 'down';
                                    return (
                                        <div
                                            key={q.id || q.word}
                                            className={`p-2.5 rounded-xl transition-all cursor-pointer border text-xs ${
                                                isHighlighted
                                                    ? 'bg-red-50 border-red-400 text-slate-900 font-bold'
                                                    : 'border-transparent hover:bg-slate-50 text-slate-700'
                                            }`}
                                            onClick={() => handleClueClick(q)}
                                        >
                                            <div className="flex gap-2.5">
                                                <span className="font-mono font-bold text-[#b01c1e] w-4 shrink-0">
                                                    {questions.indexOf(q) + 1}.
                                                </span>
                                                <span className="leading-snug">{q.clue}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Anti-cheat Alert Overlay */}
            {isBlurred && integrityViolations < 3 && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="max-w-sm w-full bg-white p-6 rounded-3xl border border-red-200 shadow-2xl text-center">
                        <h2 className="text-xl font-black text-red-600 mb-2">⚠️ Integrity Warning</h2>
                        <p className="text-slate-600 text-xs mb-1">
                            You switched tabs or lost window focus. This has been recorded.
                        </p>
                        <p className="text-slate-500 text-xs mb-4">
                            Warning {integrityViolations} of 3. A third violation will auto-submit your assessment.
                        </p>
                        <button
                            onClick={() => setIsBlurred(false)}
                            className="w-full py-2.5 bg-[#b01c1e] hover:bg-[#851415] text-white rounded-xl font-bold text-xs cursor-pointer"
                        >
                            Return to Assessment
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentSolve;
