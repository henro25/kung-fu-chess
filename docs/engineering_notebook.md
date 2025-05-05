# Kung-Fu Chess Engineering Notebook

## High-Level Plan
The goal is to build a real-time, multiplayer Kung-Fu Chess game as a client-server application. The server synchronizes game state across a 5-node Raft cluster, ensuring consistency and leader election, while the frontend provides an intuitive UI for gameplay.

### Initial Objectives
- Implement a functional MVP with start, game, and end screens.
- Use gRPC for client-server communication.
- Ensure synchronization of game state across clients.
- Store game data persistently using SQLite.
- Design for future scalability (2-fault tolerance).
- Include unit and integration tests.

## High-level Architecture
1. **Cluster Bootstrap**: start_cluster.js launches a 5-node Raft cluster and REST API servers.
   - Uses Node's `child_process.spawn` to fork each node with environment variables:
     - `NODE_ID`: HTTP API URL for leader identification and redirects.
     - `PEERS`: comma-separated raft RPC endpoints (`localhost:9000–9004`).
     - `RAFT_PORT` & `PORT`: ports for Raft RPC server and HTTP API.
     - `DB_PATH`: path to the node's SQLite database file (e.g., `kungfu-node1.db`).
   - Inherits stdio streams for unified logging across all nodes.
   - Each child process bootstraps two servers:
     - **Raft RPC Server** (Express on `RAFT_PORT`): `/ping`, `/request_vote`, `/append_entries`.
     - **HTTP API Server** (Express on `PORT`): `/api/join`, `/api/move`, etc.
2. **Raft Consensus Layer**: raft.js implements leader election, log replication, and command application.
   - **Storage Initialization** (`_initStorage()`):
     - Creates `raft_state` and `raft_log` tables if absent.
     - Loads `currentTerm`, `votedFor`, replays existing log entries into memory (`this.log`).
     - Initializes per-peer indices: `nextIndex[peer] = log.length + 1`, `matchIndex[peer] = 0`.
     - Configures SQLite with `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` for concurrency.
   - **RPC Server Setup** (`_startRPCServer`): listens on `RAFT_PORT`:
     - `GET /ping`: liveness check.
     - `POST /request_vote`: election vote requests (term, candidateId, lastLogIndex/Term).
     - `POST /append_entries`: heartbeats & log entries replication with prevLogIndex/Term validation.
   - **Election & Heartbeats**:
     - Followers call `_resetElectionTimer()` on valid AppendEntries/vote; timeouts randomized 1000–2000 ms.
     - Leaders send heartbeats (`_sendHeartbeat()`) every 100 ms.
     - `_startElection()` transitions follower→candidate: increments term, votes self, sends `request_vote` RPCs.
   - **Propose & Replication** (`propose(command)`):
     - Appends entry to disk (`INSERT INTO raft_log`) and in-memory log.
     - Single-node fast path: commit & apply immediately.
     - Multi-node: replicates to each peer, back-off on mismatches by decrementing `nextIndex[peer]`, retries until `success=true`.
     - Once majority acks, updates `commitIndex` and invokes `_applyEntry(entry)`.
3. **HTTP/REST API**: server.js exposes Express endpoints for client interactions, redirecting non-leaders to the current leader.
   - **Middleware**: `cors({ origin: '*' })`, `bodyParser.json()`.
   - **Leader Redirection**: `extractLeader(err)` helper parses `Not leader <URL>`:
     ```js
     function extractLeader(err) {
       const prefix = 'Not leader ';
       return err.message.startsWith(prefix)
         ? err.message.slice(prefix.length).trim()
         : null;
     }
     ```
   - Catch Raft propose errors and respond with HTTP 307 + `Location: <leaderUrl> + req.originalUrl`.
   - Log incoming requests and responses with `[NODE_ID]` prefix for debugging.
