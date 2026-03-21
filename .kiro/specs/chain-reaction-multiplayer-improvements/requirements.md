# Requirements Document: Chain Reaction Multiplayer Improvements

## Introduction

This document specifies the requirements for critical bug fixes and improvements to the Chain Reaction multiplayer game. The primary focus is resolving a turn synchronization deadlock that makes games uncompletable, along with reliability and user experience enhancements. The game is a server-authoritative, real-time multiplayer strategy game where players place atoms on a grid to trigger chain reactions and eliminate opponents.

## Glossary

- **System**: The Chain Reaction multiplayer game (client + server)
- **Server**: The Node.js + Socket.io backend that maintains authoritative game state
- **Client**: The browser-based game interface (vanilla JS + Canvas)
- **Turn_Index**: The index into the players array indicating whose turn it is
- **Game_State_Update**: Server event containing validated game events, grid state, and turn information
- **Pending_Batch**: Client-side queue of server events awaiting animation playback
- **Animation_Sequence**: The visual playback of atom placement and explosion events
- **Chain_Reaction**: A cascade of cell explosions triggered when atoms reach critical mass
- **Critical_Mass**: The number of atoms required to trigger an explosion (2 for corners, 3 for edges, 4 for center cells)
- **Offline_Player**: A player who has disconnected but whose game state is preserved
- **Eliminated_Player**: A player with zero atoms on the board after the grace period
- **Grace_Period**: The first N turns (N = player count) where no player can be eliminated
- **Debounce_Flag**: A client-side flag preventing rapid duplicate move submissions

## Requirements

### Requirement 1: Turn Synchronization Correctness

**User Story:** As a player, I want the game to correctly track whose turn it is, so that I can always make moves when it's my turn and the game never deadlocks.

#### Acceptance Criteria

1. THE Client SHALL maintain a single turn index variable that serves both rendering and click validation
2. WHEN a Game_State_Update is received, THE Client SHALL queue the turn index update with the event batch
3. WHEN an Animation_Sequence completes, THE Client SHALL apply the queued turn index atomically
4. THE Client SHALL NOT update the turn index while animations are in progress
5. WHEN the click handler executes, THE Client SHALL read the current turn index only if no animations are pending
6. THE Server SHALL include the authoritative Turn_Index in every Game_State_Update event
7. FOR ALL game states, the Server's Turn_Index SHALL point to a valid, non-offline, non-eliminated player

### Requirement 2: Input Validation and Debouncing

**User Story:** As a player, I want my clicks to be processed reliably without sending duplicate moves, so that the game responds correctly to my input.

#### Acceptance Criteria

1. WHEN a player clicks to place an atom, THE Client SHALL set a debounce flag immediately
2. WHILE the debounce flag is set, THE Client SHALL ignore subsequent click events
3. WHEN any Game_State_Update is received, THE Client SHALL clear the debounce flag
4. THE Server SHALL validate that the requesting player's socket ID matches the current turn holder
5. IF a move is received from a non-current player, THEN THE Server SHALL send a sync correction with empty events
6. THE Client SHALL accept sync corrections and apply them immediately without animation

### Requirement 3: Disconnect Handling During Active Games

**User Story:** As a player, I want the game to continue smoothly when opponents disconnect, so that I can complete the match or receive a win.

#### Acceptance Criteria

1. WHEN a player disconnects during the 'playing' state, THE Server SHALL mark that player as offline
2. THE Server SHALL broadcast a playerDisconnected event to all remaining clients
3. IF the disconnected player was the current turn holder, THEN THE Server SHALL advance to the next valid player
4. WHEN advancing turns, THE Server SHALL skip offline players automatically
5. IF only one non-offline player remains, THEN THE Server SHALL end the game and declare that player the winner
6. THE Client SHALL display visual feedback for disconnected players in the HUD
7. THE Server SHALL send a Game_State_Update with empty events after advancing turn due to disconnect

### Requirement 4: State Reconciliation

**User Story:** As a player, I want my game state to stay synchronized with the server, so that I always see the correct board state and turn information.

