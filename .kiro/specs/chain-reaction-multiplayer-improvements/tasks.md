# Implementation Plan: Chain Reaction Multiplayer Improvements

## Overview

This plan addresses a critical turn synchronization deadlock bug and implements reliability improvements for the Chain Reaction multiplayer game. The core issue is a dual-state race condition where `currentPlayerIndex` and `targetTurnIndex` diverge during animation playback, causing both clients to believe it's the other player's turn.

The fix eliminates the dual-state entirely by introducing a single `turnIndex` variable that is updated atomically only after animation sequences complete. Additional improvements include input debouncing, disconnect handling during active turns, and state reconciliation for out-of-turn moves.

## Tasks

- [x] 1. Refactor client turn state to single source of truth
  - Remove `targetTurnIndex` variable from game.js
  - Remove `currentPlayerIndex` variable from game.js
  - Add single `turnIndex` variable (initialized to 0)
  - Add `pendingBatch` object to queue server events with their associated turnIndex
  - Add `waitingForServer` boolean flag for input debouncing (initialized to false)
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 2. Implement atomic turn index update after animation
  - [x] 2.1 Modify gameStateUpdate handler to queue events with turnIndex
    - When events array is non-empty, create pendingBatch object: `{ events, grid, turnIndex, turnCount }`
    - Do NOT update turnIndex immediately
    - When events array is empty (sync correction), apply grid and turnIndex immediately
    - Clear waitingForServer flag on any gameStateUpdate receipt
    - _Requirements: 1.2, 1.3, 2.3, 4.1_
  
  - [x] 2.2 Update processServerEvents to apply turnIndex atomically
    - Check if pendingBatch is null; if so, return early
    - Wait for projectiles.length === 0 before processing next event
    - When pendingBatch.events.length === 0 (all events processed), apply pendingBatch.grid to grid and pendingBatch.turnIndex to turnIndex in single operation
    - Set pendingBatch to null after applying
    - _Requirements: 1.3, 1.4, 4.2, 6.6_
  
  - [ ]* 2.3 Write property test for atomic turn index update
    - **Property 1: Turn Index Atomic Update After Animation**
    - **Validates: Requirements 1.3, 1.4**
    - Simulate gameStateUpdate with events, verify turnIndex only updates after pendingBatch becomes null

- [x] 3. Update click handler to use single turnIndex
  - [x] 3.1 Remove effectiveTurnIndex calculation logic
    - Replace with direct read of turnIndex variable
    - Add guard: return early if pendingBatch is not null
    - Add guard: return early if projectiles.length > 0
    - Add guard: return early if waitingForServer is true
    - Set waitingForServer = true immediately before emitting placeAtom
    - _Requirements: 1.5, 2.1, 2.2, 4.3, 4.4_
  
  - [ ]* 3.2 Write unit tests for click handler guards
    - Test click blocked when pendingBatch exists
    - Test click blocked when projectiles in flight
    - Test click blocked when waitingForServer is true
    - Test click allowed when all guards pass
    - _Requirements: 4.3_

- [x] 4. Checkpoint - Verify turn synchronization fix
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement server-side disconnect handling during active turn
  - [x] 5.1 Enhance disconnect handler for 'playing' state
    - After marking player offline, check if disconnected player was current turn holder
    - If yes, calculate atom counts and call findNextPlayerIndex
    - Broadcast gameStateUpdate with empty events array, current grid, and new turnIndex
    - Check if only one non-offline player remains; if so, end game and broadcast matchEnded
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ]* 5.2 Write property test for disconnect turn advancement
    - **Property 12: Current Player Disconnect Advances Turn**
    - **Validates: Requirements 3.3**
    - Simulate disconnect of current turn holder, verify turnIndex advances and gameStateUpdate is broadcast

- [x] 6. Update HUD to display offline players
  - [x] 6.1 Modify updateHudStats to show offline indicator
    - Check player.offline flag in score bar rendering
    - Display ⚡ icon next to offline player names
    - Reduce opacity of offline player chips to 0.3
    - _Requirements: 3.6_
  
  - [x] 6.2 Add eliminatedPlayers Set to track disconnected players
    - Initialize as empty Set in startMatchUI
    - Add playerId to set when playerDisconnected event received
    - Use set to determine visual dimming in HUD
    - _Requirements: 3.6_

- [x] 7. Implement state reconciliation for out-of-turn moves
  - [x] 7.1 Update server placeAtom handler validation
    - Check if currentPlayer.id matches socket.id
    - If not, emit gameStateUpdate to that socket only with empty events array
    - Include current authoritative grid, turnIndex, and turnCount
    - _Requirements: 2.4, 2.5, 11.2_
  
  - [ ]* 7.2 Write property test for out-of-turn rejection
    - **Property 5: Out-of-Turn Moves Trigger Sync Correction**
    - **Validates: Requirements 2.4, 2.5, 11.2**
    - Simulate placeAtom from non-current player, verify sync correction sent

- [x] 8. Add input debouncing to prevent double-clicks
  - [x] 8.1 Implement waitingForServer flag in click handler
    - Check flag at start of click handler; return if true
    - Set flag to true immediately before socket.emit('placeAtom')
    - Clear flag in gameStateUpdate handler (already done in task 2.1)
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 8.2 Write property test for debounce behavior
    - **Property 4: Debounce Prevents Duplicate Submissions**
    - **Validates: Requirements 2.2**
    - Simulate rapid clicks, verify only first click emits placeAtom

- [x] 9. Checkpoint - Verify all reliability improvements
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update render loop to use single turnIndex
  - [x] 10.1 Replace currentPlayerIndex references in renderGrid
    - Use turnIndex to determine current player for grid line coloring
    - _Requirements: 1.1_
  
  - [x] 10.2 Replace currentPlayerIndex references in updateHudStats
    - Use turnIndex to determine active player chip highlighting
    - Use turnIndex to determine turn indicator bar content
    - _Requirements: 1.1_

- [x] 11. Integration testing and validation
  - [ ]* 11.1 Write integration test for full turn cycle
    - Simulate two clients: host places atom → server processes → both clients animate → turn advances
    - Verify both clients have identical turnIndex after animation completes
    - _Requirements: 1.3, 1.4, 4.2_
  
  - [ ]* 11.2 Write integration test for disconnect during turn
    - Simulate current player disconnect → verify remaining client receives gameStateUpdate with advanced turnIndex
    - _Requirements: 3.3, 3.4_
  
  - [ ]* 11.3 Write integration test for rapid double-click prevention
    - Simulate rapid clicks before server response → verify only one placeAtom emitted
    - _Requirements: 2.2_
  
  - [ ]* 11.4 Write integration test for out-of-turn move correction
    - Simulate client sending placeAtom when not their turn → verify client receives sync correction
    - _Requirements: 2.5, 2.6_

- [x] 12. Final checkpoint - Complete validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The core bugfix is in tasks 1-4: eliminating dual-state and implementing atomic turn index updates
- Tasks 5-8 add reliability improvements: disconnect handling, HUD updates, state reconciliation, and input debouncing
- Tasks 10-11 complete the refactoring and add comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical breakpoints
- Property tests validate universal correctness properties from the design document
- Integration tests validate end-to-end behavior across client-server boundaries
