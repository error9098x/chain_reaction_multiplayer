# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Victory Modal Timing, Render Loop Termination, and Rematch Notification
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate all three bugs exist
  - **Scoped PBT Approach**: For deterministic bugs, scope the properties to the concrete failing cases to ensure reproducibility

  - [x] 1.1 Test Bug 1: Victory modal timing
    - Simulate matchEnded firing while projectiles.length > 0
    - Simulate matchEnded firing while pendingBatch !== null
    - Assert modal remains hidden while animations are active
    - Run test on UNFIXED code
    - **EXPECTED OUTCOME**: Test FAILS (modal appears immediately - proves bug exists)
    - Document counterexamples: modal visible while projectiles flying, modal visible while pendingBatch processing
    - _Requirements: 2.1_

  - [x] 1.2 Test Bug 2: Infinite render loop
    - Trigger matchEnded with pendingBatch containing 5 events
    - Monitor requestAnimationFrame calls for 2 seconds
    - Assert render loop terminates within reasonable time
    - Run test on UNFIXED code
    - **EXPECTED OUTCOME**: Test FAILS (render loop continues indefinitely - proves bug exists)
    - Document counterexamples: pendingBatch remains non-null, render loop continues after game ends
    - _Requirements: 2.2_

  - [x] 1.3 Test Bug 3: Rematch notification to voter
    - Simulate rematchVoteUpdate event where voterId equals myPlayerId
    - Assert toast notification is NOT shown to the voter
    - Run test on UNFIXED code
    - **EXPECTED OUTCOME**: Test FAILS (voter sees their own toast - proves bug exists)
    - Document counterexamples: voter receives toast "YourName wants a rematch!"
    - _Requirements: 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Game End Behaviors
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code

  - [x] 2.1 Test immediate modal display (no animations)
    - Observe: matchEnded with projectiles.length = 0 and pendingBatch = null shows modal immediately on unfixed code
    - Write property-based test: for all game-end states with no active animations, modal appears immediately
    - Verify test passes on UNFIXED code
    - _Requirements: 3.1_

  - [x] 2.2 Test normal animation rendering during gameplay
    - Observe: animations render correctly when gameActive = true on unfixed code
    - Write property-based test: for all render frames where gameActive is true, animations render normally
    - Verify test passes on UNFIXED code
    - _Requirements: 3.2, 3.3_

  - [x] 2.3 Test rematch vote UI updates
    - Observe: rematch button shows "VOTED ✓" and disables when player votes on unfixed code
    - Observe: waiting message updates with vote count on unfixed code
    - Write property-based test: for all rematch votes, UI updates correctly
    - Verify test passes on UNFIXED code
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 3. Fix for game end animation bugs

  - [x] 3.1 Implement Fix 1: Victory modal timing (game.js lines 342-373)
    - Add module-level variable `pendingVictoryModal` to store modal data
    - Remove immediate modal display from matchEnded handler (line 371)
    - Store modal data in pendingVictoryModal when matchEnded fires
    - Create `checkAndShowVictoryModal()` function that polls animation state
    - Use requestAnimationFrame to wait until projectiles.length = 0 AND pendingBatch = null
    - Display modal only after animations complete
    - _Bug_Condition: isBugCondition_ModalTiming(state) where matchEndedFired = true AND (projectiles.length > 0 OR pendingBatch !== null)_
    - _Expected_Behavior: Modal displays only after projectiles.length = 0 AND pendingBatch = null_
    - _Preservation: Immediate modal display when no animations are active (3.1), normal animation rendering (3.2, 3.3)_
    - _Requirements: 2.1, 3.1, 3.2, 3.3_

  - [x] 3.2 Implement Fix 2: Render loop termination (game.js line 349)
    - Add `pendingBatch = null;` immediately after `gameActive = false;` in matchEnded handler
    - Position at line 350 (right after gameActive = false)
    - Ensure render loop can terminate once projectiles complete
    - _Bug_Condition: isBugCondition_InfiniteLoop(state) where matchEndedFired = true AND gameActive = false AND pendingBatch !== null_
    - _Expected_Behavior: pendingBatch cleared immediately when matchEnded fires, render loop terminates gracefully_
    - _Preservation: Normal animation rendering during gameplay (3.2, 3.3)_
    - _Requirements: 2.2, 3.2, 3.3_

  - [x] 3.3 Implement Fix 3: Rematch notification filtering (game.js lines 403-407, server.js lines 442-447)
    - Server: Add `voterId: socket.id` to rematchVoteUpdate event emission (server.js line 442-447)
    - Client: Add `voterId` parameter to rematchVoteUpdate event handler destructuring
    - Client: Add condition `&& voterId !== myPlayerId` before showing toast
    - Ensure toast only shows to other players, not the voter
    - _Bug_Condition: isBugCondition_RematchNotification(event, myPlayerId) where voterName !== null AND votedCount < totalNeeded AND voterSocketId = myPlayerId_
    - _Expected_Behavior: Toast shown only when voterId !== myPlayerId_
    - _Preservation: Rematch vote UI updates (3.4, 3.5, 3.6)_
    - _Requirements: 2.3, 3.4, 3.5, 3.6_

  - [x] 3.4 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Victory Modal Timing, Render Loop Termination, and Rematch Notification
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Game End Behaviors
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fixes (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Verify all bug condition tests pass (modal timing, render loop, rematch notification)
  - Verify all preservation tests pass (immediate modal, animation rendering, rematch UI)
  - Test full game flow: play to completion with chain reaction → verify modal appears after animations
  - Test rematch flow: multiple players vote → verify voters don't see own toast
  - Ask the user if questions arise
