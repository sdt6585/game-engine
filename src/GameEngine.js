import makeObservable from './EventEmitter';

/**
 * GameEngine - Core class for the merge game grid system
 * Handles grid rendering, state management, and merge mechanics
 */
class GameEngine {
  /** 
   * The DOM element containing the game grid 
   * @type {HTMLElement}
   */
  gridEl = null;

  /** 
   * The container element to render the game in 
   * @type {HTMLElement}
   */
  targetEl = null;

  /** 
   * The size of the game grid
   * @type {Object}
   * @property {number} rows - Number of rows
   * @property {number} cols - Number of columns
   */
  gridSize = { rows: 6, cols: 5 };

  /** 
   * Range of values to generate blocks within
   * @type {Object}
   * @property {number} min - Minimum value
   * @property {number} max - Maximum value
   * @property {number} incrementPower - Power to increment by
   */
  range = { min: 1, max: 32, incrementPower: 2 };

  /** 
   * Maximum number of states to keep in history
   * @type {number}
   */
  stateHistoryVersions = 10;

  /** 
   * Scale factor for hitbox size (relative to block size)
   * @type {number}
   */
  hitBoxScale = 0.8;

  /** 
   * Rules for validating block selection during drag
   * @type {Array<Function>}
   * Each function should accept (block, selectedBlocks, state) parameters
   * and return boolean indicating if selection is valid
   */
  selectionRules = [];

  /** 
   * Rules for validating merges when drag ends
   * @type {Array<Function>}
   * Each function should accept (selectedBlocks, state) parameters
   * and return boolean indicating if merge is valid
   */
  mergeRules = [];

  /** 
   * Reference to the block user is currently dragging through
   * Used to avoid redundant calculations when still in same block
   * @type {Object|null}
   */
  currentBlock = null;

  /** 
   * Currently selected blocks during drag operation
   * @type {Array<Object>}
   */
  selectedBlocks = [];

  /** 
   * Current game state - contains the grid of blocks
   * @type {Array<Array<Object>>}
   * Each block object should have at minimum:
   * - el: DOM element
   * - value: Numeric value
   * - row: Row position
   * - col: Column position
   * - Additional properties can be added by derivative games
   */
  state = []; 

  /** 
   * History of previous states for undo functionality
   * @type {Array<Array<Array<Object>>>}
   */
  stateHistory = [];


  /**
   * Creates a new GameEngine instance
   * @param {Object} options - Configuration options for the game engine
   * @param {HTMLElement} options.targetEl - The container element to render the game in
   * @param {Object} options.gridSize - The size of the game grid
   * @param {number} options.gridSize.rows - Number of rows in the grid (default: 6)
   * @param {number} options.gridSize.cols - Number of columns in the grid (default: 5)
   * @param {Object} options.range - The range of values to generate blocks within
   * @param {number} options.range.min - Minimum value (default: 1)
   * @param {number} options.range.max - Maximum value (default: 16)
   * @param {number} options.stateHistoryVersions - Number of states to keep in history (default: 10)
   * @param {number} options.hitBoxScale - Scale factor for hitbox size (default: 0.8)
   * @param {Array} options.selectionRules - Custom rules for validating block selection
   * @param {Array} options.mergeRules - Custom rules for validating merges
   */
  constructor(options = {}) {
    /** Apply any options to class properties **/
    this.targetEl = options.targetEl || null;

    // Allow passing in the full gridSize object or individual properties
    this.gridSize = options.gridSize || this.gridSize;
    this.gridSize.rows = options.gridSize?.rows || this.gridSize.rows;
    this.gridSize.cols = options.gridSize?.cols || this.gridSize.cols;

    //Allow passing in the full range object or individual properties
    this.range = options.range || this.range;
    this.range.min = options.range?.min || this.range.min;
    this.range.max = options.range?.max || this.range.max;
    
    this.stateHistory = options.stateHistory || [];
    this.stateHistoryVersions = options.stateHistoryVersions || this.stateHistoryVersions;
    this.selectionRules = options.selectionRules || [];
    this.mergeRules = options.mergeRules || [];
    this.hitBoxScale = options.hitBoxScale || this.hitBoxScale;

    //Make self observable, adds handlers property and on, off, once, emit methods to the instance
    makeObservable(this);
  }

  /**
   * Initializes the game engine
   * - Creates grid element if not exists
   * - Attaches event listeners
   * - Initializes state if empty
   * - Renders the initial grid
   * - Fires initialize events
   */
  initialize() {
    // Fire before event
    this.emit('before-initialize');
    
    // Attach event listeners
    
    // Bind methods to maintain correct 'this' context
    this._boundDrag = this.drag.bind(this);
    this._boundDragEnd = this.dragEnd.bind(this);
    
    // Mouse events
    this.gridEl.addEventListener('mousedown', this._boundDrag);
    document.addEventListener('mousemove', this._boundDrag);
    document.addEventListener('mouseup', this._boundDragEnd);
    
    // Touch events
    this.gridEl.addEventListener('touchstart', this._boundDrag, { passive: false });
    document.addEventListener('touchmove', this._boundDrag, { passive: false });
    document.addEventListener('touchend', this._boundDragEnd);
    document.addEventListener('touchcancel', this._boundDragEnd);
    
    // Initialize state if empty
    if (!this.state.length) {
      this.reset();
    } else {
      // Otherwise render existing state
      this.renderGrid();
    }
    
    // Fire after event
    this.emit('after-initialize');
  }