#### Acceptance Criteria

1. WHEN the Client receives a Game_State_Update with empty events, THE Client SHALL apply the grid and turn index immediately
2. THE Client SHALL replace its local grid with the server's authoritative grid after each event batch completes
3. WHEN animations are pending, THE Client SHALL prevent click events from being processed
4. THE Client SHALL NOT read the turn index while a Pending_Batch exists
5. FOR ALL Game_State_Update events, the Server SHALL include the complete authoritative grid state

### Requirement 5: Turn Advancement Logic

**User Story:** As a player, I want turns to advance correctly to active players, so that the game progresses smoothly even when players are eliminated or offline.

#### Acceptance Criteria

1. WHEN a turn completes, THE Server SHALL calculate atom counts for all players
2. THE Server SHALL advance the Turn_Index to the next player in sequence
3. WHILE searching for the next player, THE Server SHALL skip offline players
4. WHILE the turn count is less than the Grace_Period, THE Server SHALL include all non-offline players
5. WHEN the turn count exceeds the Grace_Period, THE Server SHALL skip eliminated players with zero atoms
6. IF no valid next player exists, THEN THE Server SHALL end the game
7. THE Server SHALL broadcast the new Turn_Index in the Game_State_Update event

### Requirement 6: Animation and Event Processing

**User Story:** As a player, I want to see smooth animations of atom placements and explosions, so that I can understand what happened during each turn.

#### Acceptance Criteria

1. WHEN a Game_State_Update is received with events, THE Client SHALL queue them in a Pending_Batch
2. THE Client SHALL process events sequentially, waiting for projectile animations between explosion waves
3. WHEN a 'place' event is processed, THE Client SHALL update the grid cell and play an atom sound
4. WHEN an 'explodeWave' event is processed, THE Client SHALL clear exploding cells and create projectiles
5. WHEN all projectiles land, THE Client SHALL process the next event in the batch
6. WHEN all events in a batch complete, THE Client SHALL apply the target grid and turn index atomically
7. THE Client SHALL mark the HUD as dirty after each visual state change

### Requirement 7: Game Over and Winner Detection

**User Story:** As a player, I want to know immediately when the game ends and who won, so that I can celebrate victory or request a rematch.

#### Acceptance Criteria

1. WHEN the turn count reaches the Grace_Period, THE Server SHALL check for eliminated players
2. IF exactly one non-offline player has atoms remaining, THEN THE Server SHALL set the game state to 'finished'
3. IF zero non-offline players have atoms remaining, THEN THE Server SHALL declare a draw
4. WHEN the game state becomes 'finished', THE Server SHALL broadcast a matchEnded event
5. THE matchEnded event SHALL include the winner ID, winner name, winner color, and optional reason
6. WHEN a Client receives matchEnded, THE Client SHALL display the winner modal immediately
7. THE Client SHALL disable game interactions when the winner modal is shown

### Requirement 8: Rematch Flow

**User Story:** As a player, I want to easily start a rematch with the same players, so that I can play multiple games without recreating the room.

#### Acceptance Criteria

1. WHEN a player clicks the rematch button, THE Client SHALL emit a rematchVote event
2. THE Server SHALL track rematch votes in a set associated with the room
3. THE Server SHALL broadcast rematchVoteUpdate events showing current vote count and total needed
4. WHEN all non-offline players have voted, THEN THE Server SHALL reset the room to 'lobby' state
5. THE Server SHALL clear the grid, reset turn index to zero, and clear rematch votes
6. THE Server SHALL broadcast rematchStarted followed by lobbyUpdate events
7. THE Client SHALL hide the winner modal and return to the lobby screen when rematchStarted is received

### Requirement 9: Lobby Management

**User Story:** As a player, I want to create or join game rooms and see who's in the lobby, so that I can start matches with friends.

#### Acceptance Criteria

