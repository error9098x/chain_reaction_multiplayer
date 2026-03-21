# Requirements Document

## Introduction

This document specifies requirements for a Solo Player Mode (practice mode) feature for the Chain Reaction multiplayer game. The solo mode allows a single human player to practice game mechanics against AI opponents with configurable difficulty levels. The feature integrates seamlessly with the existing multiplayer architecture while maintaining the server-authoritative game model.

## Glossary

- **Solo_Mode**: A game mode where a single human player competes against AI-controlled opponents
- **AI_Opponent**: A computer-controlled player that makes moves using algorithmic decision-making
- **Difficulty_Level**: A configuration setting that determines AI opponent behavior (Easy, Medium, or Hard)
- **Game_Server**: The Node.js server that manages game state and validates all moves
- **Game_Client**: The browser-based UI that displays game state and captures user input
- **Main_Menu**: The initial screen where players select game mode and configure settings
- **Solo_Lobby**: The pre-game screen for solo mode where players configure AI opponents
- **Move_Evaluation**: The algorithmic process by which AI determines the best cell to place an atom
- **Critical_Cell**: A grid cell that is one atom away from reaching critical mass and exploding
- **Chain_Potential**: A measure of how many subsequent explosions a move might trigger
- **Defensive_Move**: A placement that prevents an opponent from creating a dangerous chain reaction
- **Offensive_Move**: A placement that creates or extends a chain reaction to capture opponent cells

## Requirements

### Requirement 1: Solo Mode Selection

**User Story:** As a player, I want to select solo mode from the main menu, so that I can practice against AI opponents.

#### Acceptance Criteria

1. THE Main_Menu SHALL display a "SOLO MODE" button alongside existing "HOST MATCH" and "JOIN MATCH" buttons
2. WHEN the player clicks "SOLO MODE", THE Game_Client SHALL display the Solo_Lobby screen
3. THE Solo_Lobby SHALL display the player's name and color selection from the main menu
4. WHEN the player has not entered a name, THE Game_Client SHALL display an error message and prevent solo mode entry
5. THE Solo_Lobby SHALL provide a "BACK" button that returns to the Main_Menu

### Requirement 2: AI Opponent Configuration

**User Story:** As a player, I want to configure AI opponent difficulty, so that I can adjust the challenge level to match my skill.

#### Acceptance Criteria

1. THE Solo_Lobby SHALL display three difficulty options: "Easy", "Medium", and "Hard"
2. THE Solo_Lobby SHALL display "Easy" as the default selected difficulty
3. WHEN the player selects a difficulty level, THE Game_Client SHALL highlight the selected option
4. THE Solo_Lobby SHALL display a "START GAME" button to begin the match
5. WHEN the player clicks "START GAME", THE Game_Client SHALL send the difficulty level to the Game_Server
6. THE Game_Server SHALL create a solo game room with one human player and one AI_Opponent

### Requirement 3: Easy AI Behavior

**User Story:** As a beginner player, I want to play against an Easy AI, so that I can learn game mechanics without overwhelming difficulty.

#### Acceptance Criteria

1. WHEN it is the Easy AI's turn, THE Game_Server SHALL select a random valid move from all available cells
2. THE Game_Server SHALL identify valid cells as empty cells or cells owned by the AI_Opponent
3. THE Game_Server SHALL execute the selected move within 800ms to 1200ms of the turn starting
4. THE Game_Server SHALL apply random delay to simulate human thinking time
5. FOR ALL Easy AI moves, the move selection SHALL NOT consider strategic factors such as critical mass or chain reactions

### Requirement 4: Medium AI Behavior

**User Story:** As an intermediate player, I want to play against a Medium AI, so that I can practice strategic thinking.

#### Acceptance Criteria

1. WHEN it is the Medium AI's turn, THE Game_Server SHALL evaluate all valid moves using a scoring algorithm
2. THE Game_Server SHALL assign higher scores to moves that place atoms on Critical_Cells owned by the AI_Opponent
3. THE Game_Server SHALL assign higher scores to moves that place atoms adjacent to opponent cells
4. THE Game_Server SHALL assign lower scores to moves on empty cells far from opponent atoms
5. THE Game_Server SHALL select the move with the highest score
6. IF multiple moves have equal highest scores, THEN THE Game_Server SHALL randomly select one of them
7. THE Game_Server SHALL execute the selected move within 600ms to 1000ms of the turn starting

### Requirement 5: Hard AI Behavior

**User Story:** As an advanced player, I want to play against a Hard AI, so that I can challenge my mastery of the game.

#### Acceptance Criteria

1. WHEN it is the Hard AI's turn, THE Game_Server SHALL evaluate all valid moves using an advanced scoring algorithm
2. THE Game_Server SHALL calculate Chain_Potential for each possible move by simulating explosion cascades
3. THE Game_Server SHALL assign highest priority to Offensive_Moves that trigger immediate chain reactions capturing 3 or more opponent cells
4. THE Game_Server SHALL assign high priority to Defensive_Moves that block opponent Critical_Cells adjacent to AI-owned cells
5. THE Game_Server SHALL assign medium priority to moves that increase AI atom count on Critical_Cells
6. THE Game_Server SHALL assign low priority to moves on empty cells with no strategic value
7. THE Game_Server SHALL select the move with the highest combined score
8. IF multiple moves have equal highest scores, THEN THE Game_Server SHALL randomly select one of them
9. THE Game_Server SHALL execute the selected move within 400ms to 800ms of the turn starting

