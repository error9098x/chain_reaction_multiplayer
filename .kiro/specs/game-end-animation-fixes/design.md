# Game End Animation Fixes - Bugfix Design

## Overview

This design addresses three critical bugs in the Chain Reaction game end flow that affect user experience and system performance. The bugs involve premature modal display during animations, infinite render loops due to incomplete state cleanup, and incorrect notification delivery to rematch voters. The fix approach ensures animations complete before UI transitions, proper resource cleanup when the game ends, and correct notification targeting based on player identity.

## Glossary

- **Bug_Condition (C)**: The conditions that trigger each of the three bugs
- **Property (P)**: The desired behavior when the bug conditions are met
- **Preservation**: Existing game-end, animation, and rematch behaviors that must remain unchanged
- **pendingBatch**: A queued batch of server events (explosions, placements) with associated grid state and turn index, processed during chain reaction animations
- **projectiles**: Array of flying atom animations currently being rendered
- **gameActive**: Boolean flag indicating whether the game is in an active playing state
- **render loop**: The requestAnimationFrame-based animation loop that renders projectiles and processes server events
- **matchEnded event**: Server-emitted event signaling that a player has won the game
- **rematchVoteUpdate event**: Server-emitted event broadcasting rematch vote progress to all players in the room

## Bug Details

### Bug 1: Victory Modal Timing

The victory modal displays immediately when matchEnded fires, even while chain reaction animations are still playing. This creates a jarring user experience where explosions continue behind the modal.

**Formal Specification:**
```
FUNCTION isBugCondition_ModalTiming(state)
  INPUT: state containing { matchEndedFired, projectiles, pendingBatch }
  OUTPUT: boolean
  
  RETURN matchEndedFired = true
         AND (projectiles.length > 0 OR pendingBatch !== null)
END FUNCTION
```

**Examples:**
- Player places final atom → chain reaction starts → matchEnded fires immediately → modal appears while explosions animate (BUG)
- Player places final atom → no chain reaction → matchEnded fires → modal appears immediately (CORRECT - no animations)
- Large chain reaction with 20+ explosions → matchEnded fires after first wave → modal blocks view of remaining animations (BUG)

### Bug 2: Infinite Render Loop

When matchEnded fires during an active chain reaction, gameActive is set to false but pendingBatch is never cleared. The render loop continues checking `pendingBatch !== null` indefinitely, consuming CPU resources for 5+ minutes.

**Formal Specification:**
```
FUNCTION isBugCondition_InfiniteLoop(state)
  INPUT: state containing { matchEndedFired, gameActive, pendingBatch }
  OUTPUT: boolean
  
  RETURN matchEndedFired = true
         AND gameActive = false
         AND pendingBatch !== null
END FUNCTION
```

**Examples:**
- matchEnded fires with pendingBatch containing 5 explosion events → gameActive set to false → render loop runs indefinitely (BUG)
- matchEnded fires with pendingBatch = null → gameActive set to false → render loop terminates correctly (CORRECT)
- matchEnded fires with projectiles.length > 0 but pendingBatch = null → render loop terminates after projectiles finish (CORRECT)

### Bug 3: Rematch Notification to Voter

When a player votes for rematch, the rematchVoteUpdate event handler shows a toast notification to all players including the voter themselves. The voter sees "YourName wants a rematch!" which is confusing.

**Formal Specification:**
```
FUNCTION isBugCondition_RematchNotification(event, myPlayerId)
  INPUT: event containing { voterName, votedCount, totalNeeded, voterSocketId }
        myPlayerId: current player's socket ID
  OUTPUT: boolean
  
  RETURN voterName !== null
         AND votedCount < totalNeeded
         AND voterSocketId = myPlayerId
         AND toastShown = true
END FUNCTION
```

**Examples:**
- Player "Alice" votes for rematch → rematchVoteUpdate fires with voterName="Alice" → Alice sees toast "Alice wants a rematch!" (BUG)
- Player "Bob" votes for rematch → rematchVoteUpdate fires → Alice sees toast "Bob wants a rematch!" (CORRECT)
- Player "Charlie" votes for rematch and votedCount = totalNeeded → no toast shown to anyone (CORRECT - game starting)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When matchEnded fires and no animations are active (projectiles.length = 0 AND pendingBatch = null), the modal must display immediately
- When the render loop processes frames and gameActive is true, animations must render normally
- When projectiles are flying, the render loop must continue until all projectiles complete
- When a player votes for rematch, the modal UI must update to show "VOTED ✓" and disable the button for that player
- When rematchVoteUpdate fires, the waiting message must update with current vote count (votedCount/totalNeeded)
- When all players vote for rematch, the rematchStarted event must trigger and reset game state