1. WHEN a player hosts a match, THE Server SHALL generate a unique 4-character room code
2. THE Server SHALL ensure the room code is not already in use
3. WHEN a player joins a match, THE Server SHALL validate the room code exists and is in 'lobby' state
4. THE Server SHALL prevent players from joining rooms that are full (6 players maximum)
5. THE Server SHALL prevent color conflicts by rejecting joins with already-taken colors
6. THE Server SHALL ensure unique player names by appending (2), (3), etc. for duplicates
7. THE Server SHALL broadcast lobbyUpdate events whenever the player list changes
8. THE Client SHALL display all lobby players with their names, colors, and host indicator

### Requirement 10: Match Start Validation

**User Story:** As a host, I want to start the match when ready, so that all players can begin playing simultaneously.

#### Acceptance Criteria

1. WHEN the host clicks start, THE Client SHALL emit a startMatch event
2. THE Server SHALL validate that the requesting socket is the room host
3. THE Server SHALL validate that the room is in 'lobby' state
4. THE Server SHALL validate that at least 2 players are in the room
5. IF validation fails, THEN THE Server SHALL send an errorMsg event to the requesting client
6. WHEN validation succeeds, THE Server SHALL set room state to 'playing'
7. THE Server SHALL initialize the grid, set turn index to 0, and broadcast matchStarted to all players

### Requirement 11: Atom Placement Validation

**User Story:** As a player, I want my atom placements to be validated by the server, so that the game rules are enforced fairly.

#### Acceptance Criteria

1. WHEN a placeAtom event is received, THE Server SHALL validate the room is in 'playing' state
2. THE Server SHALL validate the requesting player is the current turn holder
3. THE Server SHALL validate the target cell coordinates are within bounds
4. THE Server SHALL validate the target cell is empty or owned by the current player
5. IF any validation fails, THEN THE Server SHALL send a sync correction to the requesting client
6. WHEN validation succeeds, THE Server SHALL execute the turn logic and generate events
7. THE Server SHALL broadcast the Game_State_Update to all players in the room

### Requirement 12: Chain Reaction Processing

**User Story:** As a player, I want chain reactions to resolve correctly and completely, so that the game mechanics work as expected.

#### Acceptance Criteria

1. WHEN an atom is placed, THE Server SHALL increment the cell count and set the cell color
2. THE Server SHALL check all cells for critical mass conditions
3. WHEN cells reach Critical_Mass, THE Server SHALL generate an explodeWave event
4. THE Server SHALL clear exploding cells and create flying atoms to neighbors
5. THE Server SHALL apply flying atoms to target cells after clearing all explosions in the wave
6. THE Server SHALL repeat explosion detection until no cells are at Critical_Mass
7. THE Server SHALL enforce a safety limit of 1000 iterations to prevent infinite loops

### Requirement 13: Player Leave and Cleanup

**User Story:** As a player, I want to leave a game cleanly, so that I can exit without affecting other players unnecessarily.

#### Acceptance Criteria

1. WHEN a player emits leaveGame, THE Server SHALL remove that player from the room
2. THE Server SHALL remove the player's rematch vote if present
3. THE Server SHALL broadcast playerLeftGame to remaining players
4. IF the leaving player was the host, THEN THE Server SHALL reassign host to the first remaining player
5. IF the room becomes empty, THEN THE Server SHALL delete the room from memory
6. WHEN in 'finished' state and a player leaves, THE Server SHALL check if remaining players all voted for rematch
7. IF all remaining players voted, THEN THE Server SHALL trigger rematch automatically

### Requirement 14: Error Feedback

**User Story:** As a player, I want clear error messages when something goes wrong, so that I understand what happened and can correct it.

#### Acceptance Criteria

1. WHEN a player attempts an invalid action, THE Server SHALL send an errorMsg event
2. THE Client SHALL display error messages as non-intrusive toast notifications
3. WHEN a player name is invalid, THE Server SHALL send an error describing the validation failure
4. WHEN a room code is not found, THE Server SHALL send an error indicating the room doesn't exist
5. WHEN a color is already taken, THE Server SHALL list available colors in the error message
6. THE Client SHALL display toast messages for 3-4 seconds with smooth fade animations
7. THE Client SHALL show toast messages for player disconnections and other game events

