# Implementation Plan: Solo Player Mode

## Overview

This implementation plan converts the solo player mode design into actionable coding tasks. The feature adds single-player practice functionality where players compete against AI opponents with three difficulty levels (Easy, Medium, Hard). Implementation follows a logical sequence: UI components → Server infrastructure → AI algorithms → Integration → Testing.

The implementation uses JavaScript for both client and server code, maintaining consistency with the existing multiplayer codebase.

## Tasks

- [x] 1. Create solo mode UI components
  - Add "SOLO MODE" button to main menu in index.html
  - Create solo lobby panel with player display, difficulty selector, and action buttons
  - Add CSS styling for solo lobby components (difficulty buttons, player display)
  - Implement difficulty button active state styling with border and glow effects
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Implement client-side solo mode navigation
  - [x] 2.1 Add solo mode button click handler in game.js
    - Validate player name before showing solo lobby
    - Display solo lobby panel with player name and color
    - Hide auth panel when entering solo lobby
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 2.2 Implement difficulty selection logic
    - Add click handlers for difficulty buttons
    - Update UI to highlight selected difficulty
    - Store selected difficulty in client state variable
    - Set "Easy" as default difficulty
    - _Requirements: 2.2, 2.3_
  
  - [x] 2.3 Implement solo game start handler
    - Validate player name and difficulty selection
    - Emit createSoloMatch event to server with name, color, and difficulty
    - Handle back button to return to main menu
    - _Requirements: 2.4, 2.5_

- [x] 3. Implement server-side solo room management
  - [x] 3.1 Create createSoloMatch socket event handler in server.js
    - Validate player name (1-12 characters, non-empty)
    - Validate color selection from VALID_COLORS array
    - Validate difficulty (easy/medium/hard)
    - Generate unique room code with "SOLO-" prefix
    - _Requirements: 2.6, 8.1, 8.2_
  
  - [x] 3.2 Create solo room with AI opponent
    - Assign AI color (prefer blue, fallback to red if player chose blue)
    - Create room object with solo: true flag and difficulty property
    - Add human player and AI player to room.players array
    - Set AI player with isAI: true flag and name "AI (Easy/Medium/Hard)"
    - Set room state to 'playing' (skip lobby wait)
    - _Requirements: 2.6, 7.3, 8.3, 12.1, 12.2, 12.3, 12.4_
  
  - [x] 3.3 Emit matchStarted event and trigger AI if needed
    - Emit matchStarted event with players and turnIndex
    - If AI goes first (players[0].isAI), call scheduleAIMove
    - _Requirements: 6.1_

- [x] 4. Implement AI move scheduling and execution infrastructure
  - [x] 4.1 Create scheduleAIMove function
    - Validate room exists and state is 'playing'
    - Validate current player is AI (isAI flag)
    - Calculate delay based on difficulty (Easy: 800-1200ms, Medium: 600-1000ms, Hard: 400-800ms)
    - Use setTimeout to schedule executeAIMove call
    - Store timeout ID in room.aiTimeouts array for cleanup
    - _Requirements: 3.4, 4.7, 5.9, 6.2_
  
  - [x] 4.2 Create executeAIMove function
    - Validate room exists and state is 'playing'
    - Validate current player is AI
    - Call calculateAIMove to get move coordinates
    - Handle case where no valid moves exist (end game, human wins)
    - Call processTurn with AI move coordinates
    - Emit gameStateUpdate event with events, grid, turnIndex, turnCount
    - If game finished, emit matchEnded event
    - If next turn is also AI, call scheduleAIMove recursively
    - _Requirements: 6.1, 6.3, 6.5, 9.4_
  
  - [x] 4.3 Create getValidMoves helper function
    - Iterate through all grid cells (9 rows × 6 cols)
    - Return array of {row, col} for cells that are empty or owned by specified color
    - _Requirements: 3.2, 9.2, 9.3_