**Scope:**
All inputs and states that do NOT involve the three specific bug conditions should be completely unaffected by this fix. This includes:
- Normal game-end flow when no animations are active
- Animation rendering during active gameplay
- Rematch vote counting and state synchronization
- Modal button state management
- Game state reset on rematch

## Hypothesized Root Cause

Based on the bug descriptions and code analysis, the root causes are:

### Bug 1: Modal Timing
**Root Cause**: The matchEnded event handler (line 342-373 in game.js) immediately shows the modal without checking animation state. There is no coordination between the animation system (render loop, projectiles, pendingBatch) and the UI system (modal display).

**Evidence**:
- Line 371: `winnerModal.classList.remove('hidden');` executes immediately when matchEnded fires
- No check for `projectiles.length > 0` or `pendingBatch !== null` before showing modal
- The render loop and modal display are completely decoupled

### Bug 2: Infinite Render Loop
**Root Cause**: The matchEnded event handler sets `gameActive = false` (line 349) but never clears `pendingBatch`. The render loop condition on line 809 checks `pendingBatch !== null`, causing it to continue indefinitely even though the game is over.

**Evidence**:
- Line 349: `gameActive = false;` is set when matchEnded fires
- Line 809: `if (gameActive || projectiles.length > 0 || pendingBatch !== null)` keeps the loop running
- Line 582-591: `processServerEvents` only clears pendingBatch when all events are processed, but this never happens because the game ended mid-batch
- No cleanup logic in matchEnded handler to clear pendingBatch

### Bug 3: Rematch Notification
**Root Cause**: The rematchVoteUpdate event handler (line 403-407 in game.js) shows a toast to all players when `voterName && votedCount < totalNeeded` is true, without checking if the current player is the voter. The server emits this event to all players in the room (line 442-447 in server.js) including the voter.

**Evidence**:
- Line 406: `showToast(\`${voterName} wants a rematch!\`);` executes for all players
- No check comparing voterName or voter socket ID against myPlayerId
- Server broadcasts rematchVoteUpdate to entire room via `io.to(code).emit()` (line 442)

## Correctness Properties

Property 1: Bug Condition - Victory Modal Waits for Animations

_For any_ game-end state where matchEnded fires and animations are active (projectiles.length > 0 OR pendingBatch !== null), the fixed code SHALL delay displaying the victory modal until both projectiles.length = 0 AND pendingBatch = null, ensuring all chain reaction animations complete before the UI transition.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Render Loop Terminates

_For any_ game-end state where matchEnded fires during an active chain reaction (pendingBatch !== null), the fixed code SHALL clear pendingBatch immediately, allowing the render loop to terminate gracefully once projectiles complete, preventing infinite CPU consumption.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Rematch Notification Excludes Voter

_For any_ rematchVoteUpdate event where voterName is provided and votedCount < totalNeeded, the fixed code SHALL show the toast notification only to players whose socket ID does not match the voter's socket ID, preventing the voter from seeing their own rematch request.

**Validates: Requirements 2.3**

Property 4: Preservation - Immediate Modal Display

_For any_ game-end state where matchEnded fires and no animations are active (projectiles.length = 0 AND pendingBatch = null), the fixed code SHALL display the victory modal immediately, preserving the existing fast UI response for non-animated game endings.

**Validates: Requirements 3.1**

Property 5: Preservation - Animation Rendering

_For any_ render loop frame where gameActive is true, the fixed code SHALL continue rendering animations normally, preserving all existing animation behavior during active gameplay.

**Validates: Requirements 3.2, 3.3**

Property 6: Preservation - Rematch Vote UI

_For any_ rematch vote action, the fixed code SHALL continue updating the modal UI to show "VOTED ✓", disable the button, and update vote counts, preserving all existing rematch flow behavior.

**Validates: Requirements 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File**: `game.js`

#### Fix 1: Victory Modal Timing (Lines 342-373)

**Current Code**:
```javascript
socket.on('matchEnded', ({ winnerId, winnerName, winnerColor, reason }) => {
    // ... setup code ...
    gameActive = false;
    // ... modal content setup ...
    winnerModal.classList.remove('hidden'); // Shows immediately
});
```

**Specific Changes**:
1. **Remove immediate modal display**: Delete line 371 `winnerModal.classList.remove('hidden');`
2. **Add deferred modal display**: Create a new function `showVictoryModalWhenReady()` that checks animation state
3. **Poll animation state**: Use `requestAnimationFrame` to poll until `projectiles.length === 0 && pendingBatch === null`
4. **Store modal data**: Save winnerId, winnerName, winnerColor, reason in module-level variables for deferred access

