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
   * Number of previous states to keep in history
   * @type {number}
   */
  stateHistoryLimit = 10;


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
  async initialize() {
    const beforeEvent = await this.emit('before:initialize');
    if (beforeEvent.preventDefault) return;
    
    // Initialize state if empty
    if (!this.state.length) {
      await this.reset();
    } else {
      // Otherwise render existing state
      await this.renderGrid();
    }

    /** Setup event listeners **/
    // Bind methods to maintain correct 'this' context
    let boundDrag = this.drag.bind(this);
    let boundDragEnd = this.dragEnd.bind(this);
    
    // Create grid element if it doesn't exist
    if (!this.gridEl && this.targetEl) {
      this.gridEl = document.createElement('div');
      this.gridEl.className = 'merge-game-grid';
      
      // Set grid template based on configuration
      this.gridEl.style.gridTemplateRows = `repeat(${this.gridSize.rows}, 1fr)`;
      this.gridEl.style.gridTemplateColumns = `repeat(${this.gridSize.cols}, 1fr)`;
      
      // Append to target
      this.targetEl.appendChild(this.gridEl);
    }
    
    if (this.gridEl) {
      // Mouse events
      this.gridEl.addEventListener('mousedown', this.boundDrag);
      document.addEventListener('mousemove', this.boundDrag);
      document.addEventListener('mouseup', this.boundDragEnd);
      
      // Touch events
      this.gridEl.addEventListener('touchstart', this.boundDrag, { passive: false });
      document.addEventListener('touchmove', this.boundDrag, { passive: false });
      document.addEventListener('touchend', this.boundDragEnd);
      document.addEventListener('touchcancel', this.boundDragEnd);
    }
    
    await this.emit('after:initialize');
  }

  /**
   * Resets the game state
   * - Clears the grid and recreates blocks
   * - Clears selection and history
   * - Re-renders the grid
   * - Fires 'reset' event
   */
  async reset() {
    const beforeEvent = await this.emit('before:reset');
    if (beforeEvent.preventDefault) return;
    
    // Clear selection
    this.selectedBlocks = [];
    this.currentBlock = null;
  
    // Initialize state with new block objects
    this.state = await this.generateState();
    
    // Render the grid (attaches elements to block objects)
    await this.renderGrid();
    
    await this.emit('after:reset');
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

  /** Generates a complete game state
   * - Generates a new state with new block objects
   * @returns {Array<Array<Object>>} - A 2D array of block objects
   */
  async generateState() {
    // Allow event handlers to prevent generation
    const beforeEvent = await this.emit('before:generateState');
    if (beforeEvent.preventDefault === true) return;

    // Generate a new state with new block objects
    let newState = Array.from({ length: this.gridSize.rows }, (_, row) => 
      Array.from({ length: this.gridSize.cols }, (_, col) => 
        this.generateBlock(row, col)
      )
    );

    // Allow event handlers to modify the new state
    const afterEvent = await this.emit('after:generateState', newState);
    newState = afterEvent.args || newState;

    return newState;
  }

  /**
   * Generates a new block
   * Uses the range property to generate a random value based on incrementPower
   * Override this method to customize block generation
   * @param {number} row - Row position
   * @param {number} col - Column position
   * @returns {Object} - A new block object
   */
  async generateBlock(row, col) {
    const beforeEvent = await this.emit('before:generateBlock', {row, col});
    if (beforeEvent.preventDefault === true) return null;

    // Default increment power if not specified
    const incrementPower = this.range.incrementPower || 2;
    
    // Generate array of possible values based on range and increment power
    const potentialValues = [];
    for (let value = this.range.min; value <= this.range.max; value *= incrementPower) {
      potentialValues.push(value);
    }

    // Generate a random value from potential values
    const randomIndex = Math.floor(Math.random() * potentialValues.length);
    const value = potentialValues[randomIndex];
    
    // Create the block object
    let block = {
      value, 
      row, 
      col, 
      id: `block-${row}-${col}-${Date.now()}`, 
      el: null
    };

    // Allow event handlers to modify the block
    const afterEvent = await this.emit('after:generateBlock', block);
    return afterEvent.args || block;
  }


/** Renders a single block
 * - Creates a new element if it doesn't exist
 * @param {Object} block - Block object to render
 */
async renderBlock(block) {
  const beforeEvent = await this.emit('before:renderBlock', block);
  if (beforeEvent.preventDefault === true) return;
  
  if (block.el) {
    // Update existing element
    block.el.textContent = block.value;
    block.el.setAttribute('data-value', block.value);
    
    // Update position
    block.el.style.gridRow = block.row + 1;
    block.el.style.gridColumn = block.col + 1;
  } else {
    // Create new element
    const element = document.createElement('div');
    element.className = 'merge-game-block';
    element.textContent = block.value;
    element.setAttribute('data-value', block.value);
    element.setAttribute('data-id', block.id);
    
    // Set position in grid
    element.style.gridRow = block.row + 1;
    element.style.gridColumn = block.col + 1;
    
    // Store element reference in block
    block.el = element;
    
    // Add to the grid
    this.gridEl.appendChild(element);
  }
  
  const afterEvent = await this.emit('after:renderBlock', block);
  return afterEvent.args || block;
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
   * 
   * @param {HTMLElement} element - The block element to highlight
   */
  async highlight(element) {
    const beforeEvent = await this.emit('before:highlight', element);
    if (beforeEvent.preventDefault) return;
    
    element.classList.add('highlighted');
    
    await this.emit('after:highlight', element);
  }

  /**
   * Removes highlighting from a block
   * 
   * @param {HTMLElement} element - The block element to remove highlight from
   */
  async removeHighlight(element) {
    const beforeEvent = await this.emit('before:removeHighlight', element);
    if (beforeEvent.preventDefault) return;
    
    element.classList.remove('highlighted');
    
    await this.emit('after:removeHighlight', element);
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

  /**
 * Adds a state to the history
 * 
 * @param {Array<Array<Object>>} state - The state to add
 * @private
 */
  addToHistory(state) {
    // Create a deep copy of the state
    const stateCopy = JSON.parse(JSON.stringify(
      state.map(row => row.map(block => {
        // Exclude DOM element from serialization
        const { el, ...rest } = block;
        return rest;
      }))
    ));
    
    // Add to history
    this.stateHistory.push(stateCopy);
    
    // Limit history size
    if (this.stateHistory.length > this.stateHistoryVersions) {
      this.stateHistory.shift();
    }
  }

}

export default GameEngine; 