- [x] 5. Implement Easy AI algorithm
  - [x] 5.1 Create calculateEasyMove function
    - Accept validMoves array as parameter
    - Select random index from validMoves array
    - Return move at random index
    - _Requirements: 3.1, 3.2, 3.5_
  
  - [ ]* 5.2 Write property test for Easy AI move validity
    - **Property 4: Easy AI selects only valid moves**
    - **Validates: Requirements 3.1, 3.2, 9.2, 9.3**
    - Generate random game grids with fast-check
    - Verify Easy AI only selects from valid moves (empty or AI-owned cells)
    - Run 100 iterations
  
  - [ ]* 5.3 Write property test for Easy AI randomness
    - **Property 5: Easy AI ignores strategic factors**
    - **Validates: Requirements 3.5**
    - Generate game states with obvious strategic moves (critical cells)
    - Verify Easy AI selection distribution is uniform (no strategic bias)
    - Use chi-square test for uniform distribution
    - Run 100 iterations

- [x] 6. Implement Medium AI algorithm
  - [x] 6.1 Create calculateMediumMove function
    - Accept room, validMoves, and aiColor as parameters
    - Score each move using tactical evaluation
    - Find maximum score among all moves
    - Randomly select from moves with maximum score
    - Return selected move
    - _Requirements: 4.1, 4.5, 4.6_
  
  - [x] 6.2 Implement Medium AI scoring logic
    - Score +100 for critical cells owned by AI (count + 1 >= criticalMass)
    - Score +30 per adjacent opponent cell
    - Score +20 for building up existing AI cells
    - Score +10 minus center distance for board position
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ]* 6.3 Write property test for Medium AI critical cell prioritization
    - **Property 6: Medium AI scoring prioritizes critical cells**
    - **Validates: Requirements 4.1, 4.2**
    - Generate game states with AI-owned cells at critical mass - 1
    - Verify Medium AI assigns higher scores to critical cells than empty cells
    - Run 100 iterations
  
  - [ ]* 6.4 Write property test for Medium AI adjacency scoring
    - **Property 7: Medium AI scoring rewards adjacency to opponents**
    - **Validates: Requirements 4.3, 4.4**
    - Generate game states with opponent cells
    - Verify Medium AI assigns higher scores to moves adjacent to opponents
    - Run 100 iterations
  
  - [ ]* 6.5 Write property test for Medium AI maximum score selection
    - **Property 8: Medium AI selects maximum score**
    - **Validates: Requirements 4.5, 4.6**
    - Generate random game states
    - Calculate scores manually for all moves
    - Verify Medium AI selects move with maximum score
    - Run 100 iterations

- [x] 7. Implement Hard AI algorithm
  - [x] 7.1 Create helper functions for Hard AI
    - Implement deepCloneGrid function for grid simulation
    - Implement criticalMass helper (reuse from existing code if available)
    - Implement inBounds helper (reuse from existing code if available)
    - _Requirements: 5.1, 5.2_
  
  - [x] 7.2 Create simulateMove function
    - Accept grid, row, col, and color as parameters
    - Clone grid for simulation
    - Place initial atom at specified position
    - Simulate explosion chain with safety counter (max 100 iterations)
    - Track number of captured opponent cells
    - Return {capturedCells, finalGrid}
    - _Requirements: 5.1, 5.2_
  
  - [x] 7.3 Create findOpponentThreats function
    - Iterate through grid to find opponent cells at critical mass - 1
    - Return array of {row, col} threat positions
    - _Requirements: 5.4_
  
  - [x] 7.4 Create calculateVulnerability function
    - Iterate through AI-owned cells
    - Check if adjacent to opponent critical cells
    - Return vulnerability score (count of at-risk cells)
    - _Requirements: 5.6_
  
  - [x] 7.5 Create calculateHardMove function
    - Accept room, validMoves, and aiColor as parameters
    - For each move, simulate chain reaction using simulateMove
    - Score +200 for moves capturing 3+ opponent cells
    - Score +50 per captured cell for moves capturing 1-2 cells
    - Score +80 for defensive moves adjacent to opponent threats
    - Score +60 for building up AI critical cells
    - Score +15 for corners, +10 for edges, +5 for center
    - Subtract vulnerability penalty (10 × vulnerability score)
    - Find maximum combined score
    - Randomly select from moves with maximum score
    - Return selected move
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  
  - [ ]* 7.6 Write property test for Hard AI chain reaction simulation
    - **Property 9: Hard AI simulates chain reactions**
    - **Validates: Requirements 5.1, 5.2**
    - Generate game states with chain reaction setups
    - Verify simulateMove calculates captured cells correctly
    - Run 100 iterations
  
  - [ ]* 7.7 Write property test for Hard AI offensive prioritization
    - **Property 10: Hard AI prioritizes offensive moves**
    - **Validates: Requirements 5.3**
    - Generate game states where moves capture 3+ opponent cells
    - Verify Hard AI assigns higher scores to high-capture moves
    - Run 100 iterations
  
  - [ ]* 7.8 Write property test for Hard AI defensive threat identification
    - **Property 11: Hard AI identifies defensive threats**
    - **Validates: Requirements 5.4**
    - Generate game states with opponent cells at critical mass - 1
    - Verify Hard AI assigns high scores to blocking moves
    - Run 100 iterations
  
  - [ ]* 7.9 Write property test for Hard AI maximum score selection
    - **Property 12: Hard AI selects maximum combined score**
    - **Validates: Requirements 5.7, 5.8**
    - Generate random game states
    - Calculate combined scores manually for all moves
    - Verify Hard AI selects move with maximum combined score
    - Run 100 iterations

