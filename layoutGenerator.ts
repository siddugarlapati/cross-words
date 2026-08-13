import { Direction } from './types';

export interface WordItem {
  word: string;
  clue: string;
}

export interface PlacedWord {
  word: string;
  clue: string;
  direction: Direction;
  row: number;
  col: number;
}

/**
 * Mulberry32 — a fast, portable, deterministic seeded PRNG.
 * Produces identical output on every platform, no integer overflow issues.
 * Returns a function that yields the next pseudo-random float [0, 1).
 */
export function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0; // ensure 32-bit unsigned
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG (unbiased).
 */
export function seededShuffle<T>(array: T[], rng: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Stable hash for a string → 32-bit unsigned integer seed.
 * Uses the same djb2 algorithm but avoids signed integer overflow
 * by always masking to 32-bit unsigned.
 */
export function stringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Generates a connected crossword grid layout from a list of words and clues.
 * Pass a seeded `rng` to get a student-unique deterministic layout.
 * Without rng, layout is deterministic based on word lengths only.
 */
export function generateLayout(
  wordItems: WordItem[],
  targetCount: number,
  rng?: () => number
): PlacedWord[] {
  // 1. Clean and deduplicate words
  const seen = new Set<string>();
  const cleanedItems = wordItems
    .map(item => ({
      word: item.word.toUpperCase().replace(/[^A-Z]/g, ''),
      clue: item.clue
    }))
    .filter(item => {
      if (item.word.length < 3 || item.word.length > 15) return false;
      if (seen.has(item.word)) return false;
      seen.add(item.word);
      return true;
    });

  if (cleanedItems.length === 0) return [];

  // Sort by length descending — longer words give more intersection opportunities
  // If rng provided, add a small seeded jitter so equal-length words get different starting order
  const sortedItems = [...cleanedItems].sort((a, b) => {
    const lenDiff = b.word.length - a.word.length;
    if (lenDiff !== 0) return lenDiff;
    // Same length: use seeded tiebreak so different students get different first-word choices
    return rng ? (rng() > 0.5 ? 1 : -1) : 0;
  });

  const effectiveTarget = Math.min(targetCount, sortedItems.length);

  let bestPlaced: PlacedWord[] = [];

  // Try multiple starting words — more attempts when rng is provided for better diversity
  const startCount = rng ? Math.min(6, sortedItems.length) : Math.min(3, sortedItems.length);
  for (let startIndex = 0; startIndex < startCount; startIndex++) {
    const placed = attemptPlacement(sortedItems, startIndex, effectiveTarget, rng);
    if (placed.length > bestPlaced.length) {
      bestPlaced = placed;
    }
    if (bestPlaced.length >= effectiveTarget) break;
  }

  if (bestPlaced.length === 0) return [];

  // Normalize coordinates so min(row)=0, min(col)=0
  let minRow = Infinity;
  let minCol = Infinity;
  bestPlaced.forEach(p => {
    minRow = Math.min(minRow, p.row);
    minCol = Math.min(minCol, p.col);
  });

  return bestPlaced.map(p => ({
    ...p,
    row: p.row - minRow,
    col: p.col - minCol
  }));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function attemptPlacement(
  sortedItems: WordItem[],
  startIndex: number,
  targetCount: number,
  rng?: () => number
): PlacedWord[] {
  const placedWords: PlacedWord[] = [];
  const grid = new Map<string, string>(); // "row,col" -> letter

  const addWordToGrid = (word: string, r: number, c: number, dir: Direction) => {
    const dr = dir === 'across' ? 0 : 1;
    const dc = dir === 'across' ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      grid.set(`${r + dr * i},${c + dc * i}`, word[i]);
    }
  };

  // Place first word — seeded row/col offset for per-student variation
  const firstItem = sortedItems[startIndex];
  const rowOffset = rng ? Math.floor(rng() * 6) : 0;   // 0–5 row jitter
  const colOffset = rng ? Math.floor(rng() * 6) : 0;   // 0–5 col jitter
  // Randomly choose first word direction too
  const firstDir: Direction = (rng && rng() > 0.5) ? 'down' : 'across';
  const firstPlaced: PlacedWord = {
    word: firstItem.word,
    clue: firstItem.clue,
    direction: firstDir,
    row: 50 + rowOffset + (firstDir === 'down' ? 0 : 0),
    col: 50 + colOffset - (firstDir === 'across' ? Math.floor(firstItem.word.length / 2) : 0)
  };
  placedWords.push(firstPlaced);
  addWordToGrid(firstPlaced.word, firstPlaced.row, firstPlaced.col, firstPlaced.direction);

  const placedWordSet = new Set<string>([firstItem.word]);
  // Shuffle remaining words using rng so each student processes them in different order
  let remaining = sortedItems.filter((_, idx) => idx !== startIndex);
  if (rng) {
    remaining = seededShuffle(remaining, rng);
  }

  // Iterative placement: each pass tries every remaining word
  let improved = true;
  let iteration = 0;
  const MAX_ITERATIONS = 20; // Safety limit against O(n²) blow-up

  while (improved && placedWords.length < targetCount && iteration < MAX_ITERATIONS) {
    improved = false;
    iteration++;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      if (placedWordSet.has(item.word)) continue;
      if (placedWords.length >= targetCount) break;

      const bestCandidate = findBestPlacement(item, placedWords, grid, rng);
      if (bestCandidate) {
        placedWords.push(bestCandidate);
        addWordToGrid(bestCandidate.word, bestCandidate.row, bestCandidate.col, bestCandidate.direction);
        placedWordSet.add(item.word);
        improved = true;
      }
    }
  }

  return placedWords;
}