4. **Game Logic**: gameLogic.js defines board state, move validation (including Kung-Fu Chess cooldown rules), and state mutations.
   - **State Initialization** (`initState(mode)`):
     - `cfg = mode==='lightning'? {speed:5, cooldown:200} : {speed:1, cooldown:2000}`.
     - Initializes `board` via `initBoard()`, sets `players = []`, `lobby` defaults (`playerSettings`, `ready`).
   - **Coordinate Helpers**:
     - `parsePos(pos)`: algebraic → `{c,r}`.
     - `encodePos(c,r)`: `{c,r}` → algebraic.
     - `buildPath(from,to)`: list of intermediate squares for sliding pieces.
     - `clearPath(board,from,to)`: checks emptiness along `buildPath`.
   - **Move Validation** (`validateBasic(from,to,st,color)`):
     - Verifies piece ownership and target occupancy.
     - Enforces movement rules for each piece type, including special cases:
       - Pawn double-step, en passant capture.
       - Castling rights and path clearance.
     - Checks cooldown: `Date.now() >= (st.cooldowns[from]||0)`.
   - **Command Handlers**:
     - `joinOrCreate`: new game or join existing, persists JSON state; catches `SQLITE_CONSTRAINT` to retry joins.
     - `makeMove`: applies captures, promotions, castling, updates `cooldowns[to]`, persists state.
     - `updateLobby` & `setReady`: update `lobby` and toggle `status` to `'ongoing'` when both ready.
5. **Persistence**: Each node uses SQLite to store Raft state and game state for crash recovery.
   - **Raft Storage**:
     - `raft_state(key,value)` for `currentTerm` and `votedFor`.
     - `raft_log(idx AUTOINCREMENT, term, command TEXT)`.
   - **Game Storage** (`games` table):
     ```sql
     CREATE TABLE IF NOT EXISTS games (
       id TEXT PRIMARY KEY,
       player1_id TEXT,
       player2_id TEXT,
       state TEXT
     );
     ```
   - **PRAGMAs**:
     - `journal_mode=WAL` for better concurrency.
     - `busy_timeout=5000` ms to avoid `SQLITE_BUSY`.
6. **gRPC Stub**: gameService.js outlines RPC definitions for a future gRPC-based client.
   - `JoinGame` & `MakeMove`: wrap `joinOrCreate` and `makeMove` logic.
   - `StreamGameState`: stubbed to immediately `call.end()`; actual client uses REST polling.

## Game Specification
- Standard 8×8 chessboard with traditional initial piece setup (white on ranks 1–2, black on 7–8).
- Real-time, Kung-Fu Chess variant: no alternating turns—each player may move any of their available pieces at any time, subject to cooldown.
- After a move, the moved piece enters a cooldown period (`cfg.cooldown` ms) during which it cannot move again. Cooldowns are visualized as a red bar overlay on the square.
- Standard chess rules apply for movement, captures, en passant, castling, and pawn promotion, with server-side validation ensuring legality and no collisions.
- Win occurs when one player captures the opponent's king (immediate end), rather than full checkmate search.
- Server serializes concurrent move requests via Raft commit order to resolve conflicts and maintain consistency across nodes.

## Low-Level Plan
1. **Backend**:
   - Define gRPC service in `protos/game.proto` (currently stubbed; actual calls use REST).
   - Implement game logic in `server/src/gameLogic.js`, including:
     - `initState(mode)` sets up `board`, `players`, `cooldowns`, `lobby` with default `cfg` (`mode==='lightning'?{cooldown:200}: {cooldown:2000}`).
     - Helper functions (`parsePos`, `encodePos`, `buildPath`, `clearPath`) for coordinate conversion and path clearance.
     - Move validation in `validateBasic(from,to,state,color)`, enforcing chess rules, castling rights, en passant, and cooldown timestamps.
     - State mutations in `makeMove`, `updateLobby`, `setReady`, persisting JSON to SQLite.
     - `applyCreateOrJoin` catches `SQLITE_CONSTRAINT` to retry concurrent joins.
   - Set up SQLite for storing Raft metadata (`raft_state`, `raft_log`) and game states (`games` table), with WAL mode and a 5-second busy timeout.
   - Create gRPC service in `server/src/services/gameService.js` (facade over gameLogic), but clients currently bypass it in favor of REST.
   - Pivot rationale: we initially scaffolded gRPC stubs, but found REST + polling much faster to prototype in the browser (avoiding gRPC-Web build/CORS complexities).
