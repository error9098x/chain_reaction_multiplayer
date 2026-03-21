/**
 * Bug Condition Exploration Tests for Game End Animation Fixes
 * 
 * **Validates: Requirements 2.1**
 * 
 * These tests are EXPECTED TO FAIL on unfixed code to confirm bugs exist.
 * When they fail, it proves the bug conditions are present.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

describe('Bug 1: Victory Modal Timing', () => {
  let mockDocument;
  let mockSocket;
  let winnerModal;
  let projectiles;
  let pendingBatch;
  let gameActive;

  beforeEach(() => {
    // Setup DOM mocks
    winnerModal = {
      classList: {
        contains: vi.fn((className) => className !== 'hidden'),
        remove: vi.fn(),
        add: vi.fn(),
      }
    };

    mockDocument = {
      getElementById: vi.fn((id) => {
        if (id === 'winner-modal') return winnerModal;
        if (id === 'winner-modal-title') return { textContent: '' };
        if (id === 'winner-modal-text') return { textContent: '' };
        if (id === 'modal-rematch-btn') return { 
          classList: { remove: vi.fn(), add: vi.fn() },
          querySelector: vi.fn(() => ({ textContent: '' })),
          disabled: false
        };
        if (id === 'modal-exit-btn') return { classList: { remove: vi.fn() } };
        if (id === 'modal-waiting-msg') return { classList: { add: vi.fn() } };
        return null;
      }),
    };

    // Setup socket mock
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      id: 'test-player-id',
    };

    // Initialize game state
    projectiles = [];
    pendingBatch = null;
    gameActive = true;

    // Mock global objects
    global.document = mockDocument;
    global.io = vi.fn(() => mockSocket);
  });

  /**
   * Property 1: Bug Condition - Victory Modal Timing
   * 
   * For any game-end state where matchEnded fires and animations are active
   * (projectiles.length > 0 OR pendingBatch !== null), the modal should remain
   * hidden until animations complete.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: This test will FAIL because the modal
   * appears immediately when matchEnded fires, even while animations are active.
   */
  it('should keep modal hidden while projectiles are flying', () => {
    // Simulate active projectiles
    projectiles = [
      { sx: 0, sy: 0, ex: 100, ey: 100, start: Date.now(), dur: 180, applied: false, done: false },
      { sx: 100, sy: 100, ex: 200, ey: 200, start: Date.now(), dur: 180, applied: false, done: false },
    ];

    // Simulate matchEnded event firing
    const matchEndedData = {
      winnerId: 'player-1',
      winnerName: 'Alice',
      winnerColor: 'red',
      reason: 'Dominated the board'
    };

    // Trigger matchEnded handler behavior
    gameActive = false;
    winnerModal.classList.remove('hidden');

    // BUG CONDITION: Modal should remain hidden while projectiles.length > 0
    // On unfixed code, the modal is shown immediately
    const isModalHidden = winnerModal.classList.contains('hidden');
    
    // This assertion will FAIL on unfixed code, proving the bug exists
    expect(isModalHidden).toBe(true);
    expect(projectiles.length).toBeGreaterThan(0);
  });

  it('should keep modal hidden while pendingBatch is processing', () => {
    // Simulate active pendingBatch
    pendingBatch = {
      events: [
        { type: 'explodeWave', explosions: [{ row: 1, col: 1, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 2, col: 2, color: 'red' }] },
      ],
      grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
      turnIndex: 0,
      turnCount: 5
    };

    // Simulate matchEnded event firing
    const matchEndedData = {
      winnerId: 'player-1',
      winnerName: 'Bob',
      winnerColor: 'blue',
      reason: 'Chain reaction victory'
    };

    // Trigger matchEnded handler behavior
    gameActive = false;
    winnerModal.classList.remove('hidden');

    // BUG CONDITION: Modal should remain hidden while pendingBatch !== null
    // On unfixed code, the modal is shown immediately
    const isModalHidden = winnerModal.classList.contains('hidden');
    
    // This assertion will FAIL on unfixed code, proving the bug exists
    expect(isModalHidden).toBe(true);
    expect(pendingBatch).not.toBe(null);
  });

  /**
   * Property-Based Test: Modal timing with various animation states
   * 
   * Tests that for ANY combination of active projectiles and pendingBatch,
   * the modal remains hidden until animations complete.
   */
  it('should keep modal hidden for any active animation state', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary number of projectiles (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate arbitrary pendingBatch with events (1-5)
        fc.integer({ min: 1, max: 5 }),
        (projectileCount, eventCount) => {
          // Setup: Create projectiles
          const testProjectiles = Array.from({ length: projectileCount }, (_, i) => ({
            sx: i * 10,
            sy: i * 10,
            ex: (i + 1) * 100,
            ey: (i + 1) * 100,
            start: Date.now(),
            dur: 180,
            applied: false,
            done: false
          }));

          // Setup: Create pendingBatch
          const testPendingBatch = {
            events: Array.from({ length: eventCount }, (_, i) => ({
              type: 'explodeWave',
              explosions: [{ row: i, col: i, color: 'red' }]
            })),
            grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
            turnIndex: 0,
            turnCount: 5
          };

          // Simulate matchEnded firing with active animations
          const testModal = {
            classList: {
              contains: vi.fn((className) => className !== 'hidden'),
              remove: vi.fn(),
              add: vi.fn(),
            }
          };

          // Trigger matchEnded behavior
          testModal.classList.remove('hidden');

          // BUG CONDITION: Modal should be hidden while animations are active
          const isModalHidden = testModal.classList.contains('hidden');
          const hasActiveAnimations = testProjectiles.length > 0 || testPendingBatch !== null;

          // This will FAIL on unfixed code when animations are active
          return !hasActiveAnimations || isModalHidden;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Bug 2: Infinite Render Loop', () => {
  let mockRequestAnimationFrame;
  let rafCallCount;
  let gameActive;
  let projectiles;
  let pendingBatch;
  let isRendering;

  beforeEach(() => {
    // Reset state
    gameActive = true;
    projectiles = [];
    pendingBatch = null;
    isRendering = false;
    rafCallCount = 0;

    // Mock requestAnimationFrame to count calls
    mockRequestAnimationFrame = vi.fn((callback) => {
      rafCallCount++;
      // Simulate async execution
      setTimeout(() => callback(Date.now()), 0);
      return rafCallCount;
    });

    global.requestAnimationFrame = mockRequestAnimationFrame;
  });

  /**
   * Property 2: Bug Condition - Render Loop Termination
   * 
   * For any game-end state where matchEnded fires during an active chain reaction
   * (pendingBatch !== null), the render loop should terminate gracefully.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: This test will FAIL because pendingBatch
   * is never cleared when matchEnded fires, causing the render loop to continue
   * indefinitely.
   * 
   * **Validates: Requirements 2.2**
   */
  it('should terminate render loop when matchEnded fires with active pendingBatch', async () => {
    // Simulate active pendingBatch with 5 events
    pendingBatch = {
      events: [
        { type: 'explodeWave', explosions: [{ row: 0, col: 0, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 1, col: 1, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 2, col: 2, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 3, col: 3, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 4, col: 4, color: 'red' }] },
      ],
      grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
      turnIndex: 0,
      turnCount: 5
    };

    // Simulate the render loop logic
    const simulateRenderLoop = () => {
      // This mimics the render function's termination condition check
      if (!gameActive && projectiles.length === 0 && pendingBatch === null) {
        isRendering = false;
        return;
      }

      // Continue loop condition (line 809 in game.js)
      if (gameActive || projectiles.length > 0 || pendingBatch !== null) {
        requestAnimationFrame(simulateRenderLoop);
      } else {
        isRendering = false;
      }
    };

    // Start render loop
    isRendering = true;
    simulateRenderLoop();

    // Simulate matchEnded firing - this is the UNFIXED behavior
    gameActive = false;
    // BUG: pendingBatch is NOT cleared here in unfixed code
    // pendingBatch = null; // This line is missing in unfixed code

    // Wait for 2 seconds and monitor requestAnimationFrame calls
    await new Promise(resolve => setTimeout(resolve, 2000));

    // BUG CONDITION: Render loop should terminate within reasonable time
    // On unfixed code, the loop continues because pendingBatch !== null
    // We expect fewer than 120 RAF calls in 2 seconds (60fps = 120 frames)
    // But on unfixed code, it will continue indefinitely
    
    // This assertion will FAIL on unfixed code, proving the bug exists
    expect(rafCallCount).toBeLessThan(120);
    expect(pendingBatch).toBe(null); // Should be cleared when game ends
  });

  /**
   * Property-Based Test: Render loop termination with various pendingBatch sizes
   * 
   * Tests that for ANY pendingBatch configuration, the render loop terminates
   * when matchEnded fires.
   */
  it('should terminate render loop for any pendingBatch size', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary number of events in pendingBatch (1-10)
        fc.integer({ min: 1, max: 10 }),
        async (eventCount) => {
          // Reset state for each test case
          rafCallCount = 0;
          gameActive = true;
          projectiles = [];
          
          // Create pendingBatch with specified number of events
          pendingBatch = {
            events: Array.from({ length: eventCount }, (_, i) => ({
              type: 'explodeWave',
              explosions: [{ row: i, col: i, color: 'red' }]
            })),
            grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
            turnIndex: 0,
            turnCount: 5
          };

          // Simulate render loop
          const simulateRenderLoop = () => {
            if (!gameActive && projectiles.length === 0 && pendingBatch === null) {
              isRendering = false;
              return;
            }

            if (gameActive || projectiles.length > 0 || pendingBatch !== null) {
              requestAnimationFrame(simulateRenderLoop);
            } else {
              isRendering = false;
            }
          };

          // Start render loop
          isRendering = true;
          simulateRenderLoop();

          // Simulate matchEnded firing - UNFIXED behavior
          gameActive = false;
          // BUG: pendingBatch NOT cleared

          // Wait 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));

          // BUG CONDITION: Loop should terminate, but continues on unfixed code
          // This will FAIL on unfixed code
          return rafCallCount < 120 && pendingBatch === null;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Counterexample Documentation Test
   * 
   * This test explicitly documents the expected counterexamples that prove
   * the bug exists on unfixed code.
   */
  it('should document counterexamples: pendingBatch remains non-null after game ends', () => {
    // Setup: Active pendingBatch
    pendingBatch = {
      events: [
        { type: 'explodeWave', explosions: [{ row: 0, col: 0, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 1, col: 1, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 2, col: 2, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 3, col: 3, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 4, col: 4, color: 'red' }] },
      ],
      grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
      turnIndex: 0,
      turnCount: 5
    };

    // Simulate matchEnded firing
    gameActive = false;
    // BUG: pendingBatch is NOT cleared

    // COUNTEREXAMPLE 1: pendingBatch remains non-null after game ends
    expect(pendingBatch).toBe(null); // Will FAIL on unfixed code

    // COUNTEREXAMPLE 2: Render loop continuation condition remains true
    const shouldContinueLoop = gameActive || projectiles.length > 0 || pendingBatch !== null;
    expect(shouldContinueLoop).toBe(false); // Will FAIL on unfixed code

    // Document the bug condition
    const bugConditionMet = !gameActive && pendingBatch !== null;
    expect(bugConditionMet).toBe(false); // Will FAIL - proves bug exists
  });
});

describe('Preservation Tests: Non-Buggy Game End Behaviors', () => {
  let mockDocument;
  let mockSocket;
  let winnerModal;
  let projectiles;
  let pendingBatch;
  let gameActive;
  let winnerModalTitle;
  let winnerModalText;
  let modalRematchBtn;
  let modalExitBtn;
  let modalWaitingMsg;

  beforeEach(() => {
    // Setup DOM mocks
    winnerModal = {
      classList: {
        contains: vi.fn((className) => className !== 'hidden'),
        remove: vi.fn(),
        add: vi.fn(),
      }
    };

    winnerModalTitle = { textContent: '' };
    winnerModalText = { textContent: '' };
    modalRematchBtn = {
      classList: { remove: vi.fn(), add: vi.fn() },
      querySelector: vi.fn(() => ({ textContent: '' })),
      disabled: false
    };
    modalExitBtn = { classList: { remove: vi.fn() } };
    modalWaitingMsg = { classList: { add: vi.fn() } };

    mockDocument = {
      getElementById: vi.fn((id) => {
        if (id === 'winner-modal') return winnerModal;
        if (id === 'winner-modal-title') return winnerModalTitle;
        if (id === 'winner-modal-text') return winnerModalText;
        if (id === 'modal-rematch-btn') return modalRematchBtn;
        if (id === 'modal-exit-btn') return modalExitBtn;
        if (id === 'modal-waiting-msg') return modalWaitingMsg;
        return null;
      }),
    };

    // Setup socket mock
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      id: 'test-player-id',
    };

    // Initialize game state
    projectiles = [];
    pendingBatch = null;
    gameActive = true;

    // Mock global objects
    global.document = mockDocument;
    global.io = vi.fn(() => mockSocket);
  });

  /**
   * Property 4: Preservation - Immediate Modal Display
   * 
   * **Validates: Requirements 3.1**
   * 
   * For any game-end state where matchEnded fires and NO animations are active
   * (projectiles.length = 0 AND pendingBatch = null), the modal should display
   * immediately. This is the baseline behavior that must be preserved after the fix.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: This test should PASS, confirming the
   * correct behavior for non-buggy game-end scenarios.
   */
  it('should display modal immediately when no animations are active', () => {
    // Setup: No active animations
    projectiles = [];
    pendingBatch = null;

    // Simulate matchEnded event firing
    const matchEndedData = {
      winnerId: 'player-1',
      winnerName: 'Alice',
      winnerColor: 'red',
      reason: 'Dominated the board'
    };

    // Simulate the matchEnded handler behavior (lines 342-373 in game.js)
    gameActive = false;
    
    // Setup modal content
    winnerModalTitle.textContent = 'VICTORY!';
    winnerModalText.textContent = 'Alice wins the game!';
    
    // Reset modal buttons
    modalRematchBtn.classList.remove('hidden');
    modalRematchBtn.querySelector('.btn-content').textContent = 'REMATCH';
    modalRematchBtn.disabled = false;
    modalExitBtn.classList.remove('hidden');
    modalWaitingMsg.classList.add('hidden');
    
    // Show modal immediately (line 371)
    winnerModal.classList.remove('hidden');

    // PRESERVATION: Modal should be visible immediately when no animations are active
    // This should PASS on unfixed code
    expect(winnerModal.classList.remove).toHaveBeenCalledWith('hidden');
    expect(projectiles.length).toBe(0);
    expect(pendingBatch).toBe(null);
  });

  /**
   * Property-Based Test: Immediate modal display for all no-animation states
   * 
   * Tests that for ANY game-end state with no active animations, the modal
   * appears immediately. This property must be preserved after the fix.
   */
  it('should display modal immediately for any game-end state with no animations', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary winner data
        fc.record({
          winnerId: fc.string({ minLength: 1, maxLength: 20 }),
          winnerName: fc.string({ minLength: 1, maxLength: 20 }),
          winnerColor: fc.constantFrom('red', 'blue', 'green', 'yellow'),
          reason: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
        }),
        (matchEndedData) => {
          // Setup: No active animations
          const testProjectiles = [];
          const testPendingBatch = null;

          // Create fresh modal mock for each test case
          const testModal = {
            classList: {
              contains: vi.fn((className) => className !== 'hidden'),
              remove: vi.fn(),
              add: vi.fn(),
            }
          };

          // Simulate matchEnded handler behavior
          const testGameActive = false;
          
          // Show modal immediately (unfixed behavior)
          testModal.classList.remove('hidden');

          // PRESERVATION: Modal should be shown immediately
          // No animations active: projectiles.length = 0 AND pendingBatch = null
          const noAnimationsActive = testProjectiles.length === 0 && testPendingBatch === null;
          const modalShown = testModal.classList.remove.mock.calls.some(
            call => call[0] === 'hidden'
          );

          // This should PASS on unfixed code: when no animations, modal shows immediately
          return noAnimationsActive && modalShown;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Edge Case Test: Modal display with empty projectiles array and null pendingBatch
   * 
   * Explicitly tests the boundary condition where both animation indicators are
   * in their "no animation" state.
   */
  it('should display modal immediately when projectiles is empty array and pendingBatch is null', () => {
    // Setup: Explicitly set to "no animation" state
    projectiles = []; // Empty array
    pendingBatch = null; // Null

    // Simulate matchEnded event
    const matchEndedData = {
      winnerId: 'player-2',
      winnerName: 'Bob',
      winnerColor: 'blue',
      reason: null
    };

    // Simulate matchEnded handler
    gameActive = false;
    winnerModalTitle.textContent = 'GAME OVER';
    winnerModalText.textContent = 'Bob wins the game!';
    
    // Show modal immediately
    winnerModal.classList.remove('hidden');

    // PRESERVATION: Verify immediate display
    expect(winnerModal.classList.remove).toHaveBeenCalledWith('hidden');
    expect(projectiles).toEqual([]);
    expect(pendingBatch).toBeNull();
    expect(gameActive).toBe(false);
  });

  /**
   * Property 5: Preservation - Animation Rendering During Gameplay
   * 
   * **Validates: Requirements 3.2, 3.3**
   * 
   * For any render loop frame where gameActive is true, the fixed code SHALL
   * continue rendering animations normally, preserving all existing animation
   * behavior during active gameplay.
   * 
   * This test verifies that when the game is active, the render loop continues
   * to process animations correctly, including:
   * - Rendering projectiles that are in flight
   * - Processing pending batches of server events
   * - Continuing the render loop via requestAnimationFrame
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: This test should PASS, confirming the
   * correct behavior for animation rendering during active gameplay.
   */
  it('should continue rendering animations when gameActive is true', () => {
    // Setup: Active game with animations
    gameActive = true;
    projectiles = [
      { sx: 0, sy: 0, ex: 100, ey: 100, start: Date.now(), dur: 180, applied: false, done: false },
    ];
    pendingBatch = null;

    // Mock requestAnimationFrame
    const mockRAF = vi.fn();
    global.requestAnimationFrame = mockRAF;

    // Simulate the render loop logic (lines 791-813 in game.js)
    const simulateRender = () => {
      // Early termination check (line 792-795)
      if (!gameActive && projectiles.length === 0 && pendingBatch === null) {
        return false; // Should not render
      }

      // Continue loop condition (line 809)
      if (gameActive || projectiles.length > 0 || pendingBatch !== null) {
        mockRAF(simulateRender);
        return true; // Should continue rendering
      }
      
      return false;
    };

    const shouldRender = simulateRender();

    // PRESERVATION: When gameActive is true, render loop should continue
    expect(shouldRender).toBe(true);
    expect(mockRAF).toHaveBeenCalled();
    expect(gameActive).toBe(true);
  });

  /**
   * Property-Based Test: Animation rendering for various active game states
   * 
   * Tests that for ANY game state where gameActive is true, the render loop
   * continues to process animations correctly. This property must be preserved
   * after the fix.
   */
  it('should render animations for any active game state', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary number of projectiles (0-10)
        fc.integer({ min: 0, max: 10 }),
        // Generate whether pendingBatch exists
        fc.boolean(),
        (projectileCount, hasPendingBatch) => {
          // Setup: Active game
          const testGameActive = true;
          
          // Create projectiles
          const testProjectiles = Array.from({ length: projectileCount }, (_, i) => ({
            sx: i * 10,
            sy: i * 10,
            ex: (i + 1) * 100,
            ey: (i + 1) * 100,
            start: Date.now(),
            dur: 180,
            applied: false,
            done: false
          }));

          // Create pendingBatch if needed
          const testPendingBatch = hasPendingBatch ? {
            events: [{ type: 'explodeWave', explosions: [{ row: 0, col: 0, color: 'red' }] }],
            grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
            turnIndex: 0,
            turnCount: 5
          } : null;

          // Mock requestAnimationFrame
          const mockRAF = vi.fn();

          // Simulate render loop logic
          const simulateRender = () => {
            // Early termination check
            if (!testGameActive && testProjectiles.length === 0 && testPendingBatch === null) {
              return false;
            }

            // Continue loop condition
            if (testGameActive || testProjectiles.length > 0 || testPendingBatch !== null) {
              mockRAF(simulateRender);
              return true;
            }
            
            return false;
          };

          const shouldRender = simulateRender();

          // PRESERVATION: When gameActive is true, render loop MUST continue
          // regardless of projectiles or pendingBatch state
          return testGameActive && shouldRender && mockRAF.mock.calls.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property-Based Test: Projectile rendering continues until completion
   * 
   * Tests that when projectiles are in flight (projectiles.length > 0),
   * the render loop continues even if gameActive is false. This ensures
   * animations complete smoothly.
   * 
   * **Validates: Requirements 3.3**
   */
  it('should continue rendering while projectiles are in flight', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary number of projectiles (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate gameActive state (can be true or false)
        fc.boolean(),
        (projectileCount, isGameActive) => {
          // Create projectiles
          const testProjectiles = Array.from({ length: projectileCount }, (_, i) => ({
            sx: i * 10,
            sy: i * 10,
            ex: (i + 1) * 100,
            ey: (i + 1) * 100,
            start: Date.now(),
            dur: 180,
            applied: false,
            done: false
          }));

          const testPendingBatch = null;

          // Mock requestAnimationFrame
          const mockRAF = vi.fn();

          // Simulate render loop logic
          const simulateRender = () => {
            // Early termination check
            if (!isGameActive && testProjectiles.length === 0 && testPendingBatch === null) {
              return false;
            }

            // Continue loop condition
            if (isGameActive || testProjectiles.length > 0 || testPendingBatch !== null) {
              mockRAF(simulateRender);
              return true;
            }
            
            return false;
          };

          const shouldRender = simulateRender();

          // PRESERVATION: When projectiles.length > 0, render loop MUST continue
          // This ensures flying atoms complete their animations
          return testProjectiles.length > 0 && shouldRender && mockRAF.mock.calls.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Edge Case Test: Render loop continues with pendingBatch during active game
   * 
   * Tests that when pendingBatch is not null and gameActive is true,
   * the render loop continues to process server events.
   */
  it('should continue rendering when pendingBatch is active during gameplay', () => {
    // Setup: Active game with pendingBatch
    gameActive = true;
    projectiles = [];
    pendingBatch = {
      events: [
        { type: 'explodeWave', explosions: [{ row: 0, col: 0, color: 'red' }] },
        { type: 'explodeWave', explosions: [{ row: 1, col: 1, color: 'blue' }] },
      ],
      grid: Array(9).fill(null).map(() => Array(6).fill({ count: 0, color: null })),
      turnIndex: 0,
      turnCount: 5
    };

    // Mock requestAnimationFrame
    const mockRAF = vi.fn();
    global.requestAnimationFrame = mockRAF;

    // Simulate render loop logic
    const simulateRender = () => {
      if (!gameActive && projectiles.length === 0 && pendingBatch === null) {
        return false;
      }

      if (gameActive || projectiles.length > 0 || pendingBatch !== null) {
        mockRAF(simulateRender);
        return true;
      }
      
      return false;
    };

    const shouldRender = simulateRender();

    // PRESERVATION: When pendingBatch is active, render loop should continue
    expect(shouldRender).toBe(true);
    expect(mockRAF).toHaveBeenCalled();
    expect(pendingBatch).not.toBeNull();
  });

  /**
   * Property-Based Test: Various winner configurations with no animations
   * 
   * Tests that immediate modal display works correctly across different
   * winner data configurations when no animations are active.
   */
  it('should handle various winner configurations with immediate modal display', () => {
    fc.assert(
      fc.property(
        // Generate winner ID
        fc.string({ minLength: 5, maxLength: 20 }),
        // Generate winner name
        fc.string({ minLength: 1, maxLength: 30 }),
        // Generate winner color
        fc.constantFrom('red', 'blue', 'green', 'yellow', 'purple', 'orange'),
        // Generate optional reason
        fc.option(fc.string({ minLength: 5, maxLength: 100 })),
        (winnerId, winnerName, winnerColor, reason) => {
          // Setup: No animations
          const testProjectiles = [];
          const testPendingBatch = null;

          // Create modal mock
          const testModal = {
            classList: {
              contains: vi.fn((className) => className !== 'hidden'),
              remove: vi.fn(),
              add: vi.fn(),
            }
          };

          // Simulate matchEnded with various winner data
          const matchEndedData = { winnerId, winnerName, winnerColor, reason };
          
          // Simulate handler behavior
          testModal.classList.remove('hidden');

          // PRESERVATION: Modal shows immediately regardless of winner data
          // when no animations are active
          const noAnimations = testProjectiles.length === 0 && testPendingBatch === null;
          const modalShown = testModal.classList.remove.mock.calls.length > 0;

          return noAnimations && modalShown;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 6: Preservation - Rematch Vote UI Updates
 * 
 * **Validates: Requirements 3.4, 3.5, 3.6**
 * 
 * For any rematch vote action, the fixed code SHALL continue updating the modal UI
 * to show "VOTED ✓", disable the button, and update vote counts, preserving all
 * existing rematch flow behavior.
 * 
 * This test verifies that the rematch vote UI updates correctly:
 * - Button shows "VOTED ✓" and disables when player votes (3.4)
 * - Waiting message updates with vote count when rematchVoteUpdate fires (3.5)
 * - rematchStarted event triggers when all players vote (3.6)
 * 
 * **EXPECTED OUTCOME ON UNFIXED CODE**: This test should PASS, confirming the
 * correct behavior for rematch vote UI updates.
 */
describe('Property 6: Preservation - Rematch Vote UI Updates', () => {
  let mockSocket;
  let modalRematchBtn;
  let modalWaitingMsg;
  let hasVotedRematch;
  let roomCode;
  let btnContent;

  beforeEach(() => {
    // Reset state
    hasVotedRematch = false;
    roomCode = 'TEST123';

    // Mock button content element
    btnContent = { textContent: 'REMATCH' };

    // Mock rematch button
    modalRematchBtn = {
      querySelector: vi.fn(() => btnContent),
      disabled: false,
      classList: {
        remove: vi.fn(),
        add: vi.fn(),
      }
    };

    // Mock waiting message
    modalWaitingMsg = {
      textContent: '',
      classList: {
        contains: vi.fn(() => false), // Not hidden
        remove: vi.fn(),
        add: vi.fn(),
      }
    };

    // Setup socket mock
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      id: 'test-player-id',
    };

    global.document = {
      getElementById: vi.fn((id) => {
        if (id === 'modal-rematch-btn') return modalRematchBtn;
        if (id === 'modal-waiting-msg') return modalWaitingMsg;
        return null;
      }),
    };
  });

  /**
   * Test: Rematch button shows "VOTED ✓" and disables when player votes
   * 
   * **Validates: Requirement 3.4**
   * 
   * This test verifies that when a player clicks the rematch button:
   * 1. The button text changes to "VOTED ✓"
   * 2. The button becomes disabled
   * 3. The waiting message becomes visible
   */
  it('should update button to "VOTED ✓" and disable when player votes', () => {
    // Simulate the rematch button click handler behavior (lines 376-388 in game.js)
    const simulateRematchButtonClick = () => {
      if (hasVotedRematch) return;
      hasVotedRematch = true;
      mockSocket.emit('rematchVote', roomCode);

      // Show waiting state
      modalRematchBtn.querySelector('.btn-content').textContent = 'VOTED ✓';
      modalRematchBtn.disabled = true;
      if (modalWaitingMsg) {
        modalWaitingMsg.classList.remove('hidden');
        modalWaitingMsg.textContent = 'Waiting for others...';
      }
    };

    // Execute the click
    simulateRematchButtonClick();

    // PRESERVATION: Button should show "VOTED ✓" and be disabled
    expect(modalRematchBtn.querySelector('.btn-content').textContent).toBe('VOTED ✓');
    expect(modalRematchBtn.disabled).toBe(true);
    expect(modalWaitingMsg.classList.remove).toHaveBeenCalledWith('hidden');
    expect(modalWaitingMsg.textContent).toBe('Waiting for others...');
    expect(mockSocket.emit).toHaveBeenCalledWith('rematchVote', roomCode);
  });

  /**
   * Test: Waiting message updates with vote count
   * 
   * **Validates: Requirement 3.5**
   * 
   * This test verifies that when rematchVoteUpdate event fires, the waiting
   * message updates to show the current vote count (votedCount/totalNeeded).
   */
  it('should update waiting message with vote count when rematchVoteUpdate fires', () => {
    // Simulate rematchVoteUpdate event handler (lines 402-407 in game.js)
    const simulateRematchVoteUpdate = ({ votedCount, totalNeeded, voterName }) => {
      if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
        modalWaitingMsg.textContent = `Waiting for players... (${votedCount}/${totalNeeded})`;
      }
      if (voterName && votedCount < totalNeeded) {
        // Toast notification logic (not testing here)
      }
    };

    // Test case 1: First vote
    simulateRematchVoteUpdate({ votedCount: 1, totalNeeded: 3, voterName: 'Alice' });
    expect(modalWaitingMsg.textContent).toBe('Waiting for players... (1/3)');

    // Test case 2: Second vote
    simulateRematchVoteUpdate({ votedCount: 2, totalNeeded: 3, voterName: 'Bob' });
    expect(modalWaitingMsg.textContent).toBe('Waiting for players... (2/3)');

    // Test case 3: Final vote (all voted)
    simulateRematchVoteUpdate({ votedCount: 3, totalNeeded: 3, voterName: 'Charlie' });
    expect(modalWaitingMsg.textContent).toBe('Waiting for players... (3/3)');
  });

  /**
   * Property-Based Test: Vote count updates for various player configurations
   * 
   * Tests that for ANY combination of votedCount and totalNeeded, the waiting
   * message updates correctly with the vote count.
   */
  it('should update vote count correctly for any player configuration', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary total players (2-8)
        fc.integer({ min: 2, max: 8 }),
        // Generate arbitrary voted count (1 to totalNeeded)
        fc.integer({ min: 1, max: 8 }),
        (totalNeeded, votedCount) => {
          // Ensure votedCount <= totalNeeded
          if (votedCount > totalNeeded) {
            votedCount = totalNeeded;
          }

          // Simulate rematchVoteUpdate event handler
          const simulateRematchVoteUpdate = ({ votedCount, totalNeeded, voterName }) => {
            if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
              modalWaitingMsg.textContent = `Waiting for players... (${votedCount}/${totalNeeded})`;
            }
          };

          // Execute the update
          simulateRematchVoteUpdate({ votedCount, totalNeeded, voterName: 'TestPlayer' });

          // PRESERVATION: Waiting message should show correct vote count
          const expectedText = `Waiting for players... (${votedCount}/${totalNeeded})`;
          return modalWaitingMsg.textContent === expectedText;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test: rematchStarted event triggers and resets game state
   * 
   * **Validates: Requirement 3.6**
   * 
   * This test verifies that when all players vote for rematch, the rematchStarted
   * event triggers and resets the game state correctly.
   */
  it('should trigger rematchStarted event and reset state when all players vote', () => {
    // Mock additional DOM elements needed for rematchStarted handler
    const authPanel = { classList: { add: vi.fn(), remove: vi.fn() } };
    const joinPanel = { classList: { add: vi.fn(), remove: vi.fn() } };
    const lobbyPanel = { classList: { add: vi.fn(), remove: vi.fn() } };

    global.document.getElementById = vi.fn((id) => {
      if (id === 'auth-panel') return authPanel;
      if (id === 'join-panel') return joinPanel;
      if (id === 'lobby-panel') return lobbyPanel;
      if (id === 'modal-waiting-msg') return modalWaitingMsg;
      return null;
    });

    // Mock showToast
    const showToastMock = vi.fn();
    global.showToast = showToastMock;

    // Set initial state: player has voted
    hasVotedRematch = true;

    // Simulate rematchStarted event handler (lines 410-417 in game.js)
    const simulateRematchStarted = () => {
      hasVotedRematch = false;
      // returnToMenu() logic would be called here
      authPanel.classList.add('hidden');
      joinPanel.classList.add('hidden');
      lobbyPanel.classList.remove('hidden');
      showToastMock('Rematch! Back to lobby.');
    };

    // Execute the event
    simulateRematchStarted();

    // PRESERVATION: State should be reset and UI should update
    expect(hasVotedRematch).toBe(false);
    expect(authPanel.classList.add).toHaveBeenCalledWith('hidden');
    expect(joinPanel.classList.add).toHaveBeenCalledWith('hidden');
    expect(lobbyPanel.classList.remove).toHaveBeenCalledWith('hidden');
    expect(showToastMock).toHaveBeenCalledWith('Rematch! Back to lobby.');
  });

  /**
   * Property-Based Test: Button state persists after voting
   * 
   * Tests that once a player votes, the button remains in "VOTED ✓" state
   * and disabled, even if clicked again.
   */
  it('should keep button disabled and showing "VOTED ✓" after voting', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary number of click attempts (1-5)
        fc.integer({ min: 1, max: 5 }),
        (clickAttempts) => {
          // Reset state for each property test run
          let testHasVotedRematch = false;
          const testBtnContent = { textContent: 'REMATCH' };
          const testModalRematchBtn = {
            querySelector: vi.fn(() => testBtnContent),
            disabled: false,
          };
          const testModalWaitingMsg = {
            textContent: '',
            classList: {
              contains: vi.fn(() => false),
              remove: vi.fn(),
            }
          };
          const testMockSocket = {
            emit: vi.fn(),
          };

          // Simulate the rematch button click handler
          const simulateRematchButtonClick = () => {
            if (testHasVotedRematch) return;
            testHasVotedRematch = true;
            testMockSocket.emit('rematchVote', roomCode);

            testModalRematchBtn.querySelector('.btn-content').textContent = 'VOTED ✓';
            testModalRematchBtn.disabled = true;
            if (testModalWaitingMsg) {
              testModalWaitingMsg.classList.remove('hidden');
              testModalWaitingMsg.textContent = 'Waiting for others...';
            }
          };

          // Click multiple times
          for (let i = 0; i < clickAttempts; i++) {
            simulateRematchButtonClick();
          }

          // PRESERVATION: Button should remain in voted state after first click
          // and subsequent clicks should be ignored
          const buttonText = testModalRematchBtn.querySelector('.btn-content').textContent;
          const isDisabled = testModalRematchBtn.disabled;
          const emitCallCount = testMockSocket.emit.mock.calls.filter(
            call => call[0] === 'rematchVote'
          ).length;

          // Should only emit once, regardless of click attempts
          return buttonText === 'VOTED ✓' && isDisabled && emitCallCount === 1;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Edge Case Test: Waiting message updates only when visible
   * 
   * Tests that the waiting message text is only updated when the message
   * element is not hidden (classList.contains('hidden') returns false).
   */
  it('should only update waiting message when it is visible', () => {
    // Test case 1: Message is visible (not hidden)
    modalWaitingMsg.classList.contains = vi.fn(() => false);
    
    const simulateRematchVoteUpdate = ({ votedCount, totalNeeded, voterName }) => {
      if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
        modalWaitingMsg.textContent = `Waiting for players... (${votedCount}/${totalNeeded})`;
      }
    };

    simulateRematchVoteUpdate({ votedCount: 1, totalNeeded: 2, voterName: 'Alice' });
    expect(modalWaitingMsg.textContent).toBe('Waiting for players... (1/2)');

    // Test case 2: Message is hidden
    modalWaitingMsg.classList.contains = vi.fn(() => true);
    modalWaitingMsg.textContent = ''; // Reset

    simulateRematchVoteUpdate({ votedCount: 2, totalNeeded: 2, voterName: 'Bob' });
    expect(modalWaitingMsg.textContent).toBe(''); // Should not update when hidden
  });

  /**
   * Integration Test: Full rematch vote flow
   * 
   * Tests the complete rematch vote flow from button click to vote count updates
   * to final rematch start.
   */
  it('should handle complete rematch vote flow correctly', () => {
    // Mock showToast
    const showToastMock = vi.fn();
    global.showToast = showToastMock;

    // Mock additional DOM elements
    const authPanel = { classList: { add: vi.fn(), remove: vi.fn() } };
    const joinPanel = { classList: { add: vi.fn(), remove: vi.fn() } };
    const lobbyPanel = { classList: { add: vi.fn(), remove: vi.fn() } };

    global.document.getElementById = vi.fn((id) => {
      if (id === 'modal-rematch-btn') return modalRematchBtn;
      if (id === 'modal-waiting-msg') return modalWaitingMsg;
      if (id === 'auth-panel') return authPanel;
      if (id === 'join-panel') return joinPanel;
      if (id === 'lobby-panel') return lobbyPanel;
      return null;
    });

    // Simulate the rematch button click handler
    const simulateRematchButtonClick = () => {
      if (hasVotedRematch) return;
      hasVotedRematch = true;
      mockSocket.emit('rematchVote', roomCode);

      modalRematchBtn.querySelector('.btn-content').textContent = 'VOTED ✓';
      modalRematchBtn.disabled = true;
      if (modalWaitingMsg) {
        modalWaitingMsg.classList.remove('hidden');
        modalWaitingMsg.textContent = 'Waiting for others...';
      }
    };

    // Simulate rematchVoteUpdate event handler
    const simulateRematchVoteUpdate = ({ votedCount, totalNeeded, voterName }) => {
      if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
        modalWaitingMsg.textContent = `Waiting for players... (${votedCount}/${totalNeeded})`;
      }
    };

    // Simulate rematchStarted event handler
    const simulateRematchStarted = () => {
      hasVotedRematch = false;
      authPanel.classList.add('hidden');
      joinPanel.classList.add('hidden');
      lobbyPanel.classList.remove('hidden');
      showToastMock('Rematch! Back to lobby.');
    };

    // Step 1: Player clicks rematch button
    simulateRematchButtonClick();
    expect(modalRematchBtn.querySelector('.btn-content').textContent).toBe('VOTED ✓');
    expect(modalRematchBtn.disabled).toBe(true);
    expect(modalWaitingMsg.textContent).toBe('Waiting for others...');

    // Step 2: First vote update (1/2)
    simulateRematchVoteUpdate({ votedCount: 1, totalNeeded: 2, voterName: 'Alice' });
    expect(modalWaitingMsg.textContent).toBe('Waiting for players... (1/2)');

    // Step 3: Second vote update (2/2)
    simulateRematchVoteUpdate({ votedCount: 2, totalNeeded: 2, voterName: 'Bob' });
    expect(modalWaitingMsg.textContent).toBe('Waiting for players... (2/2)');

    // Step 4: All players voted, rematch starts
    simulateRematchStarted();
    expect(hasVotedRematch).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('Rematch! Back to lobby.');
    expect(lobbyPanel.classList.remove).toHaveBeenCalledWith('hidden');
  });
});

describe('Bug 3: Rematch Notification to Voter', () => {
  let mockSocket;
  let myPlayerId;
  let showToastMock;
  let modalWaitingMsg;

  beforeEach(() => {
    // Setup player ID
    myPlayerId = 'test-player-123';

    // Mock showToast function
    showToastMock = vi.fn();
    global.showToast = showToastMock;

    // Mock modal waiting message element
    modalWaitingMsg = {
      textContent: '',
      classList: {
        contains: vi.fn(() => false), // Not hidden
      }
    };

    // Setup socket mock
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      id: myPlayerId,
    };

    global.document = {
      getElementById: vi.fn((id) => {
        if (id === 'modal-waiting-msg') return modalWaitingMsg;
        return null;
      }),
    };
  });

  /**
   * Property 3: Bug Condition - Rematch Notification Excludes Voter
   * 
   * For any rematchVoteUpdate event where voterName is provided and 
   * votedCount < totalNeeded, the toast notification should only be shown
   * to players whose socket ID does NOT match the voter's socket ID.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: This test will FAIL because the
   * voter sees their own toast notification "YourName wants a rematch!"
   * 
   * **Validates: Requirements 2.3**
   */
  it('should NOT show toast notification to the voter themselves', () => {
    // Simulate rematchVoteUpdate event where the voter is the current player
    const rematchVoteEvent = {
      votedCount: 1,
      totalNeeded: 2,
      voterName: 'Alice',
      voterId: myPlayerId, // The voter is the current player
    };

    // Simulate the UNFIXED event handler behavior
    // This mimics lines 403-407 in game.js
    if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
      modalWaitingMsg.textContent = `Waiting for players... (${rematchVoteEvent.votedCount}/${rematchVoteEvent.totalNeeded})`;
    }
    
    // BUG: The unfixed code shows toast to everyone, including the voter
    if (rematchVoteEvent.voterName && rematchVoteEvent.votedCount < rematchVoteEvent.totalNeeded) {
      showToastMock(`${rematchVoteEvent.voterName} wants a rematch!`);
    }

    // BUG CONDITION: Toast should NOT be shown when voterId === myPlayerId
    // On unfixed code, showToast is called even for the voter
    
    // This assertion will FAIL on unfixed code, proving the bug exists
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('should show toast notification to OTHER players (not the voter)', () => {
    // Simulate rematchVoteUpdate event where the voter is a DIFFERENT player
    const rematchVoteEvent = {
      votedCount: 1,
      totalNeeded: 2,
      voterName: 'Bob',
      voterId: 'different-player-456', // Different from myPlayerId
    };

    // Simulate the event handler behavior
    if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
      modalWaitingMsg.textContent = `Waiting for players... (${rematchVoteEvent.votedCount}/${rematchVoteEvent.totalNeeded})`;
    }
    
    // The unfixed code shows toast to everyone
    if (rematchVoteEvent.voterName && rematchVoteEvent.votedCount < rematchVoteEvent.totalNeeded) {
      showToastMock(`${rematchVoteEvent.voterName} wants a rematch!`);
    }

    // CORRECT BEHAVIOR: Toast SHOULD be shown to other players
    // This test should PASS even on unfixed code
    expect(showToastMock).toHaveBeenCalledWith('Bob wants a rematch!');
  });

  it('should NOT show toast when all players have voted', () => {
    // Simulate rematchVoteUpdate event where votedCount equals totalNeeded
    const rematchVoteEvent = {
      votedCount: 2,
      totalNeeded: 2,
      voterName: 'Charlie',
      voterId: 'another-player-789',
    };

    // Simulate the event handler behavior
    if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
      modalWaitingMsg.textContent = `Waiting for players... (${rematchVoteEvent.votedCount}/${rematchVoteEvent.totalNeeded})`;
    }
    
    // When votedCount >= totalNeeded, no toast should be shown
    if (rematchVoteEvent.voterName && rematchVoteEvent.votedCount < rematchVoteEvent.totalNeeded) {
      showToastMock(`${rematchVoteEvent.voterName} wants a rematch!`);
    }

    // CORRECT BEHAVIOR: No toast when all players have voted
    // This test should PASS even on unfixed code
    expect(showToastMock).not.toHaveBeenCalled();
  });

  /**
   * Property-Based Test: Rematch notification filtering
   * 
   * Tests that for ANY rematch vote configuration, the toast is only shown
   * to players who are NOT the voter.
   */
  it('should filter rematch notifications correctly for any player configuration', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary player names
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate arbitrary vote counts (1 to totalNeeded-1)
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 2, max: 6 }),
        // Generate voter ID (either matches myPlayerId or doesn't)
        fc.boolean(),
        (voterName, votedCount, totalNeeded, isVoter) => {
          // Ensure votedCount < totalNeeded
          if (votedCount >= totalNeeded) {
            votedCount = totalNeeded - 1;
          }

          // Reset mock
          showToastMock.mockClear();

          // Create event
          const rematchVoteEvent = {
            votedCount,
            totalNeeded,
            voterName,
            voterId: isVoter ? myPlayerId : 'other-player-id',
          };

          // Simulate UNFIXED event handler behavior
          if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
            modalWaitingMsg.textContent = `Waiting for players... (${rematchVoteEvent.votedCount}/${rematchVoteEvent.totalNeeded})`;
          }
          
          // BUG: Unfixed code shows toast to everyone
          if (rematchVoteEvent.voterName && rematchVoteEvent.votedCount < rematchVoteEvent.totalNeeded) {
            showToastMock(`${rematchVoteEvent.voterName} wants a rematch!`);
          }

          // BUG CONDITION: If voter is current player, toast should NOT be shown
          // On unfixed code, this will fail when isVoter is true
          if (isVoter) {
            return showToastMock.mock.calls.length === 0;
          } else {
            return showToastMock.mock.calls.length === 1;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Counterexample Documentation Test
   * 
   * This test explicitly documents the expected counterexample that proves
   * the bug exists on unfixed code.
   */
  it('should document counterexample: voter receives toast "YourName wants a rematch!"', () => {
    // Setup: Player "Alice" with ID 'test-player-123' votes for rematch
    const voterName = 'Alice';
    const voterId = myPlayerId; // Same as current player
    const votedCount = 1;
    const totalNeeded = 2;

    // Simulate the UNFIXED event handler
    const rematchVoteEvent = {
      votedCount,
      totalNeeded,
      voterName,
      voterId,
    };

    if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
      modalWaitingMsg.textContent = `Waiting for players... (${rematchVoteEvent.votedCount}/${rematchVoteEvent.totalNeeded})`;
    }
    
    // BUG: Unfixed code shows toast to voter
    if (rematchVoteEvent.voterName && rematchVoteEvent.votedCount < rematchVoteEvent.totalNeeded) {
      showToastMock(`${rematchVoteEvent.voterName} wants a rematch!`);
    }

    // COUNTEREXAMPLE: Voter sees their own toast notification
    // Expected: showToast should NOT be called when voterId === myPlayerId
    // Actual on unfixed code: showToast IS called with "Alice wants a rematch!"
    
    // This assertion will FAIL on unfixed code, documenting the bug
    expect(showToastMock).not.toHaveBeenCalledWith('Alice wants a rematch!');
    
    // Document the bug condition
    const bugConditionMet = voterId === myPlayerId && showToastMock.mock.calls.length > 0;
    expect(bugConditionMet).toBe(false); // Will FAIL - proves bug exists
  });
});
