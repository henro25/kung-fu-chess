# Kung-Fu Chess Engineering Notebook

## High-Level Plan
The goal is to build a real-time, multiplayer Kung-Fu Chess game as a client-server application. The server synchronizes game state between two clients, ensuring low latency and consistency. The frontend provides an intuitive UI for gameplay.

### Objectives
- Implement a functional MVP with start, game, and end screens.
- Use gRPC for client-server communication.
- Ensure synchronization of game state across clients.
- Store game data persistently using SQLite.
- Design for future scalability (2-fault tolerance).
- Include unit and integration tests.

## Low-Level Plan
1. **Backend**:
   - Define gRPC service in `protos/game.proto`.
   - Implement game logic in `server/src/gameLogic.js`.
   - Set up SQLite for storing game states and player data.
   - Create gRPC service in `server/src/services/gameService.js` to handle moves, joins, and game state updates.
2. **Frontend**:
   - Build React components for start, game, and end screens.
   - Use Konva.js for chessboard rendering and piece movement.
   - Integrate gRPC-Web for client-server communication.
3. **Testing**:
   - Unit tests for game logic and gRPC services.
   - Integration tests for end-to-end game flow.
4. **Deployment**:
   - Run server on `localhost:50051`.
   - Run clients on `localhost:3000`.

## Architecture Details
- **Client-Server Model**:
  - **Server**: Node.js with gRPC, handling game state, move validation, and synchronization.
  - **Client**: React with gRPC-Web, rendering the UI and sending moves to the server.
- **Database**: SQLite stores game states (board position, piece cooldowns, player info).
- **Communication**: gRPC for bidirectional streaming to push real-time updates.

### Communication Specification
- **gRPC Proto**:
  ```proto
  service GameService {
    rpc JoinGame(JoinRequest) returns (JoinResponse);
    rpc MakeMove(MoveRequest) returns (MoveResponse);
    rpc StreamGameState(StreamRequest) returns (stream GameState);
  }
  ```
- **Messages**:
  - `JoinRequest`: Player ID, game ID.
  - `JoinResponse`: Success status, game ID.
  - `MoveRequest`: Player ID, piece, from/to positions.
  - `MoveResponse`: Success status, updated game state.
  - `GameState`: Board state, piece cooldowns, game status.
- **Bidirectional Streaming**: Clients subscribe to `StreamGameState` for real-time updates.

### Game Specification
- **Board**: Standard 8x8 chessboard.
- **Pieces**: Standard chess pieces with identical movement rules.
- **Cooldown**: After a move, a piece is locked for 5 seconds (configurable).
- **Win Conditions**: Checkmate, stalemate, or resignation.
- **Real-Time**: No turns; players move any available piece at any time.

### Game Rules
- Players can move any piece not in cooldown.
- Moves are validated by the server (e.g., legal chess moves, no cooldown violation).
- Check/checkmate is detected and broadcast to clients.
- Cooldowns are tracked per piece and reset after the cooldown period.

### Synchronization
- **Server-Driven**: The server maintains the authoritative game state.
- **Event Broadcasting**: Moves and state changes are broadcast via gRPC streams.
- **Conflict Resolution**: Server validates moves to prevent race conditions (e.g., simultaneous moves on the same piece).
- **Timestamping**: Each move includes a server timestamp to resolve ordering conflicts.

### Message Passing
- **Client to Server**: Send `JoinRequest` or `MoveRequest` via gRPC.
- **Server to Client**: Stream `GameState` updates to both clients.
- **Error Handling**: Server returns error messages for invalid moves or connection issues.

### Server Replicability (2-Fault Tolerant, Future Scope)
- **Design**: Use a Raft consensus algorithm for leader election and state replication.
- **Setup**: Three server nodes; two can fail without losing data.
- **Replication**: Game state and SQLite database updates are replicated across nodes.
- **Failover**: If the leader fails, a new leader is elected.
- **MVP Scope**: Single server; replication to be implemented in future iterations.

### Testing
- **Unit Tests**:
  - Game logic: Validate move legality, cooldown enforcement, checkmate detection.
  - gRPC services: Test join, move, and streaming functionality.
- **Integration Tests**:
  - Simulate two clients joining and playing a game.
  - Verify state synchronization and UI updates.
- **Tools**: Jest for server tests, React Testing Library for client tests.

## Implementation Notes
- **SQLite Schema**:
  ```sql
  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    player1_id TEXT,
    player2_id TEXT,
    state TEXT,
    created_at TIMESTAMP
  );
  CREATE TABLE moves (
    game_id TEXT,
    player_id TEXT,
    piece TEXT,
    from_pos TEXT,
    to_pos TEXT,
    timestamp TIMESTAMP
  );
  ```
- **Cooldown Management**: Server tracks cooldowns in memory, persisted to SQLite for recovery.
- **Latency**: gRPC-Web ensures sub-100ms latency for move propagation.

## Future Work
- Implement server replication for fault tolerance.
- Add AI opponents.
- Enhance UI with animations and sound effects.