2. **Frontend**:
   - Build React components (`StartScreen`, `LobbyScreen`, `GameScreen`, `EndScreen`) in `client/src/components/`.
   - Game flow: Start → Waiting → Lobby → Game → End, managed by `App.jsx`'s `screen` state.
   - Use `react-konva` for chessboard rendering and piece drag/drop in `Chessboard.jsx`:
     - On drag end, convert pixel coords to board pos via `encodePos`, call `onMove`, and snap back on failure (`e.target.position({x,y})`).
     - Render cooldown bar overlay based on `cfg.cooldown` and `cooldowns[pos] - Date.now()`.
   - Implement HTTP polling via `getGameState(gameId)` every 300 ms in `App.jsx`, transitioning screens when:
     - Two players have joined → `waiting` → `lobby`.
     - Both ready → `lobby` → `game`.
     - `status==='ended'` → `end`, then stop polling.
   - Use `raftFetch(path,options)` in `api.js`:
     - Maintains `URLS` list (from `REACT_APP_API_URLS` or default localhost).
     - Cycles through peers on error, follows `resp.redirected` to update leader URL, retries all peers before failing.
3. **Testing**:
   - Unit tests in `tests/server/gameLogic.test.js` for move rules, cooldowns, promotions, and king capture.
   - Service tests in `tests/server/gameService.test.js` (skeleton; gRPC tests deferred).
   - Empty integration harness in `tests/integration/` for future end-to-end scenarios.
4. **Deployment**:
   - Run server on `localhost:50051`.
   - Run clients on `localhost:3000`.

## Raft Consensus Implementation (raft.js)
- **Propose & Commit**:
  - Each command is serialized as JSON in `raft_log(term, command)`; on restart, log is replayed to restore state.
  - Election timeout randomized between 1000–2000 ms; leader heartbeats every 100 ms.
  - **Initialization** (`_initStorage()`):
    - Creates `raft_state` and `raft_log` tables if missing.
    - Loads `currentTerm`, `votedFor`, and all log entries into in-memory arrays.
    - Initializes per-peer indices: `nextIndex[peer] = log.length + 1`, `matchIndex[peer] = 0`.
    - Configures SQLite with `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` for concurrency.
  - **Connectivity Test** (`_testConnections()`): pings each peer's `/ping` endpoint at startup to verify network reachability.
  - **Persistent State** stored in `raft_state(key, value)` for `currentTerm` and `votedFor`.

## HTTP/REST API Layer
- **Express Routes**:
  - `POST /api/join`: leader `propose({type:'createOrJoinGame', args})` → commit via Raft.
  - Middleware setup in `server.js`:
    - `cors({ origin: '*' })` to allow cross-origin clients.
    - `bodyParser.json()` for JSON payload parsing.
  - Logging: each route logs incoming requests with `[NODE_ID]` prefix for debugging.
  - **Leader Redirect** uses `extractLeader(err)`:
    ```js
    function extractLeader(err) {
      const prefix = 'Not leader ';
      return err.message.startsWith(prefix)
        ? err.message.slice(prefix.length).trim()
        : null;
    }
    ```
    Followers respond with HTTP 307 and `Location` header to the leader's URL.
  - **Error Codes**: 307 for leader redirect, 400 for client errors (invalid game or move), 500 for server errors.
  - **Server Tick Loop**: a `setInterval` (300 ms) queries all games, calls stubbed `tick(state)`, and persists updates to support future timed events.

## Game Logic Details
- **State Initialization** (`initState(mode)`):
  - `mode==='lightning' ? cfg={speed:5,cooldown:200} : cfg={speed:1,cooldown:2000}`
  - `cooldowns={}`, `enPassant=null`, `castlingRights` flags, `lobby` defaults.

- **Helpers**:
  - `parsePos('e2') → {c:4,r:1}` and `encodePos(c,r) → 'e2'`.
  - `buildPath(from,to)`: array of intermediate squares for sliding pieces.
  - `clearPath(board,from,to)`: ensures no blocking pieces.

- **validateBasic**:
  - Checks piece ownership, destination occupancy, move shape per piece, path clearance, and cooldown timer.
  - Special logic for pawns (double-step, en passant), knights, bishops, rooks, queens, and kings (castling rights, path emptiness).