**Implementation Approach**:
```javascript
// Module-level state for deferred modal
let pendingVictoryModal = null;

socket.on('matchEnded', ({ winnerId, winnerName, winnerColor, reason }) => {
    // ... existing setup code ...
    gameActive = false;
    
    // Store modal data for deferred display
    pendingVictoryModal = { winnerId, winnerName, winnerColor, reason };
    
    // Start checking if we can show modal
    checkAndShowVictoryModal();
});

function checkAndShowVictoryModal() {
    if (!pendingVictoryModal) return;
    
    // Wait for animations to complete
    if (projectiles.length > 0 || pendingBatch !== null) {
        requestAnimationFrame(checkAndShowVictoryModal);
        return;
    }
    
    // Animations complete - show modal
    const { winnerId, winnerName, winnerColor, reason } = pendingVictoryModal;
    pendingVictoryModal = null;
    
    // ... existing modal setup code ...
    winnerModal.classList.remove('hidden');
}
```

#### Fix 2: Infinite Render Loop (Line 349)

**Current Code**:
```javascript
socket.on('matchEnded', ({ winnerId, winnerName, winnerColor, reason }) => {
    // ...
    gameActive = false;
    // pendingBatch is never cleared
});
```

**Specific Changes**:
1. **Clear pendingBatch**: Add `pendingBatch = null;` immediately after `gameActive = false;`
2. **Position**: Insert at line 350 (right after gameActive = false)

**Implementation Approach**:
```javascript
socket.on('matchEnded', ({ winnerId, winnerName, winnerColor, reason }) => {
    // ...
    gameActive = false;
    pendingBatch = null; // Clear pending animations when game ends
    // ...
});
```

**Rationale**: When the game ends, any pending server events are no longer relevant. The server has already determined the winner, so client-side animation of remaining explosions is purely cosmetic. Clearing pendingBatch allows the render loop to terminate once flying projectiles finish, preventing the infinite loop.

#### Fix 3: Rematch Notification to Voter (Lines 403-407)

**Current Code**:
```javascript
socket.on('rematchVoteUpdate', ({ votedCount, totalNeeded, voterName }) => {
    // ... update waiting message ...
    if (voterName && votedCount < totalNeeded) {
        showToast(`${voterName} wants a rematch!`); // Shows to everyone including voter
    }
});
```

**Specific Changes**:
1. **Add voter ID to server event**: Modify server.js line 442-447 to include `voterId: socket.id` in the emitted event
2. **Check voter identity**: Add condition `&& voterId !== myPlayerId` before showing toast
3. **Update event handler signature**: Add `voterId` parameter to destructured event object

**Implementation Approach**:

**Client (game.js)**:
```javascript
socket.on('rematchVoteUpdate', ({ votedCount, totalNeeded, voterName, voterId }) => {
    if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
        modalWaitingMsg.textContent = `Waiting for players... (${votedCount}/${totalNeeded})`;
    }
    // Only show toast to OTHER players, not the voter
    if (voterName && votedCount < totalNeeded && voterId !== myPlayerId) {
        showToast(`${voterName} wants a rematch!`);
    }
});
```