### Requirement 6: AI Move Execution

**User Story:** As a player, I want AI moves to execute automatically, so that the game flows naturally without manual intervention.

#### Acceptance Criteria

1. WHEN the game state indicates it is an AI_Opponent's turn, THE Game_Server SHALL automatically trigger AI move calculation
2. THE Game_Server SHALL apply the configured delay based on difficulty level before executing the move
3. WHEN the AI move is executed, THE Game_Server SHALL emit the same gameStateUpdate event used for human player moves
4. THE Game_Client SHALL animate AI moves identically to human player moves
5. THE Game_Server SHALL advance the turn to the human player after AI move animation completes

### Requirement 7: Solo Game Flow Integration

**User Story:** As a player, I want solo mode to integrate seamlessly with existing game screens, so that the experience feels consistent.

#### Acceptance Criteria

1. WHEN a solo game starts, THE Game_Client SHALL display the game screen with the same layout as multiplayer mode
2. THE Game_Client SHALL display the human player and AI_Opponent in the score bar with their respective colors
3. THE Game_Client SHALL display "AI (Easy)", "AI (Medium)", or "AI (Hard)" as the AI_Opponent name based on difficulty
4. WHEN the game ends, THE Game_Client SHALL display the winner modal with the same format as multiplayer
5. THE Game_Client SHALL display "PLAY AGAIN" instead of "REMATCH" in the winner modal for solo games
6. WHEN the player clicks "PLAY AGAIN", THE Game_Client SHALL return to the Solo_Lobby with the same difficulty selected
7. WHEN the player clicks "EXIT", THE Game_Client SHALL return to the Main_Menu

### Requirement 8: Solo Room Management

**User Story:** As a developer, I want solo games to use isolated room state, so that they don't interfere with multiplayer games.

#### Acceptance Criteria

1. WHEN a solo game is created, THE Game_Server SHALL generate a unique room code with prefix "SOLO-"
2. THE Game_Server SHALL store solo game state in the same rooms data structure as multiplayer games
3. THE Game_Server SHALL mark the room with a "solo: true" flag to distinguish it from multiplayer rooms
4. WHEN a player disconnects from a solo game, THE Game_Server SHALL immediately delete the room
5. THE Game_Server SHALL NOT allow other players to join a room marked as solo

### Requirement 9: AI Decision Algorithm Correctness

**User Story:** As a developer, I want AI move selection to be deterministic given the same game state, so that behavior is testable and debuggable.

#### Acceptance Criteria

1. FOR ALL difficulty levels, WHEN the same game state is evaluated twice with the same random seed, THE Game_Server SHALL produce identical move scores
2. FOR ALL difficulty levels, THE Game_Server SHALL only select moves that are valid according to game rules
3. FOR ALL AI moves, THE Game_Server SHALL validate that the selected cell is either empty or owned by the AI_Opponent
4. WHEN no valid moves exist for an AI_Opponent, THE Game_Server SHALL log an error and end the game
5. FOR ALL Medium and Hard AI evaluations, THE Game_Server SHALL complete move scoring within 100ms to prevent game lag

### Requirement 10: UI Responsiveness During AI Turns

**User Story:** As a player, I want the UI to remain responsive during AI turns, so that I can see game state and animations clearly.

#### Acceptance Criteria

1. WHEN it is the AI_Opponent's turn, THE Game_Client SHALL display the turn indicator with the AI name and color
2. THE Game_Client SHALL disable click handling on the game grid during AI turns
3. WHEN the AI move is executed, THE Game_Client SHALL animate the placement and explosions identically to human moves
4. THE Game_Client SHALL re-enable click handling when the turn advances back to the human player
5. WHEN the player clicks the grid during an AI turn, THE Game_Client SHALL display a toast message "It's AI's turn"

### Requirement 11: Solo Mode Accessibility

**User Story:** As a player, I want to access solo mode without requiring network connectivity, so that I can practice offline.

#### Acceptance Criteria

1. WHEN the Game_Server is running locally, THE Game_Client SHALL allow solo mode to function without internet access
2. THE Game_Server SHALL process all AI moves server-side to maintain the server-authoritative architecture
3. THE Game_Client SHALL display appropriate error messages if the server connection is lost during a solo game
4. WHEN server connection is restored, THE Game_Client SHALL allow the player to return to the Main_Menu

### Requirement 12: AI Color Assignment

**User Story:** As a player, I want the AI opponent to have a distinct color, so that I can easily distinguish my atoms from AI atoms.

#### Acceptance Criteria

1. WHEN a solo game is created, THE Game_Server SHALL assign the AI_Opponent a color different from the human player's color
2. THE Game_Server SHALL select AI color from the available colors: red, blue, green, yellow, purple, orange
3. THE Game_Server SHALL prioritize blue for AI if the human player did not select blue
4. IF the human player selected blue, THEN THE Game_Server SHALL assign red to the AI_Opponent
5. THE Game_Client SHALL display AI atoms using the assigned color throughout the game

