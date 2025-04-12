// test/GameEngine.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameEngine from '../src/GameEngine.js';

describe('GameEngine', () => {
  let engine;
  
  beforeEach(() => {
    // Create a mock DOM element for testing
    document.body.innerHTML = '<div id="game-container"></div>';
    const container = document.getElementById('game-container');
    
    // Initialize game engine
    engine = new GameEngine({
      targetEl: container,
      gridSize: { rows: 3, cols: 3 },
      range: { min: 2, max: 16, incrementPower: 2 }
    });
  });
  
  it('should initialize with correct properties', () => {
    expect(engine.gridSize.rows).toBe(3);
    expect(engine.gridSize.cols).toBe(3);
    expect(engine.range.min).toBe(2);
    expect(engine.range.max).toBe(16);
    expect(engine.range.incrementPower).toBe(2);
  });
  
  it('should generate blocks with valid values', async () => {
    const block = await engine.generateBlock(0, 0);
    expect(block.row).toBe(0);
    expect(block.col).toBe(0);
    expect(block.value).toBeGreaterThanOrEqual(engine.range.min);
    expect(block.value).toBeLessThanOrEqual(engine.range.max);
    
    // Check that value is a power of the incrementPower
    const logValue = Math.log(block.value) / Math.log(engine.range.incrementPower);
    expect(Math.abs(Math.round(logValue) - logValue)).toBeLessThan(0.00001);
  });
  
  it('should create a grid with the correct number of cells', async () => {
    await engine.initialize();
    
    const cells = engine.gridEl.querySelectorAll('.merge-game-block');
    expect(cells.length).toBe(engine.gridSize.rows * engine.gridSize.cols);
  });
  
  it('should highlight and unhighlight blocks', async () => {
    await engine.initialize();
    
    const cell = engine.gridEl.querySelector('.merge-game-block');
    await engine.highlight(cell);
    expect(cell.classList.contains('highlighted')).toBe(true);
    
    await engine.removeHighlight(cell);
    expect(cell.classList.contains('highlighted')).toBe(false);
  });
});