### Requirement 15: Audio Feedback

**User Story:** As a player, I want audio feedback for game actions, so that the game feels responsive and engaging.

#### Acceptance Criteria

1. WHEN an atom is placed, THE Client SHALL play an atom placement sound
2. WHEN an explosion wave occurs, THE Client SHALL play an explosion sound
3. WHEN the game ends, THE Client SHALL play a victory tune
4. WHEN a button is clicked, THE Client SHALL play a button pop sound
5. THE Client SHALL initialize the audio context on first user interaction
6. THE Client SHALL use Web Audio API for all sound generation
7. THE Client SHALL set appropriate volume levels to avoid audio fatigue

### Requirement 16: Visual Feedback and HUD

**User Story:** As a player, I want clear visual indicators of game state, so that I always know whose turn it is and what the score is.

#### Acceptance Criteria

1. THE Client SHALL display a score bar showing all players with their atom counts
2. THE Client SHALL highlight the current player's chip in the score bar
3. THE Client SHALL display a turn indicator bar showing whose turn it is
4. THE Client SHALL color the turn indicator bar with the current player's color
5. THE Client SHALL dim eliminated and offline players in the score bar
6. THE Client SHALL show an offline indicator (⚡) for disconnected players
7. THE Client SHALL update the HUD whenever the statsDirty flag is set

### Requirement 17: Canvas Rendering

**User Story:** As a player, I want smooth, high-quality graphics, so that the game is visually appealing and easy to understand.

#### Acceptance Criteria

1. THE Client SHALL render the grid with lines colored to match the current player's turn
2. THE Client SHALL render atoms as 3D spheres with highlights and shadows
3. WHEN cells are near Critical_Mass, THE Client SHALL animate them with a jitter effect
4. THE Client SHALL render projectiles with smooth interpolation between source and target cells
5. THE Client SHALL use requestAnimationFrame for all rendering
6. THE Client SHALL configure canvas resolution based on device pixel ratio
7. THE Client SHALL stop the render loop when the game is inactive and no animations are pending

### Requirement 18: Room Code Management

**User Story:** As a player, I want to easily share the room code with friends, so that they can join my game.

#### Acceptance Criteria

1. THE Client SHALL display the room code prominently in the lobby
2. WHEN the copy button is clicked, THE Client SHALL copy the room code to the clipboard
3. THE Client SHALL show a toast confirmation when the code is copied
4. THE Server SHALL generate room codes using alphanumeric characters (A-Z, 0-9)
5. THE Server SHALL generate 4-character codes providing approximately 1.7 million combinations
6. THE Server SHALL retry code generation if a collision occurs
7. THE Client SHALL display the room code in both the lobby and game screens

### Requirement 19: Performance and Safety

**User Story:** As a player, I want the game to run smoothly without crashes or hangs, so that I can enjoy uninterrupted gameplay.

#### Acceptance Criteria

1. THE Server SHALL enforce a 1000-iteration safety limit on chain reaction loops
2. THE Server SHALL process atom count calculations in O(ROWS × COLS) time
3. THE Client SHALL stop the render loop when no animations are pending
4. THE Client SHALL use Socket.io rooms to scope broadcasts to room members only
5. THE Server SHALL clean up empty rooms immediately when the last player leaves
6. THE Client SHALL prevent memory leaks by removing completed projectiles from the array
7. THE Client SHALL use efficient canvas rendering with proper alpha blending

### Requirement 20: Security and Validation

**User Story:** As a player, I want the game to be fair and secure, so that no one can cheat or disrupt gameplay.

#### Acceptance Criteria

1. THE Server SHALL validate all player actions before applying state changes
2. THE Server SHALL verify socket identity matches the current turn holder for all moves
3. THE Server SHALL validate cell coordinates are within grid bounds
4. THE Server SHALL validate cell ownership before allowing atom placement
5. THE Server SHALL trim and limit player names to 12 characters maximum
6. THE Server SHALL prevent players from joining multiple rooms simultaneously
7. THE Server SHALL use text content (not innerHTML) for player names to prevent XSS attacks
