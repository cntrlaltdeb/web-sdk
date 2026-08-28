<script lang="ts">
  export type BoardCell = {
    symbol: string;
    isWild?: boolean;
    isScatter?: boolean;
    multiplier?: number;
  };

  const defaultCells: BoardCell[] = Array.from({ length: 25 }, () => ({ symbol: 'Pizza' }));

  export let cells: BoardCell[] = defaultCells;
</script>

<section class="board" aria-label="Chef Battle board">
  {#each Array.from({ length: 25 }, (_, index) => cells[index] ?? { symbol: 'Empty' }) as cell, index}
    <div
      class:wild={cell.isWild}
      class:scatter={cell.isScatter}
      class:multiplier-spot={cell.multiplier !== undefined}
      class="cell"
      aria-label={`Cell ${index + 1}: ${cell.isWild ? 'Wild' : cell.isScatter ? 'Scatter' : cell.symbol}`}
    >
      <span class="symbol">{cell.isWild ? 'Wild' : cell.isScatter ? 'Scatter' : cell.symbol}</span>
      {#if cell.multiplier !== undefined}
        <span class="multiplier">×{cell.multiplier}</span>
      {/if}
    </div>
  {/each}
</section>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: clamp(0.25rem, 1vw, 0.75rem);
    inline-size: min(100%, 42rem);
    margin-inline: auto;
  }

  .cell {
    position: relative;
    display: grid;
    min-inline-size: 0;
    aspect-ratio: 1;
    place-items: center;
    border: 2px solid #442d1f;
    border-radius: 0.75rem;
    background: #fff4d9;
    color: #442d1f;
    font-weight: 700;
    text-align: center;
  }

  .symbol {
    padding-inline: 0.25rem;
    font-size: clamp(0.625rem, 2.5vw, 1rem);
    overflow-wrap: anywhere;
  }

  .wild {
    background: #f7c948;
  }

  .scatter {
    background: #c97bff;
  }

  .multiplier-spot {
    box-shadow: inset 0 0 0 3px #ef6c35;
  }

  .multiplier {
    position: absolute;
    inset-block-start: 0.2rem;
    inset-inline-end: 0.2rem;
    padding: 0.1rem 0.25rem;
    border-radius: 999px;
    background: #ef6c35;
    color: #fff;
    font-size: clamp(0.55rem, 2vw, 0.8rem);
  }
</style>