**Server (server.js, line 442-447)**:
```javascript
io.to(code).emit('rematchVoteUpdate', {
    votedCount: currentVotes,
    totalNeeded: totalVotesNeeded,
    voterName: player.name,
    voterId: socket.id, // Add voter socket ID
});
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate all three bugs BEFORE implementing fixes. Confirm root cause analysis for each bug.

#### Bug 1: Modal Timing Tests

**Test Plan**: Simulate game-end scenarios with active animations and verify modal display timing on UNFIXED code.

**Test Cases**:
1. **Chain Reaction Game End**: Place final atom that triggers 10+ explosion waves → matchEnded fires during animations → verify modal appears immediately (will fail - demonstrates bug)
2. **Projectiles In Flight**: Trigger matchEnded while projectiles.length > 0 → verify modal waits for projectiles (will fail - demonstrates bug)
3. **Pending Batch Active**: Trigger matchEnded while pendingBatch contains events → verify modal waits for batch completion (will fail - demonstrates bug)
4. **No Animations**: Trigger matchEnded with no active animations → verify modal appears immediately (should pass - correct behavior)

**Expected Counterexamples**:
- Modal appears while projectiles are still flying
- Modal appears while pendingBatch is being processed
- User cannot see final explosion animations behind modal

#### Bug 2: Render Loop Tests

**Test Plan**: Monitor render loop execution after matchEnded fires with active pendingBatch on UNFIXED code.

**Test Cases**:
1. **Infinite Loop Detection**: Trigger matchEnded with pendingBatch containing 5 events → monitor requestAnimationFrame calls → verify loop continues indefinitely (will fail - demonstrates bug)
2. **CPU Usage**: Measure CPU usage before and after matchEnded with active pendingBatch → verify CPU remains elevated for 5+ minutes (will fail - demonstrates bug)
3. **Normal Termination**: Trigger matchEnded with pendingBatch = null → verify render loop terminates (should pass - correct behavior)

**Expected Counterexamples**:
- Render loop continues calling requestAnimationFrame after game ends
- pendingBatch remains non-null indefinitely
- CPU usage stays elevated long after game ends

#### Bug 3: Rematch Notification Tests

**Test Plan**: Simulate rematch votes and verify toast notification recipients on UNFIXED code.

**Test Cases**:
1. **Voter Sees Own Toast**: Player A votes for rematch → verify Player A sees toast "Player A wants a rematch!" (will fail - demonstrates bug)
2. **Other Players See Toast**: Player A votes → verify Player B sees toast "Player A wants a rematch!" (should pass - correct behavior)
3. **All Voted**: Player A votes when votedCount will equal totalNeeded → verify no toast shown (should pass - correct behavior)

**Expected Counterexamples**:
- Voter receives toast notification about their own vote
- Toast message shows voter's own name to themselves

### Fix Checking

**Goal**: Verify that for all inputs where bug conditions hold, the fixed functions produce expected behavior.

#### Bug 1: Modal Timing Fix Checking
**Pseudocode:**
```
FOR ALL gameState WHERE isBugCondition_ModalTiming(gameState) DO
  triggerMatchEnded(gameState)
  ASSERT modalVisible = false WHILE (projectiles.length > 0 OR pendingBatch !== null)
  waitForAnimationsComplete()
  ASSERT modalVisible = true AFTER (projectiles.length = 0 AND pendingBatch = null)
END FOR
```

#### Bug 2: Render Loop Fix Checking
**Pseudocode:**
```
FOR ALL gameState WHERE isBugCondition_InfiniteLoop(gameState) DO
  triggerMatchEnded(gameState)
  ASSERT pendingBatch = null IMMEDIATELY
  ASSERT renderLoopTerminates() WITHIN reasonable_time
END FOR
```

#### Bug 3: Rematch Notification Fix Checking
**Pseudocode:**
```
FOR ALL event WHERE isBugCondition_RematchNotification(event, myPlayerId) DO
  handleRematchVoteUpdate(event)
  ASSERT toastNotShown() FOR voter
  ASSERT toastShown() FOR other_players
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where bug conditions do NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL gameState WHERE NOT isBugCondition_ModalTiming(gameState) DO
  ASSERT matchEnded_original(gameState) = matchEnded_fixed(gameState)
END FOR

FOR ALL gameState WHERE NOT isBugCondition_InfiniteLoop(gameState) DO
  ASSERT renderLoop_original(gameState) = renderLoop_fixed(gameState)
END FOR

FOR ALL event WHERE NOT isBugCondition_RematchNotification(event, myPlayerId) DO
  ASSERT rematchHandler_original(event) = rematchHandler_fixed(event)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug scenarios, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Immediate Modal Display**: Observe that modal appears immediately when no animations are active on unfixed code → write test to verify this continues after fix
2. **Normal Animation Rendering**: Observe that animations render correctly during active gameplay on unfixed code → write test to verify this continues after fix
3. **Rematch Vote Counting**: Observe that vote counts update correctly on unfixed code → write test to verify this continues after fix
4. **Modal Button States**: Observe that "VOTED ✓" appears and button disables on unfixed code → write test to verify this continues after fix

### Unit Tests

- Test checkAndShowVictoryModal with various animation states (projectiles only, pendingBatch only, both, neither)
- Test pendingBatch clearing when matchEnded fires with active batch
- Test rematchVoteUpdate handler with voter ID matching and not matching myPlayerId
- Test edge case: matchEnded fires twice (should not show modal twice)
- Test edge case: rematchVoteUpdate with null voterName (should not show toast)

### Property-Based Tests

- Generate random game states with varying projectile counts and pendingBatch states → verify modal timing is always correct
- Generate random animation states when matchEnded fires → verify render loop always terminates
- Generate random player configurations and rematch votes → verify toast notifications always go to correct recipients
- Test that all non-buggy game-end scenarios continue to work across many random states

### Integration Tests

- Full game flow: Play game to completion with large chain reaction → verify modal appears after animations → verify render loop terminates
- Rematch flow: Multiple players vote for rematch → verify each voter doesn't see their own toast → verify all other players see toasts
- Edge case: Player disconnects during victory modal delay → verify modal still appears for remaining players
- Edge case: Rematch vote during animation delay → verify vote counting works correctly