  /**
 * Resets the game state
 * - Clears the grid and recreates blocks
 * - Clears selection and history
 * - Re-renders the grid
 * - Fires 'reset' event
 */
reset() {
  if (emit('before: reset').preventDefault === true) {return};
  
  // Clear selection
  // - not clearing history here, allows for undo/redo functionality to reset
  this.selectedBlocks = [];
  this.currentBlock = null;

  // Initialize state with new block objects
  this.state = this.generateState();
  
  // Render the grid (attaches elements to block objects)
  this.renderGrid();
  
  // Fire after event
  this.emit('after:reset');
}

  /**
   * Renders the entire grid
   * - Creates grid element if it doesn't exist
   * - Fires 'before-render-grid' event
   * - Creates/updates all block elements
   * - Fires 'after-render-grid' event
   * @returns {HTMLElement} - The grid element
   */
  renderGrid() {
    // Fire before event
    this.emit('before-render-grid');
    
    // Make sure we have a target element
    if (!this.targetEl) {
      throw new Error('Cannot render grid: No target element provided');
    }
    
    // Create the grid element if it doesn't exist
    if (!this.gridEl) {
      this.gridEl = document.createElement('div');
      this.gridEl.className = 'merge-game-grid';
      
      // Set grid template based on configuration
      this.gridEl.style.gridTemplateRows = `repeat(${this.gridSize.rows}, 1fr)`;
      this.gridEl.style.gridTemplateColumns = `repeat(${this.gridSize.cols}, 1fr)`;
      
      // Append to target
      this.targetEl.appendChild(this.gridEl);
    }
    
    // Clear existing blocks
    while (this.gridEl.firstChild) {
      this.gridEl.removeChild(this.gridEl.firstChild);
    }
    
    // Render all blocks
    for (let row = 0; row < this.gridSize.rows; row++) {
      for (let col = 0; col < this.gridSize.cols; col++) {
        if (this.state[row] && this.state[row][col]) {
          this.renderBlock(this.state[row][col]);
        }
      }
    }
    
    // Fire after event
    this.emit('after-render-grid');
    
    // Return the grid element
    return this.gridEl;
  }

/** Generate State
 * 
 * @returns {Array<Array<Object>>} - The state of the game
 * @private
 */
generateState() {
  if (emit('before: generateState').preventDefault === true) {return}

  let returnValue = Array.from({ length: this.gridSize.rows }, () => 
    Array.from({ length: this.gridSize.cols }, () => this.generateBlock(row, col)));

  returnValue = (emit('after: generateState', returnValue)).args;

  return returnValue;
}

/** Genreates a new block
 * Uses the range property to generate a random value incremented by powers of 2
 * Override this method to customize block generation
 * @param {number} row - Row position
 * @param {number} col - Column position
 * @returns {Object} - A new block object
 * @private
 */
generateBlock(row, col) {
  if (emit('before: generateBlock', row, col).preventDefault === true) {return}

  // Generate random value within range using the incrementPower
  let potentialValues = [];
  for (let i = this.range.min; i <= this.range.max; i *= this.range.incrementPower) {
    potentialValues.push(i);
  }

  // Generate an array index from the potential values
  const valueIndex = Math.floor(Math.random() * potentialValues.length);

  // Get the value from the potential values array
  const value = potentialValues[valueIndex];
  
  let returnValue = {
    value, 
    row, 
    col, 
    id: `block-${row}-${col}-${Date.now()}`, 
    el: null
  };

  returnValue = (emit('after: generateBlock', returnValue)).args;

  return returnValue;
}


  /**
   * Renders a single block
   * @param {Object} block - Block object to render
   * @param {boolean} [isUpdate=false] - Whether this is an update to an existing block
   * - Fires 'before-render-block' event
   * - Creates/updates block element
   * - Fires 'after-render-block' event
   */
  renderBlock(block, isUpdate = false) {
    // Implementation will be added later
  }

  /**
   * Handles drag events (mousedown, touchstart, mousemove, touchmove)
   * @param {Event} event - The DOM event
   * - Determines if user is hovering over a block
   * - Validates selection against rules
   * - Updates selectedBlocks array
   * - Highlights selected blocks
   * - Fires 'drag' event
   */
  drag(event) {
    // Implementation will be added later
  }

  /**
   * Highlights a block to indicate selection
   * @param {HTMLElement} element - The block element to highlight
   * - Fires 'before-highlight' event
   * - Applies visual highlighting
   * - Fires 'after-highlight' event
   */
  highlight(element) {
    // Implementation will be added later
  }

  /**
   * Removes highlighting from a block
   * @param {HTMLElement} element - The block element to remove highlight from
   * - Fires 'before-remove-highlight' event
   * - Removes visual highlighting
   * - Fires 'after-remove-highlight' event
   */
  removeHighlight(element) {
    // Implementation will be added later
  }

  /**
   * Handles drag end events (mouseup, touchend)
   * @param {Event} event - The DOM event
   * - Validates merge against rules
   * - Fires 'before-drag-end' event
   * - If valid merge, fires 'before-merge' event
   * - Performs merge operation
   * - If merge performed, fires 'after-merge' event
   * - Clears selection
   * - Fires 'after-drag-end' event
   */
  dragEnd(event) {
    // Implementation will be added later
  }

}

export default GameEngine; 