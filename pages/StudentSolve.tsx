import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { Assessment, Question } from '../types';
import { generateLayout } from '../layoutGenerator';

const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const StudentSolve: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [rollNumber, setRollNumber] = useState('');
    const [studentName, setStudentName] = useState('');
    const [isStarted, setIsStarted] = useState(false);
    const [startTime, setStartTime] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [gridData, setGridData] = useState<string[][]>([]);
    const [gridSize, setGridSize] = useState({ rows: 0, cols: 0 });
    const [focusedCell, setFocusedCell] = useState<{ r: number, c: number } | null>(null);
    const [activeDirection, setActiveDirection] = useState<'across' | 'down'>('across');
    const [integrityViolations, setIntegrityViolations] = useState(0);
    const [isBlurred, setIsBlurred] = useState(false);
    // Store refs to inputs for focus management
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const violationsRef = useRef(0);

    useEffect(() => {
        if (id) loadData(id);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [id]);

    // Timer effect
    useEffect(() => {
        if (isStarted) {
            timerRef.current = setInterval(() => {
                setElapsedTime(Math.round((Date.now() - startTime) / 1000));
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isStarted, startTime]);

    // Anti-cheat window blur and selection listeners
    useEffect(() => {
        if (!isStarted) return;

        const handleViolation = () => {
            const newCount = violationsRef.current + 1;
            violationsRef.current = newCount;
            setIntegrityViolations(newCount);
            setIsBlurred(true);
            if (newCount >= 2) {
                handleSubmit(true);
            }
        };

        const handleBlur = () => { handleViolation(); };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleViolation();
            }
        };

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            alert("Right-click is disabled to protect exam integrity.");
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                alert("Copying text is disabled during the assessment.");
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
                e.preventDefault();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
            }
            
            // Intercept screenshot and print shortcuts
            const isMacScreenshot = e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5' || e.key.toLowerCase() === 's');
            const isWinScreenshot = e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === 's');
            const isPrint = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p';

            if (e.key === 'PrintScreen' || isMacScreenshot || isWinScreenshot || isPrint) {
                e.preventDefault();
                handleViolation();
                alert("Screenshots and printing are disabled to protect exam integrity.");
            }
        };

        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isStarted]);

    const loadData = async (assessmentId: string) => {
        setLoading(true);
        try {
            const data = await db.getAssessment(assessmentId);
            if (data) {
                setAssessment(data.assessment);

                // Shuffle questions and select a random subset (up to 12)
                const shuffled = shuffleArray(data.questions);
                const subsetSize = Math.max(3, Math.min(shuffled.length, 12));
                const studentSubset = shuffled.slice(0, subsetSize);

                // Dynamically arrange coordinates for the student
                const wordItems = studentSubset.map(q => ({
                    word: q.word,
                    clue: q.clue
                }));
                const arranged = generateLayout(wordItems, wordItems.length);

                // Map back to questions with custom student coordinates
                const finalQuestions: Question[] = arranged.map((p, idx) => ({
                    id: `q-${idx}`,
                    assessment_id: assessmentId,
                    word: p.word,
                    clue: p.clue,
                    direction: p.direction,
                    row: p.row,
                    col: p.col
                }));

                setQuestions(finalQuestions);

                let maxR = 0, maxC = 0;
                finalQuestions.forEach(q => {
                    const len = q.word.length;
                    const endR = q.direction === 'across' ? q.row : q.row + len - 1;
                    const endC = q.direction === 'across' ? q.col + len - 1 : q.col;
                    maxR = Math.max(maxR, endR);
                    maxC = Math.max(maxC, endC);
                });

                const rows = Math.max(maxR + 1, 5);
                const cols = Math.max(maxC + 1, 5);
                setGridSize({ rows, cols });

                const grid = Array(rows).fill(null).map(() => Array(cols).fill(' '));
                finalQuestions.forEach(q => {
                    for (let i = 0; i < q.word.length; i++) {
                        const r = q.direction === 'across' ? q.row : q.row + i;
                        const c = q.direction === 'across' ? q.col + i : q.col;
                        grid[r][c] = '_';
                    }
                });
                setGridData(grid);
            } else {
                setError('Assessment code invalid or expired.');
            }
        } catch (e) {
            console.error(e);
            setError('An error occurred while loading.');
        } finally {
            setLoading(false);
        }
    };

    const handleStart = () => {
        if (!rollNumber.trim()) {
            alert('Hall Ticket / Roll Number is mandatory.');
            return;
        }
        if (!studentName.trim()) {
            alert('Student name is mandatory.');
            return;
        }
        setIsStarted(true);
        setStartTime(Date.now());
    };

    const moveFocus = (r: number, c: number, dr: number, dc: number) => {
        let nextR = r + dr;
        let nextC = c + dc;

        if (nextR >= 0 && nextR < gridSize.rows && nextC >= 0 && nextC < gridSize.cols) {
            if (gridData[nextR][nextC] !== ' ') {
                inputRefs.current[`${nextR}-${nextC}`]?.focus();
                return true;
            }
        }
        return false;
    };

    // Find the currently active word/clue based on focused cell and active direction
    const getActiveQuestion = () => {
        if (!focusedCell) return null;
        const { r, c } = focusedCell;

        return questions.find(q => {
            if (q.direction !== activeDirection) return false;
            if (activeDirection === 'across') {
                return r === q.row && c >= q.col && c < q.col + q.word.length;
            } else {
                return c === q.col && r >= q.row && r < q.row + q.word.length;
            }
        }) || null;
    };

    const activeQuestion = getActiveQuestion();

    // Check if a cell belongs to the active word
    const isCellInActiveWord = (r: number, c: number) => {
        if (!activeQuestion) return false;
        if (activeQuestion.direction === 'across') {
            return r === activeQuestion.row && c >= activeQuestion.col && c < activeQuestion.col + activeQuestion.word.length;
        } else {
            return c === activeQuestion.col && r >= activeQuestion.row && r < activeQuestion.row + activeQuestion.word.length;
        }
    };

    // Toggle typing direction (Across/Down) at intersections
    const toggleDirection = (r: number, c: number) => {
        const hasAcross = questions.some(q => q.direction === 'across' && r === q.row && c >= q.col && c < q.col + q.word.length);
        const hasDown = questions.some(q => q.direction === 'down' && c === q.col && r >= q.row && r < q.row + q.word.length);

        if (hasAcross && hasDown) {
            setActiveDirection(prev => prev === 'across' ? 'down' : 'across');
        }
    };

    const handleCellFocus = (r: number, c: number) => {
        setFocusedCell({ r, c });
        // Set the active direction based on what words pass through this cell
        const hasWordInCurrentDir = questions.some(q => 
            q.direction === activeDirection && 
            (activeDirection === 'across' 
                ? (r === q.row && c >= q.col && c < q.col + q.word.length)
                : (c === q.col && r >= q.row && r < q.row + q.word.length)
            )
        );

        if (!hasWordInCurrentDir) {
            // Switch direction if only the other one fits
            const otherDir = activeDirection === 'across' ? 'down' : 'across';
            const hasWordInOtherDir = questions.some(q => 
                q.direction === otherDir && 
                (otherDir === 'across'
                    ? (r === q.row && c >= q.col && c < q.col + q.word.length)
                    : (c === q.col && r >= q.row && r < q.row + q.word.length)
                )
            );
            if (hasWordInOtherDir) {
                setActiveDirection(otherDir);
            }
        }
    };

    const handleCellChange = (r: number, c: number, value: string) => {
        const newVal = value.toUpperCase().slice(-1);
        const newGrid = [...gridData.map(row => [...row])];

        if (newVal === '') {
            newGrid[r][c] = '_';
        } else {
            newGrid[r][c] = newVal;
        }
        setGridData(newGrid);

        if (newVal !== '') {
            // Auto-advance in the active direction
            if (activeDirection === 'across') {
                moveFocus(r, c, 0, 1);
            } else {
                moveFocus(r, c, 1, 0);
            }
        }
    };

    const handleKeyDown = (r: number, c: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace') {
            const currentVal = gridData[r][c];
            const newGrid = [...gridData.map(row => [...row])];

            if (currentVal !== '_') {
                // Just clear current cell and do not move back
                newGrid[r][c] = '_';
                setGridData(newGrid);
            } else {
                // Current cell is already empty, back up and clear previous cell
                e.preventDefault();
                const dr = activeDirection === 'across' ? 0 : -1;
                const dc = activeDirection === 'across' ? -1 : 0;
                
                const moved = moveFocus(r, c, dr, dc);
                if (moved) {
                    const prevR = r + dr;
                    const prevC = c + dc;
                    newGrid[prevR][prevC] = '_';
                    setGridData(newGrid);
                }
            }
        } else if (e.key === ' ') {
            e.preventDefault();
            toggleDirection(r, c);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            moveFocus(r, c, 0, 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            moveFocus(r, c, 0, -1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus(r, c, 1, 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(r, c, -1, 0);
        }
    };

    const handleClueClick = (q: Question) => {
        setActiveDirection(q.direction);
        setTimeout(() => {
            const input = inputRefs.current[`${q.row}-${q.col}`];
            if (input) {
                input.focus();
                setFocusedCell({ r: q.row, c: q.col });
            }
        }, 50);
    };

    const handleSubmit = async (autoSubmit = false) => {
        if (!assessment) return;

        if (!autoSubmit) {
            const confirmSubmit = window.confirm(
                'Are you sure you want to submit your answers? You cannot make edits after submitting.'
            );
            if (!confirmSubmit) return;
        }

        const answers_json: Record<string, string> = {
            '_violations': violationsRef.current.toString()
        };
        let score = 0;

        questions.forEach((q, idx) => {
            let currentWord = '';
            for (let i = 0; i < q.word.length; i++) {
                const r = q.direction === 'across' ? q.row : q.row + i;
                const c = q.direction === 'across' ? q.col + i : q.col;
                const cellVal = gridData[r]?.[c] || '';
                currentWord += cellVal === '_' ? ' ' : cellVal;
            }
            
            const isCorrect = currentWord === q.word.toUpperCase();
            const qId = q.id || idx.toString();
            answers_json[qId] = isCorrect ? 'true' : 'false';
            
            if (isCorrect) {
                score++;
            }
        });

        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        try {
            await db.submitResponse({
                assessment_id: assessment.id,
                roll_number: rollNumber,
                student_name: studentName,
                answers_json,
                score,
                total_questions: questions.length,
                time_taken: timeTaken
            });
            navigate('/success', { state: { score, total: questions.length, autoSubmitted: autoSubmit, violations: violationsRef.current } });
        } catch (e: any) {
            alert(e.message);
        }
    };

    // Calculate filled cells progress
    const getProgress = () => {
        let totalCells = 0;
        let filledCells = 0;

        gridData.forEach(row => {
            row.forEach(cell => {
                if (cell !== ' ') {
                    totalCells++;
                    if (cell !== '_') {
                        filledCells++;
                    }
                }
            });
        });

        return {
            totalCells,
            filledCells,
            pct: totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0
        };
    };

    const progress = getProgress();

    // Check if past deadline
    const isPastDeadline = () => {
        if (!assessment?.deadline) return false;
        return new Date() > new Date(assessment.deadline);
    };

    // Check if scheduled in the future
    const isScheduledInFuture = () => {
        if (!assessment?.start_time) return false;
        return new Date() < new Date(assessment.start_time);
    };

    const formatTimer = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-40 animate-fade-in">
            <div className="w-16 h-16 border-4 border-slate-800 rounded-full mb-6 relative">
                <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-slate-400 font-mono uppercase tracking-widest text-sm animate-pulse">Decrypting Assessment...</p>
        </div>
    );

    if (error) return (
        <div className="max-w-md mx-auto text-center py-20 px-6">
            <div className="bg-red-500/10 border border-red-500/50 p-10 rounded-3xl animate-slide-up">
                <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-2">Access Denied</h2>
                <p className="text-red-300/80 mb-8 leading-relaxed">{error}</p>
                <button onClick={() => navigate('/')} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-500/20 cursor-pointer">
                    Return Home
                </button>
            </div>
        </div>
    );

    if (!isStarted) {
        return (
            <div className="max-w-md mx-auto glass border-2 border-slate-700/60 p-10 rounded-[2.5rem] shadow-2xl mt-12 animate-slide-up">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black mb-2 leading-tight">{assessment?.title}</h1>
                    <span className="inline-block px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold uppercase tracking-widest border border-teal-500/20">{assessment?.subject}</span>
                    
                    {assessment?.deadline && (
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-4">
                          Deadline: {new Date(assessment.deadline).toLocaleString()}
                        </p>
                    )}
                </div>

                {isScheduledInFuture() ? (
                    <div className="bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-bold p-5 rounded-2xl text-center shadow-lg shadow-purple-500/5">
                        ⏳ This assessment has not started yet.
                        <p className="text-xs text-slate-500 font-medium mt-3">
                            Scheduled to open on: <span className="text-purple-300 font-mono font-bold">{new Date(assessment!.start_time!).toLocaleString()}</span>
                        </p>
                    </div>
                ) : isPastDeadline() ? (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold p-5 rounded-2xl text-center shadow-lg shadow-red-500/5">
                        ⚠️ This assessment is locked because the deadline has passed.
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Hall Ticket / Roll Number</label>
                            <input
                                className="w-full bg-slate-950/50 border border-slate-700 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-purple-500 transition-all font-mono text-lg text-slate-200"
                                placeholder="e.g. 21BCS1042"
                                value={rollNumber}
                                onChange={(e) => setRollNumber(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Student Name</label>
                            <input
                                className="w-full bg-slate-950/50 border border-slate-700 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-teal-500 transition-all text-lg text-slate-200"
                                placeholder="Your Full Name"
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                            />
                        </div>
                        <div className="pt-4">
                            <button
                                onClick={handleStart}
                                className="w-full bg-gradient-to-r from-purple-600 to-teal-600 hover:brightness-110 text-white font-black py-5 rounded-2xl shadow-xl transition-all transform hover:-translate-y-1 active:scale-[0.98] text-lg cursor-pointer"
                            >
                                START ASSESSMENT
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-8 items-start animate-fade-in relative select-none">
            {/* Puzzle Board Panel */}
            <div className="flex-grow w-full glass p-6 md:p-10 rounded-[2.5rem] border-2 border-slate-700/50 shadow-2xl overflow-auto relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-bl-[100px] pointer-events-none" />

                {/* Solving Status Bar */}
                <div className="flex justify-between items-center mb-8 bg-slate-950/80 border border-slate-850 px-6 py-4 rounded-2xl text-sm relative z-10">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Elapsed</span>
                        <span className="font-mono font-black text-teal-400 text-lg">{formatTimer(elapsedTime)}</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Grid Filled</span>
                          <p className="font-mono font-bold text-slate-300 text-xs mt-0.5">{progress.filledCells} / {progress.totalCells} cells ({progress.pct}%)</p>
                        </div>
                        <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-teal-500 transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                        </div>
                    </div>
                </div>

                <div
                    className="grid mx-auto relative z-10 bg-slate-950/50 rounded-2xl p-2 border-2 border-slate-800"
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
                                className={`relative w-9 h-9 md:w-12 md:h-12 border-2 transition-all duration-200 ${
                                    isInput
                                        ? isFocused
                                            ? 'bg-slate-900 border-teal-400 shadow-md shadow-teal-500/20 z-20 ring-2 ring-teal-400/30'
                                            : inActiveWord
                                                ? 'bg-teal-500/10 border-teal-500/40'
                                                : 'bg-slate-950/80 border-slate-700'
                                        : 'bg-transparent border-transparent'
                                }`}
                                onClick={() => isInput && toggleDirection(r, c)}
                            >
                                {qNum && (
                                    <span className="absolute top-0.5 left-0.5 text-[8px] md:text-[9px] text-teal-400 font-black leading-none pointer-events-none select-none z-10">
                                        {qNum}
                                    </span>
                                )}
                                {isInput && (
                                    <input
                                        ref={el => inputRefs.current[`${r}-${c}`] = el}
                                        className="w-full h-full text-center bg-transparent text-slate-100 font-bold text-lg md:text-2xl outline-none uppercase caret-teal-500 pb-1"
                                        maxLength={1}
                                        value={cell === '_' ? '' : cell}
                                        onFocus={() => handleCellFocus(r, c)}
                                        onBlur={() => setFocusedCell(null)}
                                        onChange={(e) => handleCellChange(r, c, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(r, c, e)}
                                    />
                                )}
                            </div>
                        );
                    }))}
                </div>

                <div className="mt-12 flex flex-col items-center gap-6">
                    <button
                        onClick={handleSubmit}
                        className="group relative px-12 py-4 bg-slate-100 text-slate-950 font-black rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] hover:scale-105 transition-all overflow-hidden cursor-pointer"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-purple-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <span className="relative z-10 flex items-center gap-3">
                            SUBMIT ANSWERS
                            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        </span>
                    </button>
                </div>
            </div>

            {/* Clues Panel */}
            <div className="lg:w-96 w-full space-y-6 lg:sticky lg:top-8 animate-slide-up animate-delay-100">
                <div className="glass p-8 rounded-[2rem] border-2 border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-thin shadow-2xl">
                    <div className="flex items-center justify-between mb-8 sticky top-0 bg-slate-900/95 backdrop-blur-xl p-2 -m-2 z-10 border-b border-white/5">
                        <h2 className="text-xl font-black text-white tracking-tight">Clues</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Clue Highlights</span>
                        </div>
                    </div>

                    <div className="space-y-10">
                        {/* Across Clues */}
                        <section>
                            <h3 className="text-xs font-black text-purple-400 mb-6 uppercase flex items-center gap-3 tracking-widest border-b border-purple-500/20 pb-2">
                                <span className="bg-purple-500/20 p-1.5 rounded-lg"><div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div></span>
                                Across
                            </h3>
                            <div className="space-y-2">
                                {questions.filter(q => q.direction === 'across').map((q) => {
                                    const isHighlighted = activeQuestion?.id 
                                        ? activeQuestion.id === q.id 
                                        : activeQuestion?.word === q.word && activeDirection === 'across';

                                    return (
                                        <div 
                                            key={q.id || q.word} 
                                            className={`group cursor-pointer p-3 rounded-xl transition-all border ${
                                                isHighlighted 
                                                    ? 'bg-purple-500/10 border-purple-500/30' 
                                                    : 'border-transparent hover:bg-white/5 hover:border-white/5'
                                            }`} 
                                            onClick={() => handleClueClick(q)}
                                        >
                                            <div className="flex gap-4">
                                                <span className={`font-black text-sm w-4 ${isHighlighted ? 'text-purple-400' : 'text-slate-500 group-hover:text-purple-400 transition-colors'}`}>
                                                    {questions.indexOf(q) + 1}
                                                </span>
                                                <span className={`text-sm font-medium leading-relaxed ${isHighlighted ? 'text-white' : 'text-slate-300 group-hover:text-white transition-colors'}`}>
                                                    {q.clue}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Down Clues */}
                        <section>
                            <h3 className="text-xs font-black text-teal-400 mb-6 uppercase flex items-center gap-3 tracking-widest border-b border-teal-500/20 pb-2">
                                <span className="bg-teal-500/20 p-1.5 rounded-lg"><div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div></span>
                                Down
                            </h3>
                            <div className="space-y-2">
                                {questions.filter(q => q.direction === 'down').map((q) => {
                                    const isHighlighted = activeQuestion?.id 
                                        ? activeQuestion.id === q.id 
                                        : activeQuestion?.word === q.word && activeDirection === 'down';

                                    return (
                                        <div 
                                            key={q.id || q.word} 
                                            className={`group cursor-pointer p-3 rounded-xl transition-all border ${
                                                isHighlighted 
                                                    ? 'bg-teal-500/10 border-teal-500/30' 
                                                    : 'border-transparent hover:bg-white/5 hover:border-white/5'
                                            }`} 
                                            onClick={() => handleClueClick(q)}
                                        >
                                            <div className="flex gap-4">
                                                <span className={`font-black text-sm w-4 ${isHighlighted ? 'text-teal-400' : 'text-slate-500 group-hover:text-teal-400 transition-colors'}`}>
                                                    {questions.indexOf(q) + 1}
                                                </span>
                                                <span className={`text-sm font-medium leading-relaxed ${isHighlighted ? 'text-white' : 'text-slate-300 group-hover:text-white transition-colors'}`}>
                                                    {q.clue}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {/* Integrity Shield Blur Screen Lock */}
            {isBlurred && integrityViolations < 2 && (
                <div className="fixed inset-0 z-50 bg-[#020617]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
                    <div className="max-w-md w-full bg-white p-8 rounded-[2rem] border border-red-200/50 shadow-2xl shadow-red-500/10">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-8 h-8 text-red-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-black text-red-600 mb-2">Integrity Alert!</h2>
                        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                            This screen was locked because you switched tabs, focused another window, or attempted a screenshot. 
                            Your instructor will be notified of this action.
                        </p>
                        <div className="bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-xs font-mono font-bold mb-6">
                            Integrity Violations Tracked: {integrityViolations}
                        </div>
                        <button
                            onClick={() => setIsBlurred(false)}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black transition-all cursor-pointer shadow-lg shadow-red-500/25"
                        >
                            Resume Assessment
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentSolve;