interface Candidate {
  row: number;
  col: number;
  direction: Direction;
  score: number;
}

function findBestPlacement(
  item: WordItem,
  placedWords: PlacedWord[],
  grid: Map<string, string>,
  rng?: () => number
): PlacedWord | null {
  const word = item.word;
  const candidates: Candidate[] = [];

  for (const pw of placedWords) {
    for (let i = 0; i < pw.word.length; i++) {
      const pwLetter = pw.word[i];
      const pwR = pw.row + (pw.direction === 'across' ? 0 : i);
      const pwC = pw.col + (pw.direction === 'across' ? i : 0);

      for (let j = 0; j < word.length; j++) {
        if (word[j] !== pwLetter) continue;

        // New word must be perpendicular to the existing word
        const dir: Direction = pw.direction === 'across' ? 'down' : 'across';
        const r = pwR - (dir === 'across' ? 0 : j);
        const c = pwC - (dir === 'across' ? j : 0);

        if (isValidPlacement(word, r, c, dir, grid)) {
          const score = calculatePlacementScore(word, r, c, dir, placedWords, grid);
          candidates.push({ row: r, col: c, direction: dir, score });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending; when rng provided, shuffle among top candidates for variety
  candidates.sort((a, b) => b.score - a.score);

  let chosen: Candidate;
  if (rng && candidates.length > 1) {
    // Among the top candidates within 10% of the best score, pick randomly
    const bestScore = candidates[0].score;
    const topCandidates = candidates.filter(c => c.score >= bestScore - Math.abs(bestScore * 0.1) - 1);
    chosen = topCandidates[Math.floor(rng() * topCandidates.length)];
  } else {
    chosen = candidates[0];
  }

  return {
    word,
    clue: item.clue,
    row: chosen.row,
    col: chosen.col,
    direction: chosen.direction
  };
}

/**
 * Validates that a word can be placed at (startR, startC) in direction dir.
 *
 * Rules:
 * 1. The cell immediately before the word start must be empty.
 * 2. The cell immediately after the word end must be empty.
 * 3. At each word cell:
 *    a. If occupied: letter must match (intersection).
 *    b. If empty: no parallel adjacent letters that would create an adjacent parallel word.
 * 4. The word must have at least one intersection with an existing word.
 */
function isValidPlacement(
  word: string,
  startR: number,
  startC: number,
  dir: Direction,
  grid: Map<string, string>
): boolean {
  const dr = dir === 'across' ? 0 : 1;
  const dc = dir === 'across' ? 1 : 0;
  const len = word.length;

  // Rule 1 & 2: No letter directly before or after the word
  if (grid.has(`${startR - dr},${startC - dc}`)) return false;
  if (grid.has(`${startR + dr * len},${startC + dc * len}`)) return false;

  let hasIntersection = false;

  for (let k = 0; k < len; k++) {
    const r = startR + dr * k;
    const c = startC + dc * k;
    const letter = word[k];

    if (grid.has(`${r},${c}`)) {
      // Rule 3a: Must match existing letter
      if (grid.get(`${r},${c}`) !== letter) return false;
      hasIntersection = true;
    } else {
      // Rule 3b: No parallel adjacent letters that form an unintentional adjacency
      if (dir === 'across') {
        // Word runs left→right; check above and below for conflicts
        const above = grid.has(`${r - 1},${c}`);
        const below = grid.has(`${r + 1},${c}`);
        if (above || below) {
          // There's a letter above/below this cell.
          // It's only OK if this cell is the intersection point (already handled above).
          // An adjacent letter at a non-intersection means two parallel words would run side by side.
          return false;
        }
      } else {
        // Word runs top→bottom; check left and right for conflicts
        const left = grid.has(`${r},${c - 1}`);
        const right = grid.has(`${r},${c + 1}`);
        if (left || right) {
          return false;
        }
      }
    }
  }

  // Rule 4: Must intersect at least one existing word
  return hasIntersection;
}

function calculatePlacementScore(
  word: string,
  startR: number,
  startC: number,
  dir: Direction,
  placedWords: PlacedWord[],
  grid: Map<string, string>
): number {
  let intersections = 0;
  const dr = dir === 'across' ? 0 : 1;
  const dc = dir === 'across' ? 1 : 0;

  for (let k = 0; k < word.length; k++) {
    const r = startR + dr * k;
    const c = startC + dc * k;
    if (grid.has(`${r},${c}`)) {
      intersections++;
    }
  }

  // Calculate the bounding box of all words (including this candidate)
  let minR = startR, maxR = startR + dr * (word.length - 1);
  let minC = startC, maxC = startC + dc * (word.length - 1);

  placedWords.forEach(pw => {
    const pdr = pw.direction === 'across' ? 0 : 1;
    const pdc = pw.direction === 'across' ? 1 : 0;
    minR = Math.min(minR, pw.row);
    maxR = Math.max(maxR, pw.row + pdr * (pw.word.length - 1));
    minC = Math.min(minC, pw.col);
    maxC = Math.max(maxC, pw.col + pdc * (pw.word.length - 1));
  });

  const area = (maxR - minR + 1) * (maxC - minC + 1);

  // Reward intersections heavily; penalize large bounding box to keep grid compact
  return intersections * 10 - area * 0.05;
}
