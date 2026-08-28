import config from './config';
import type { GridCell } from './types';

const createInitialBoard = (): GridCell[][] =>
  Array.from({ length: config.numReels }, (_, reel) =>
    Array.from({ length: config.numRows[reel] }, (_, row) => ({
      position: { reel, row },
      symbol: 'pizza',
      isWild: false,
      isScatter: false,
    })),
  );

export const stateGame = $state({
  board: createInitialBoard(),
});
