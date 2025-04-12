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
   */
  range = { min: 1, max: 16 };

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
   * Event handlers registered with this engine
   * @type {Object}
   * @private
   */
  _eventHandlers = {};

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
    // Implementation will be added later
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

  /**
   * Registers an event handler
   * @param {string} eventName - Name of the event
   * @param {Function} handler - Function to call when event is triggered
   */
  on(eventName, handler) {
    if (!this._eventHandlers[eventName]) {
      this._eventHandlers[eventName] = [];
    }
    this._eventHandlers[eventName].push(handler);
  }

  /**
   * Removes an event handler
   * @param {string} eventName - Name of the event
   * @param {Function} [handler] - Function to remove. If not provided, removes all handlers for this event.
   */
  off(eventName, handler) {
    if (!this._eventHandlers[eventName]) return;
    
    if (!handler) {
      // Remove all handlers for this event
      delete this._eventHandlers[eventName];
    } else {
      // Remove specific handler
      this._eventHandlers[eventName] = this._eventHandlers[eventName].filter(h => h !== handler);
    }
  }

  /**
   * Triggers an event
   * @param {string} eventName - Name of the event
   * @param {...any} args - Arguments to pass to event handlers
   * @returns {boolean} - Whether the event was canceled (prevented default)
   */
  emit(eventName, ...args) {
    if (!this._eventHandlers[eventName]) return true;
    
    let prevented = false;
    for (const handler of this._eventHandlers[eventName]) {
      const event = { 
        type: eventName, 
        args, 
        preventDefault: () => { prevented = true; }
      };
      handler(event);
    }
    
    return !prevented;
  }

  /**
   * Generates a new block with a random value
   * @returns {Object} - A new block object
   * @private
   */
  _generateBlock() {
    // Implementation will be added later
  }

  /**
   * Gets the DOM element for a block
   * @param {string|Object} blockOrId - Block object or block ID
   * @returns {HTMLElement|null} - The DOM element or null if not found
   * @private
   */
  _getBlockElement(blockOrId) {
    // Implementation will be added later
  }

  /**
   * Adds a state to the history
   * @param {Array<Array<Object>>} state - The state to add
   * @private
   */
  _addToHistory(state) {
    // Implementation will be added later
  }

  /**
   * Check if two blocks are adjacent
   * @param {Object} block1 - First block
   * @param {Object} block2 - Second block
   * @returns {boolean} - Whether the blocks are adjacent
   * @private
   */
  _areBlocksAdjacent(block1, block2) {
    // Implementation will be added later
  }

  /**
   * Get the position in the grid from event coordinates
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Object|null} - {row, col} position or null if outside grid
   * @private
   */
  _getPositionFromCoordinates(x, y) {
    // Implementation will be added later
  }
}

export default GameEngine; 