- **Command Handlers**:
  - `joinOrCreate(db,playerId,gameId,mode)`: INSERT or SELECT game state, push `playerId`, set `Player 1/2` names.
  - `makeMove(db,playerId,gameId,from,to)`: loads state, calls `validateBasic`, applies captures/promotions/castling, updates `cooldowns[to]`, saves back.
  - `updateLobby` & `setReady`: adjust `lobby.playerSettings` and `lobby.ready`, flip `status` to `'ongoing'` when both ready.

## Implementation Notes
- **SQLite Schema**:
  ```sql
  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    player1_id TEXT,
    player2_id TEXT,
    state TEXT
  );
  ```
- **SQLite PRAGMAs**:
  - `PRAGMA journal_mode=WAL;` enabled in Raft for safe concurrent read/write.
  - `PRAGMA busy_timeout=5000;` avoids SQLITE_BUSY under contention.
- **Join/Create Race**:
  - In `applyCreateOrJoin`, on `SQLITE_CONSTRAINT`, catching the error triggers a `SELECT` to join a concurrently-created game.

- **Game Logic Helpers**:
  - `parsePos/encodePos` convert algebraic positions ↔ numeric coords.
  - `buildPath` & `clearPath` validate sliding-piece paths.
  - `validateBasic` enforces turn, capture rules, castling rights, en passant, and cooldown checks.
- **Storage Choice**: SQLite was chosen for its thread-safety, easy embedding, ACID guarantees, and familiarity from class exercises (no external DB server needed).

- **Frontend React Details**:
  - `Chessboard.jsx` uses `dragBoundFunc` to clamp piece drags within board boundaries.
  - Piece `Image` opacity is set to 0.3 while cooling down, with a red cooldown bar overlay.
  - On invalid move (`result.success===false`), `handleDragEnd` snaps piece back via `e.target.position({ x, y })`.

- **Tick Function**:
  - In `server/src/gameLogic.js`, `tick(_state)` is currently a no-op stub reserved for future timed state updates (e.g., auto expire en passant).

## Key Difficulties & Bug Fixes
- **Raft election timer reset**: missing timer resets on valid AppendEntries led to split-brain elections; fixed by calling `_resetElectionTimer()` in `append_entries` handler.
- **Log replication mismatches**: incorrect `prevLogTerm` comparisons caused infinite back-off; we added a safety decrement for `nextIndex` and capped retries.
- **Term persistence race**: updating `currentTerm` in-memory before persisting led to stale elections; we now persist synchronously via `INSERT OR REPLACE` before RPCs.
- **Join/create race condition**: simultaneous create and join could violate primary key; `applyCreateOrJoin` catches `SQLITE_CONSTRAINT` and retries via `SELECT`.
- **UI snap-back**: dragging a piece to an invalid square left it out of place; `handleDragEnd` now resets sprite position on `result.success===false`.
- **gRPC-Web integration complexity**: we deferred full gRPC-Web streaming due to build and CORS issues on the client, preferring REST polling for MVP.

## Future Work
- Implement full `tick()` logic for cooldown expiration and other timed effects.
- Add AI opponents and more robust end-to-end testing.

## Design Fair & Community Feedback
- We showcased Kung-Fu Chess at the SEAS Design Fair, where many students and faculty played and enjoyed our game's real-time mechanics and cooldown rules.
- Hearing enthusiastic feedback and seeing people immersed in our variant was the most fulfilling part of the project.

## What I Learned
- **Server–Client Protocol**: I gained hands‐on experience designing a browser‐friendly HTTP/REST protocol, building a `raftFetch` wrapper that cycles peers, follows HTTP 307 redirects to the current leader, and retries on failures.
- **Game State Sharing**: I learned how to persist and share authoritative game state via SQLite JSON blobs, and coordinate client updates through simple polling (300 ms intervals) instead of pushing, ensuring every client sees a consistent view regardless of node failover.
- **Raft Implementation**: Implementing Raft end‐to‐end deepened my understanding of leader election timeouts, log replication with back‐off on mismatches, commit indices, and state persistence via WAL‐mode SQLite tables, as well as applying entries atomically with `applyCreateOrJoin`, `makeMove`, and friends.
- **Kung-Fu Chess Side-Step Strategy**: On the gameplay side, I discovered a fun "side-step" tactic—when an opponent attacks your piece, you sidestep with a head start and then instantly recapture the attacker if your timing is right. It adds an extra layer of real-time dynamism to classic chess.