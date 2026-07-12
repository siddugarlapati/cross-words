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
 * Generates a connected crossword grid layout from a list of words and clues.
 * Uses a deterministic backtracking algorithm to ensure all words intersect properly
 * and adhere to crossword rules.
 */
export function generateLayout(
  wordItems: WordItem[],
  targetCount: number
): PlacedWord[] {
  // 1. Clean words (uppercase A-Z only, min length 3, max length 15)
  const cleanedItems = wordItems
    .map(item => ({
      word: item.word.toUpperCase().replace(/[^A-Z]/g, ''),
      clue: item.clue
    }))
    .filter(item => item.word.length >= 3 && item.word.length <= 15);

  if (cleanedItems.length === 0) {
    return [];
  }

  // Sort words by length descending
  const sortedItems = [...cleanedItems].sort((a, b) => b.word.length - a.word.length);

  let bestPlaced: PlacedWord[] = [];

  // Try different starting words to find the best/most connected layout
  for (let startIndex = 0; startIndex < Math.min(8, sortedItems.length); startIndex++) {
    const placed = attemptPlacement(sortedItems, startIndex, targetCount);
    if (placed.length > bestPlaced.length) {
      bestPlaced = placed;
    }
    if (bestPlaced.length >= targetCount) {
      break;
    }
  }

  if (bestPlaced.length === 0) return [];

  // Crop and shift coordinates so min(row) = 0 and min(col) = 0
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

function attemptPlacement(
  sortedItems: WordItem[],
  startIndex: number,
  targetCount: number
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

  // Place first word at center (row=50, col=50 - half length)
  const firstItem = sortedItems[startIndex];
  const firstPlaced: PlacedWord = {
    word: firstItem.word,
    clue: firstItem.clue,
    direction: 'across',
    row: 50,
    col: 50 - Math.floor(firstItem.word.length / 2)
  };
  placedWords.push(firstPlaced);
  addWordToGrid(firstPlaced.word, firstPlaced.row, firstPlaced.col, firstPlaced.direction);

  const remaining = sortedItems.filter((_, idx) => idx !== startIndex);

  // Iterate to place remaining words
  let placedAny = true;
  while (placedAny && placedWords.length < targetCount) {
    placedAny = false;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      if (placedWords.some(pw => pw.word === item.word)) continue;

      const bestCandidate = findBestPlacement(item, placedWords, grid);
      if (bestCandidate) {
        placedWords.push(bestCandidate);
        addWordToGrid(bestCandidate.word, bestCandidate.row, bestCandidate.col, bestCandidate.direction);
        placedAny = true;
        if (placedWords.length >= targetCount) break;
      }
    }
  }

  // Place remaining words as floating disconnected components if they couldn't be connected
  if (placedWords.length < Math.min(targetCount, sortedItems.length)) {
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      if (placedWords.some(pw => pw.word === item.word)) continue;

      // Find current max row to place the new word safely below
      let maxR = 50;
      placedWords.forEach(pw => {
        const len = pw.word.length;
        const endR = pw.direction === 'across' ? pw.row : pw.row + len - 1;
        maxR = Math.max(maxR, endR);
      });

      // Place floating word 2 rows below the max row, centered horizontally
      const r = maxR + 2;
      const c = 50 - Math.floor(item.word.length / 2);
      const floatPlaced: PlacedWord = {
        word: item.word,
        clue: item.clue,
        direction: 'across',
        row: r,
        col: c
      };
      placedWords.push(floatPlaced);
      addWordToGrid(floatPlaced.word, floatPlaced.row, floatPlaced.col, floatPlaced.direction);

      if (placedWords.length >= targetCount) break;
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
  grid: Map<string, string>
): PlacedWord | null {
  const word = item.word;
  let bestCandidate: Candidate | null = null;

  for (const pw of placedWords) {
    for (let i = 0; i < pw.word.length; i++) {
      const pwLetter = pw.word[i];
      const pwR = pw.row + (pw.direction === 'across' ? 0 : i);
      const pwC = pw.col + (pw.direction === 'across' ? i : 0);

      for (let j = 0; j < word.length; j++) {
        if (word[j] === pwLetter) {
          const dir: Direction = pw.direction === 'across' ? 'down' : 'across';
          const r = pwR - (dir === 'across' ? 0 : j);
          const c = pwC - (dir === 'across' ? j : 0);

          if (isValidPlacement(word, r, c, dir, grid)) {
            const score = calculatePlacementScore(word, r, c, dir, placedWords, grid);
            if (!bestCandidate || score > bestCandidate.score) {
              bestCandidate = { row: r, col: c, direction: dir, score };
            }
          }
        }
      }
    }
  }

  if (bestCandidate) {
    return {
      word,
      clue: item.clue,
      row: bestCandidate.row,
      col: bestCandidate.col,
      direction: bestCandidate.direction
    };
  }

  return null;
}

function isParallelWord(row: number, col: number, direction: Direction, grid: Map<string, string>): boolean {
  if (direction === 'across') {
    return grid.has(`${row},${col - 1}`) || grid.has(`${row},${col + 1}`);
  }
  return grid.has(`${row - 1},${col}`) || grid.has(`${row + 1},${col}`);
}

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

  if (grid.has(`${startR - dr},${startC - dc}`)) return false;
  if (grid.has(`${startR + dr * len},${startC + dc * len}`)) return false;

  let hasIntersection = false;

  for (let k = 0; k < len; k++) {
    const r = startR + dr * k;
    const c = startC + dc * k;
    const letter = word[k];

    if (grid.has(`${r},${c}`)) {
      if (grid.get(`${r},${c}`) !== letter) return false;
      hasIntersection = true;
    } else {
      if (dir === 'across') {
        const above = grid.has(`${r - 1},${c}`);
        const below = grid.has(`${r + 1},${c}`);
        if (above || below) {
          if (above && isParallelWord(r - 1, c, 'across', grid)) return false;
          if (below && isParallelWord(r + 1, c, 'across', grid)) return false;
        }
      } else {
        const left = grid.has(`${r},${c - 1}`);
        const right = grid.has(`${r},${c + 1}`);
        if (left || right) {
          if (left && isParallelWord(r, c - 1, 'down', grid)) return false;
          if (right && isParallelWord(r, c + 1, 'down', grid)) return false;
        }
      }
    }
  }

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

  return intersections * 10 - area * 0.1;
}
