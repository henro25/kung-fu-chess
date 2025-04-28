// server/src/start_cluster.js
const { spawn } = require('child_process');
const path = require('path');

const N = 5;
const BASE_RAFT_PORT = 9000;
const BASE_HTTP_PORT = 8000;
const HOST = process.env.HOST_IP || '10.250.121.33';
// Raft RPC peer list (host:raftPort)
const peers = Array.from({ length: N }, (_, i) => `localhost:${BASE_RAFT_PORT + i}`).join(',');

for (let i = 1; i <= N; i++) {
  const raftPort = BASE_RAFT_PORT + (i - 1);
  const apiPort  = BASE_HTTP_PORT  + (i - 1);
  const dbFile = `./kungfu-node${i}.db`;
  const NODE_ID = `http://${HOST}:${apiPort}`;

  console.log(`Starting ${NODE_ID} (RAFT_PORT=${raftPort}, API_PORT=${apiPort})`);

  const env = {
    ...process.env,
    NODE_ID:   NODE_ID,   // used by RaftNode for leaderId and redirects
    PEERS:     peers,     // Raft RPC addresses list
    RAFT_PORT: `${raftPort}`,
    PORT:      `${apiPort}`,
    DB_PATH:   dbFile,    
  };

  const child = spawn('node', [ path.join(__dirname, 'server.js') ], {
    env,
    stdio: ['ignore', 'inherit', 'inherit']
  });
  child.on('exit', code => console.log(`${NODE_ID} exited with code ${code}`));
}

console.log(`Launched ${N} nodes (HTTP ports 8000–${BASE_HTTP_PORT + N - 1}, Raft ports ${BASE_RAFT_PORT}–${BASE_RAFT_PORT + N - 1})`);