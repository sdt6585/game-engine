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
   * Whether the user is currently dragging
   * @type {boolean}
   */
  isDragging = false;

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
   * Maximum number of states to keep in history
   * @type {number}
   */
  stateHistoryVersions = 10;


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
    const beforeEvent = await this.emit('before: initialize');
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
      this.gridEl.addEventListener('mousedown', boundDrag);
      document.addEventListener('mousemove', boundDrag);
      document.addEventListener('mouseup', boundDragEnd);
      
      // Touch events
      this.gridEl.addEventListener('touchstart', boundDrag, { passive: false });
      document.addEventListener('touchmove', boundDrag, { passive: false });
      document.addEventListener('touchend', boundDragEnd);
      document.addEventListener('touchcancel', boundDragEnd);
    }
    
    await this.emit('after: initialize');
  }

  /**
   * Resets the game state
   * - Clears the grid and recreates blocks
   * - Clears selection and history
   * - Re-renders the grid
   * - Fires 'reset' event
   */
  async reset() {
    const beforeEvent = await this.emit('before: reset');
    if (beforeEvent.preventDefault) return;
    
    // Clear selection
    this.selectedBlocks = [];
    this.currentBlock = null;
  
    // Initialize state with new block objects
    this.state = await this.generateState();
    
    // Render the grid (attaches elements to block objects)
    await this.renderGrid();
    
    await this.emit('after: reset');
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
    const beforeEvent = await this.emit('before: generateState');
    if (beforeEvent.preventDefault === true) return;

    // Generate a new state with new block objects
    let newState = Array.from({ length: this.gridSize.rows }, (_, row) => 
      Array.from({ length: this.gridSize.cols }, (_, col) => 
        this.generateBlock(row, col)
      )
    );

    // Allow event handlers to modify the new state
    const afterEvent = await this.emit('after: generateState', newState);
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
    const beforeEvent = await this.emit('before: generateBlock', {row, col});
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
    const afterEvent = await this.emit('after: generateBlock', block);
    return afterEvent.args || block;
  }


  /** Renders a single block
   * - Creates a new element if it doesn't exist
   * @param {Object} block - Block object to render
   */
  async renderBlock(block) {
    const beforeEvent = await this.emit('before: renderBlock', block);
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
    
    const afterEvent = await this.emit('after: renderBlock', block);
    return afterEvent.args || block;
  }

  /**
   * Highlights a block to indicate selection
   * 
   * @param {HTMLElement} element - The block element to highlight
   */
  async highlight(element) {
    const beforeEvent = await this.emit('before: highlight', element);
    if (beforeEvent.preventDefault) return;
    
    element.classList.add('highlighted');
    
    await this.emit('after: highlight', element);
  }

  /**
   * Removes highlighting from a block
   * 
   * @param {HTMLElement} element - The block element to remove highlight from
   */
  async removeHighlight(element) {
    const beforeEvent = await this.emit('before: removeHighlight', element);
    if (beforeEvent.preventDefault) return;
    
    element.classList.remove('highlighted');
    
    await this.emit('after: removeHighlight', element);
  }

  /**
 * Handles drag events (mousedown, touchstart, mousemove, touchmove)
 * 
 * Processes user interaction to select blocks during drag operations.
 * Detects blocks under the pointer, validates against selection rules,
 * and updates the selection state.
 * 
 * @param {Event} event - The DOM event (mouse or touch)
 */
  async drag(event) {
    const beforeEvent = await this.emit('before: drag', event);
    if (beforeEvent.preventDefault) return;
    
    // Determine if this is the start of a drag or continuation
    const isStart = event.type === 'mousedown' || event.type === 'touchstart';
    
    // For touchstart/mousedown, initialize drag state
    if (isStart) {
      event.preventDefault(); // Prevent default to avoid scrolling on touch devices
      this.isDragging = true;
      this.selectedBlocks = [];
    } else if (!this.isDragging) {
      // If not dragging and not a start event, ignore
      return;
    }
    
    // Get pointer coordinates
    const coords = this.getEventCoordinates(event);
    if (!coords) return;
    
    // Find the block at the current position
    const block = this.getBlockAtPosition(coords.x, coords.y);
    if (!block) return;
    
    // If we're still on the same block, do nothing (optimization)
    if (this.currentBlock === block) return;
    
    // Run through all selection rules
    let isValidSelection = true;
    for (const rule of this.selectionRules) {
      if (!rule(block, this.selectedBlocks, this.state)) {
        isValidSelection = false;
        break;
      }
    }
    
    // If valid selection, add to selected blocks
    if (isValidSelection) {
      // Store as current block
      this.currentBlock = block;
      
      // Add to selection
      this.selectedBlocks.push(block);
      
      // Highlight the block
      if (block.el) {
        await this.highlight(block.el);
      }
      
      // Emit selection event
      await this.emit('after: select', { block, selectedBlocks: this.selectedBlocks });
    }
    
    await this.emit('after: drag', { event, block: this.currentBlock, isValidSelection });
  }

  /**
   * Gets the x,y coordinates from a mouse or touch event
   * 
   * @param {Event} event - The DOM event
   * @returns {Object|null} - {x, y} coordinates or null
   * @private
   */
  getEventCoordinates(event) {
    // Handle both mouse and touch events
    if (event.clientX !== undefined) {
      return { x: event.clientX, y: event.clientY };
    } else if (event.touches && event.touches.length > 0) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return null;
  }

  /**
   * Gets the block at the given coordinates
   * @param {number} x - The x coordinate
   * @param {number} y - The y coordinate
   * @returns {Object|null} - The block object or null
   */
  getBlockAtPosition(x, y) {
    // Create smaller hitbox as a percentage of block size
    const scale = this.hitBoxScale;
    
    // Iterate through all rows and columns in the state
    for (let row = 0; row < this.state.length; row++) {
      if (!this.state[row]) continue;
      
      for (let col = 0; col < this.state[row].length; col++) {
        const block = this.state[row][col];
        
        // Skip empty cells
        if (!block || !block.el) continue;
        
        // Get element boundaries
        const rect = block.el.getBoundingClientRect();

        const hitboxWidth = rect.width * scale;
        const hitboxHeight = rect.height * scale;

        // Calculate hitbox top/bottom/left/right
        const hitBox = {
          top: rect.top - hitboxHeight / 2,
          bottom: rect.bottom + hitboxHeight / 2,
          left: rect.left - hitboxWidth / 2,
          right: rect.right + hitboxWidth / 2
        }

        // Check if point is within hitbox
        if (
          x >= hitBox.left && 
          x <= hitBox.right && 
          y >= hitBox.top && 
          y <= hitBox.bottom
        ) {
          return block;
        }
      }
    }
    
    return null;
  }

  /**
   * Handles drag end events (mouseup, touchend)
   * 
   * Validates the final selection against merge rules, and if valid,
   * performs the merge operation. Cleans up selection state.
   * 
   * @param {Event} event - The DOM event
   */
  async dragEnd(event) {
    const beforeEvent = await this.emit('before: dragEnd', event);
    if (beforeEvent.preventDefault) return;
    
    // End drag state
    this.isDragging = false;
    this.currentBlock = null;
    
    // If no blocks selected, nothing to do
    if (this.selectedBlocks.length === 0) {
      await this.emit('after: dragEnd', { event, merged: false });
      return;
    }
    
    // Check if merge is valid by running all merge rules
    let isValidMerge = true;
    for (const rule of this.mergeRules) {
      if (!rule(this.selectedBlocks, this.state)) {
        isValidMerge = false;
        break;
      }
    }
    
    // If the merge is valid, emit the merge event
    if (isValidMerge && this.selectedBlocks.length >= 2) {
      
      // Perform merge (actual implementation will be handled by event handlers)
      await this.processMerge();

    }
    
    // Clear selection regardless of merge result
    const oldSelection = [...this.selectedBlocks];
    this.selectedBlocks = [];
    
    // Remove highlights from previously selected blocks
    for (const block of oldSelection) {
      if (block && block.el) {
        await this.removeHighlight(block.el);
      }
    }
    
    // Emit the final event
    await this.emit('after: dragEnd', { 
      event,
      merged: isValidMerge && oldSelection.length >= 2
    });
  }

  /**
   * Calculates the merge value for a set of blocks
   * @param {Array} blocks - Array of blocks
   * @returns {number} - The merge value
   */
  async calculateMergeValue(blocks) {
    const beforeEvent = await this.emit('before: calculateMergeValue', blocks);
    if (beforeEvent.preventDefault) return null;

    const mergeValue = blocks.reduce((acc, block) => acc + block.value, 0);

    const afterEvent = await this.emit('after: calculateMergeValue', { blocks, mergeValue });
    return afterEvent.args || mergeValue;
  }

  /**
 * Process a merge operation on selected blocks
 * 
 * This provides a default implementation for merging blocks:
 * 1. The last selected block becomes the target (destination)
 * 2. Other selected blocks are removed
 * 3. The target block gets updated with the merged value
 * 4. Empty spaces are filled with new blocks
 * 
 * @param {Object} options - Merge options
 * @param {Array} options.blocks - All selected blocks
 * @param {Object} options.targetBlock - Destination block for the merge
 * @param {number} options.mergeValue - The value for the merged block
 * @returns {Promise<boolean>} - Success status
 */
  async processMerge() {
    const beforeEvent = await this.emit('before: processMerge');
    if (beforeEvent.preventDefault) return false;

    //Add current state to history
    this.addToHistory(this.state);

    //Get relevant values
    let blocks = this.selectedBlocks;
    let targetBlock = this.currentBlock;
    let mergeValue = await this.calculateMergeValue(blocks);
    
    if (!blocks || blocks.length < 2 || !targetBlock) {
      return false;
    }
    
    // Get blocks to remove (all except target)
    const blocksToRemove = blocks.filter(block => block !== targetBlock);
    
    // Save positions for later filling
    const emptyPositions = blocksToRemove.map(block => ({
      row: block.row,
      col: block.col
    }));
    
    // Add animation class to removed blocks
    for (const block of blocksToRemove) {
      if (block.el) {
        block.el.classList.add('merge-game-block-disappearing');
        
        // Wait for animation to complete before removing
        await new Promise(resolve => {
          const onAnimEnd = () => {
            block.el.removeEventListener('animationend', onAnimEnd);
            resolve();
          };
          block.el.addEventListener('animationend', onAnimEnd);
        });
        
        // Remove element from DOM
        if (block.el.parentNode) {
          block.el.parentNode.removeChild(block.el);
        }
      }
      
      // Remove block from state
      if (this.state[block.row] && this.state[block.row][block.col] === block) {
        this.state[block.row][block.col] = null;
      }
    }
    
    // Update target block with new value
    if (targetBlock.el) {
      // Apply merge animation
      targetBlock.el.classList.add('merge-game-block-merging');
      
      // Wait for animation - have to use a promise to wait for the animation to end, can't await the event listener
      await new Promise(resolve => {
        const onAnimEnd = () => {
          targetBlock.el.removeEventListener('animationend', onAnimEnd);
          targetBlock.el.classList.remove('merge-game-block-merging');
          resolve();
        };
        targetBlock.el.addEventListener('animationend', onAnimEnd);
      });
    }
    
    // Update the value in the model
    targetBlock.value = mergeValue;

    // Re-render the block using the standard rendering method
    await this.renderBlock(targetBlock);
    
    // Fill empty positions with new blocks
    const newBlocks = await this.fillEmptyPositions(emptyPositions);
    
    await this.emit('after: processMerge', {
      blocks,
      targetBlock,
      mergeValue,
      newBlocks
    });
    
    return true;
  }

  /**
   * Fill empty positions with new blocks
   * 
   * @param {Array} positions - Array of {row, col} positions to fill
   * @returns {Promise<Array>} - Array of new blocks
   */
  async fillEmptyPositions(positions) {
    const beforeEvent = await this.emit('before:fillEmptyPositions', positions);
    if (beforeEvent.preventDefault) return [];
    
    const newBlocks = [];
    
    // Fill each position with a new block
    for (const pos of positions) {
      const block = await this.generateBlock(pos.row, pos.col);
      
      // Create element for the block
      if (this.gridEl) {
        const el = document.createElement('div');
        el.className = 'merge-game-block merge-game-block-falling';
        el.textContent = block.value.toString();
        
        // Position the element
        el.style.gridRow = pos.row + 1;
        el.style.gridColumn = pos.col + 1;
        
        // Add to DOM
        this.gridEl.appendChild(el);
        
        // Set element reference in block
        block.el = el;
        
        // Wait for animation
        await new Promise(resolve => {
          const onAnimEnd = () => {
            el.removeEventListener('animationend', onAnimEnd);
            el.classList.remove('merge-game-block-falling');
            resolve();
          };
          el.addEventListener('animationend', onAnimEnd);
        });
      }
      
      // Update state
      if (!this.state[pos.row]) {
        this.state[pos.row] = [];
      }
      this.state[pos.row][pos.col] = block;
      
      newBlocks.push(block);
    }
    
    const afterEvent = await this.emit('after:fillEmptyPositions', newBlocks);
    return afterEvent.args || newBlocks;
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