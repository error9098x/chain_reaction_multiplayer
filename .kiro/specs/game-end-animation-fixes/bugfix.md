# Bugfix Requirements Document

## Introduction

This document addresses three critical bugs in the Chain Reaction game end flow that affect user experience and system performance. These bugs occur when a multiplayer match ends and involve animation timing, resource cleanup, and notification delivery.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN matchEnded event fires THEN the system displays the victory modal immediately while chain reaction animations are still playing in the background

1.2 WHEN matchEnded event fires during an active chain reaction THEN the system sets gameActive to false but never clears pendingBatch, causing the render loop to run indefinitely (5+ minutes) consuming CPU resources

1.3 WHEN a player votes for rematch and the condition `voterName && votedCount < totalNeeded` is true THEN the system shows the toast notification to the voter themselves instead of to other players

### Expected Behavior (Correct)

2.1 WHEN matchEnded event fires THEN the system SHALL wait for all chain reaction animations (projectiles and pendingBatch) to complete before displaying the victory modal

2.2 WHEN matchEnded event fires during an active chain reaction THEN the system SHALL clear pendingBatch and allow the render loop to terminate gracefully once all projectiles complete their animations

2.3 WHEN a player votes for rematch and the condition `voterName && votedCount < totalNeeded` is true THEN the system SHALL show the toast notification "PlayerName wants a rematch!" only to other players, not to the voter

### Unchanged Behavior (Regression Prevention)

3.1 WHEN matchEnded event fires and no animations are active THEN the system SHALL CONTINUE TO display the victory modal immediately

3.2 WHEN the render loop processes frames and gameActive is true THEN the system SHALL CONTINUE TO render animations normally

3.3 WHEN the render loop processes frames and projectiles.length > 0 THEN the system SHALL CONTINUE TO render projectiles until they complete

3.4 WHEN a player votes for rematch THEN the system SHALL CONTINUE TO update the modal UI to show "VOTED ✓" and disable the rematch button for that player

3.5 WHEN rematchVoteUpdate event fires THEN the system SHALL CONTINUE TO update the waiting message with the current vote count (votedCount/totalNeeded)

3.6 WHEN all players vote for rematch THEN the system SHALL CONTINUE TO trigger the rematchStarted event and reset the game state