- [x] 8. Create main AI decision router
  - [x] 8.1 Create calculateAIMove function
    - Accept room as parameter
    - Find AI player from room.players
    - Get valid moves using getValidMoves
    - Return null if no valid moves exist
    - Switch on room.difficulty to call appropriate algorithm
    - Call calculateEasyMove for 'easy'
    - Call calculateMediumMove for 'medium'
    - Call calculateHardMove for 'hard'
    - Default to calculateEasyMove for unknown difficulty
    - _Requirements: 3.1, 4.1, 5.1, 9.1_
  
  - [ ]* 8.2 Write property test for AI move validity across all difficulties
    - **Property 4: Easy AI selects only valid moves** (covers all difficulties)
    - **Validates: Requirements 9.2, 9.3**
    - Generate random game states for each difficulty
    - Verify calculateAIMove only returns valid moves
    - Run 100 iterations per difficulty

- [x] 9. Integrate AI moves with game flow
  - [x] 9.1 Modify placeAtom handler to trigger AI moves
    - After human move completes and gameStateUpdate is emitted
    - Check if room.solo is true and next player is AI
    - Call scheduleAIMove if conditions met
    - _Requirements: 6.1, 6.5_
  
  - [x] 9.2 Modify disconnect handler for solo room cleanup
    - Check if disconnecting player is in a solo room (room.solo === true)
    - Clear all AI timeouts from room.aiTimeouts array
    - Delete solo room immediately (don't mark offline)
    - _Requirements: 8.4_
  
  - [x] 9.3 Modify joinMatch handler to reject solo room joins
    - Check if room.solo is true
    - Emit errorMsg "Cannot join solo practice games."
    - Return early without adding player
    - _Requirements: 8.5_

- [x] 10. Checkpoint - Ensure server-side AI logic works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement client-side solo mode detection and UI updates
  - [x] 11.1 Add solo mode state tracking in game.js
    - Add isSoloMode boolean variable (default false)
    - Set isSoloMode = true when matchStarted event received with room.solo flag
    - Reset isSoloMode = false when returning to menu
    - _Requirements: 7.1, 7.2_
  
  - [x] 11.2 Update winner modal for solo mode
    - Check if isSoloMode is true when showing winner modal
    - Change "REMATCH" button text to "PLAY AGAIN"
    - Modify rematch button click handler to call returnToSoloLobby for solo mode
    - Keep existing rematch logic for multiplayer mode
    - _Requirements: 7.5, 7.6_
  
  - [x] 11.3 Create returnToSoloLobby function
    - Hide winner modal and game screen
    - Show main menu and solo lobby panel
    - Restore selectedDifficulty to previous value
    - Display player name and color in solo lobby
    - Focus start game button for accessibility
    - _Requirements: 7.6_

- [x] 12. Implement AI turn UI feedback
  - [x] 12.1 Update canvas click handler for AI turn blocking
    - Check if current player is AI before processing click
    - Show toast "It's AI's turn" if player clicks during AI turn
    - Return early without emitting placeAtom
    - _Requirements: 10.2, 10.5_
  
  - [x] 12.2 Verify turn indicator displays AI name correctly
    - Ensure turn indicator shows "AI (Easy/Medium/Hard)'S TURN"
    - Verify AI color is used for turn indicator styling
    - _Requirements: 7.3, 10.1_
  
  - [ ]* 12.3 Write property test for AI turn UI state
    - **Property 24: Grid clicks disabled during AI turn**
    - **Validates: Requirements 10.2**
    - Simulate game states where it's AI's turn
    - Verify click handler does not emit placeAtom event
    - Run 100 iterations
  
  - [ ]* 12.4 Write property test for human turn UI state
    - **Property 25: Grid clicks re-enabled on human turn**
    - **Validates: Requirements 10.4**
    - Simulate turn transitions from AI to human
    - Verify click handler emits placeAtom event
    - Run 100 iterations

- [x] 13. Implement error handling and edge cases
  - [x] 13.1 Add server-side input validation
    - Validate name length (1-12 characters) in createSoloMatch handler
    - Validate color is in VALID_COLORS array
    - Validate difficulty is 'easy', 'medium', or 'hard'
    - Emit errorMsg for invalid inputs
    - _Requirements: 2.6_
  
  - [x] 13.2 Handle AI calculation errors
    - Wrap executeAIMove in try-catch block
    - Log error to console
    - End game gracefully with human player as winner
    - Emit matchEnded with reason "AI encountered an error."
    - _Requirements: 9.4, 9.5_
  
  - [x] 13.3 Handle connection loss during solo game
    - Add disconnect event handler in game.js
    - Check if gameActive and isSoloMode are true
    - Show toast "Connection lost. Returning to menu..."
    - Return to menu after 4 second delay
    - _Requirements: 11.3_

- [ ] 14. Write integration tests for solo game flow
  - [ ]* 14.1 Write property test for solo room creation
    - **Property 3: Solo room creation includes AI opponent**
    - **Validates: Requirements 2.6**
    - Generate random player configurations and difficulty levels
    - Verify server creates room with exactly 2 players (1 human, 1 AI)
    - Verify AI has correct difficulty in name
    - Run 100 iterations
  
  - [ ]* 14.2 Write property test for solo room code prefix
    - **Property 19: Solo room codes have SOLO prefix**
    - **Validates: Requirements 8.1**
    - Create multiple solo rooms
    - Verify all room codes start with "SOLO-"
    - Run 100 iterations
  
  - [ ]* 14.3 Write property test for solo room flag
    - **Property 20: Solo rooms have solo flag**
    - **Validates: Requirements 8.3**
    - Create solo rooms with various configurations
    - Verify room.solo === true for all solo rooms
    - Run 100 iterations
  
  - [ ]* 14.4 Write property test for AI color assignment
    - **Property 27: AI color differs from player color**
    - **Validates: Requirements 12.1, 12.2**
    - Generate solo games with all possible player colors
    - Verify AI color is different from player color
    - Run 100 iterations
  
  - [ ]* 14.5 Write property test for AI color blue preference
    - **Property 28: AI color prioritizes blue**
    - **Validates: Requirements 12.3**
    - Generate solo games where player did not select blue
    - Verify AI is assigned blue color
    - Run 100 iterations

- [ ] 15. Write unit tests for UI components
  - [ ]* 15.1 Write unit tests for solo lobby navigation
    - Test solo mode button shows solo lobby
    - Test back button returns to main menu
    - Test name validation prevents empty names
    - Test difficulty selection updates UI state
  
  - [ ]* 15.2 Write unit tests for difficulty selector
    - Test default difficulty is "Easy"
    - Test clicking difficulty button updates active state
    - Test only one difficulty can be active at a time
    - Test selectedDifficulty variable updates correctly
  
  - [ ]* 15.3 Write unit tests for Play Again functionality
    - Test "PLAY AGAIN" button appears in solo mode
    - Test clicking "PLAY AGAIN" returns to solo lobby
    - Test difficulty is preserved after "PLAY AGAIN"
    - Test "REMATCH" button appears in multiplayer mode

- [ ] 16. Performance testing and optimization
  - [ ]* 16.1 Write performance tests for AI algorithms
    - Test Easy AI completes within 10ms
    - Test Medium AI completes within 100ms
    - Test Hard AI completes within 100ms
    - Test with complex game states (many valid moves)
  
  - [ ]* 16.2 Write memory leak tests
    - Test solo room cleanup on disconnect
    - Test AI timeout cleanup on room deletion
    - Test no memory leaks after 10 consecutive games
    - Verify room count returns to 0 after all games end

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical breakpoints
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- Implementation sequence follows: UI → Server → AI → Integration → Testing
- All code uses JavaScript to maintain consistency with existing codebase
- AI algorithms are implemented server-side to maintain server-authoritative architecture
