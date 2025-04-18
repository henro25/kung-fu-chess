# kung-fu-chess
Kung-Fu Chess is a real-time, multiplayer chess variant where players can move pieces at any time, with a cooldown period after each move. This project implements a distributed client-server application using gRPC for low-latency communication, React for the frontend, and Node.js with SQLite for the backend.

## Prerequisites
- Node.js (>= 18.x)
- npm (>= 9.x)
- SQLite

## Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/kungfu-chess.git
   cd kungfu-chess
   ```
2. Install server dependencies:
   ```bash
   cd server
   npm install
   ```
3. Install client dependencies:
   ```bash
   cd ../client
   npm install
   ```
4. Compile gRPC proto files:
   ```bash
   npm run proto:generate
   ```
5. Set up environment variables:
   - Create a `.env` file in `server/` with:
     ```
     PORT=50051
     DB_PATH=./kungfu_chess.db
     ```

## Running the Application
1. Start the server:
   ```bash
   cd server
   npm start
   ```
2. Start two client instances (in separate terminals):
   ```bash
   cd client
   npm start
   ```
3. Open `http://localhost:3000` in two browser windows to simulate two players.

## Game Flow
- **Start Screen**: Waits for another player to join.
- **Game Screen**: Displays the chessboard for real-time play.
- **End Screen**: Shows the game result.

## Testing
Run tests with:
```bash
cd server
npm test
cd ../client
npm test
```

## Documentation
See `docs/engineering_notebook.md` for architecture, game rules, and synchronization details.

## Contributing
Please read the engineering notebook for design decisions before contributing.