// server/src/raft.js
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const EventEmitter = require('events');
const express = require('express');
const { applyCreateOrJoin, makeMove, updateLobby, setReady } = require('./gameLogic');

class RaftNode extends EventEmitter {
  /**
   * @param {{ id: string, peers: string[], dbPath: string, raftPort: number }} opts
   */
  constructor({ id, peers, dbPath, raftPort }) {
    super();
    this.id = id;
    // this.peers = peers;
    this.peers = peers.filter(p => !p.endsWith(`:${raftPort}`));
    this.dbPath = dbPath;
    this.raftPort = raftPort;

    // Persistent Raft state
    this.currentTerm = 0;
    this.votedFor = null;
    this.log = [];

    // Volatile Raft state
    this.commitIndex = 0;
    this.lastApplied = 0;
    this.nextIndex = {};
    this.matchIndex = {};
    this.state = 'follower';
    this.leaderId = null;

    // Open SQLite with FULLMUTEX, WAL, busy timeout
    this.db = new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX,
      err => {
        if (err) {
          console.error(`[${this.id}] SQLite error opening DB:`, err);
          return;
        }
        // Busy timeout
        this.db.configure('busyTimeout', 10000);
        this.db.serialize(() => {
          this.db.run('PRAGMA journal_mode=WAL');
          this.db.run('PRAGMA synchronous=NORMAL');
          this._initStorage();
        });
      }
    );

    // Handle SQLite errors
    this.db.on('error', err => console.error(`[${this.id}] SQLite error:`, err));

    // Launch RPC server
    this._startRPCServer(raftPort);

    // Kick off election timer and test connections
    setTimeout(() => {
      this._resetElectionTimer();
      this._testConnections();
    }, 100);
  }

  _initStorage() {
    this.db.run(`CREATE TABLE IF NOT EXISTS raft_state(key TEXT PRIMARY KEY, value TEXT)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS raft_log(idx INTEGER PRIMARY KEY AUTOINCREMENT, term INTEGER, command TEXT)`, () => {
      // Load persisted state
      this.db.get(`SELECT value FROM raft_state WHERE key='currentTerm'`, (e, row) => {
        if (row) this.currentTerm = +row.value;
        this.db.get(`SELECT value FROM raft_state WHERE key='votedFor'`, (e2, row2) => {
          if (row2) this.votedFor = row2.value;
          this.db.all(`SELECT term, command FROM raft_log ORDER BY idx`, (e3, rows) => {
            rows.forEach(r => this.log.push({ term: r.term, command: JSON.parse(r.command) }));
          });
        });
      });
    });
  }

  _persistState() {
    this.db.run(`INSERT OR REPLACE INTO raft_state(key,value) VALUES('currentTerm',?)`, [String(this.currentTerm)]);
    this.db.run(`INSERT OR REPLACE INTO raft_state(key,value) VALUES('votedFor',?)`, [this.votedFor || '']);
  }

  _resetElectionTimer() {
    clearTimeout(this.electionTimer);
    if (this.state !== 'follower') return;
    const timeout = 150 + Math.random() * 150;
    this.electionTimer = setTimeout(() => this._startElection(), timeout);
  }

  async _testConnections() {
    console.log(`[${this.id}] Testing peer connections:`, this.peers);
    for (const peer of this.peers) {
      try {
        const res = await fetch(`http://${peer}/ping`, { timeout: 500 });
        if (res.ok) console.log(`[${this.id}] Peer ${peer} reachable`);
      } catch (err) {
        console.warn(`[${this.id}] Peer ${peer} unreachable: ${err.message}`);
      }
    }
  }

  _startElection() {
    if (this.state !== 'follower') return;
    this.state = 'candidate';
    this.currentTerm++;
    this.votedFor = this.id;
    this._persistState();
    console.log(`[${this.id}] Starting election for term ${this.currentTerm}`);

    let votes = 1;
    const needed = Math.floor((this.peers.length + 1) / 2) + 1;
    const lastIdx = this.log.length;
    const lastTerm = this.log[lastIdx - 1]?.term || 0;

    this.peers.forEach(peer => {
      fetch(`http://${peer}/request_vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 500,
        body: JSON.stringify({
          term: this.currentTerm,
          candidateId: this.id,
          lastLogIndex: lastIdx,
          lastLogTerm: lastTerm
        })
      })
      .then(r => r.json())
      .then(res => {
        console.log(`[${this.id}] Vote response from ${peer}:`, res);
        if (res.term > this.currentTerm) return this._becomeFollower(res.term);
        if (res.voteGranted) votes++;
        if (votes >= needed && this.state === 'candidate') this._becomeLeader();
      })
      .catch(() => {});
    });

    this._resetElectionTimer();
  }

  _becomeFollower(term) {
    console.log(`[${this.id}] Becoming follower for term ${term}`);
    this.state = 'follower';
    this.currentTerm = term;
    this.votedFor = null;
    this._persistState();
    clearInterval(this.heartbeatTimer);
    this._resetElectionTimer();
  }

  _becomeLeader() {
    console.log(`[${this.id}] Won election; becoming leader for term ${this.currentTerm}`);
    this.state = 'leader';
    this.leaderId = this.id;
    clearTimeout(this.electionTimer);

    const startIdx = this.log.length + 1;
    this.peers.forEach(p => { this.nextIndex[p] = startIdx; this.matchIndex[p] = 0; });

    this._sendHeartbeats();
    this.heartbeatTimer = setInterval(() => this._sendHeartbeats(), 50);
  }

  _sendHeartbeats() {
    this.peers.forEach(peer => this._sendAppendEntries(peer, []));
  }

  _sendAppendEntries(peer, entries) {
    const prevIdx = this.nextIndex[peer] - 1;
    const prevTerm = this.log[prevIdx - 1]?.term || 0;
    const body = {
      term: this.currentTerm,
      leaderId: this.id,
      prevLogIndex: prevIdx,
      prevLogTerm: prevTerm,
      entries,
      leaderCommit: this.commitIndex
    };

    fetch(`http://${peer}/append_entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      timeout: 200, body: JSON.stringify(body)
    })
    .then(r => r.json())
    .then(res => {
      if (res.term > this.currentTerm) return this._becomeFollower(res.term);
      if (res.success) {
        const newMatch = prevIdx + entries.length;
        this.matchIndex[peer] = newMatch;
        this.nextIndex[peer] = newMatch + 1;
        this._updateCommitIndex();
      } else {
        this.nextIndex[peer] = Math.max(1, this.nextIndex[peer] - 1);
        const retry = this.log.slice(this.nextIndex[peer] - 1).map(e => ({ term: e.term, command: e.command }));
        this._sendAppendEntries(peer, retry);
      }
    })
    .catch(() => {});
  }

  _updateCommitIndex() {
    const matchArr = Object.values(this.matchIndex).concat(this.log.length);
    matchArr.sort((a, b) => b - a);
    const N = matchArr[Math.floor(this.peers.length / 2)];
    if (N > this.commitIndex && this.log[N - 1].term === this.currentTerm) {
      this.commitIndex = N;
      this._applyEntriesUpTo(N);
    }
  }

  _applyEntriesUpTo(N) {
    while (this.lastApplied < N) {
      const entry = this.log[this.lastApplied++];
      const { type, args } = entry.command;
      let p;
      switch (type) {
        case 'createOrJoinGame': p = applyCreateOrJoin(this.db, args.playerId, args.gameId, args.mode); break;
        case 'move':            p = makeMove(this.db, args.playerId, args.gameId, args.from, args.to); break;
        case 'lobby':           p = updateLobby(this.db, args.playerId, args.gameId, args.settings); break;
        case 'ready':           p = setReady(this.db, args.playerId, args.gameId, args.ready); break;
      }
      if (p) p.catch(() => {});
    }
  }

  propose({ type, args }) {
    if (this.state !== 'leader') {
      return Promise.reject(new Error(`Not leader ${this.leaderId}`));
    }
    return new Promise((resolve, reject) => {
      const term = this.currentTerm;
      const cmdObj = { type, args };
      const cmdStr = JSON.stringify(cmdObj);
      this.db.run(`INSERT INTO raft_log(term,command) VALUES(?,?)`, [term, cmdStr], err => {
        if (err) return reject(err);
        this.log.push({ term, command: cmdObj });
        this.matchIndex[this.id] = this.log.length;
        this.nextIndex[this.id] = this.log.length + 1;
        const needed = Math.floor((this.peers.length + 1) / 2) + 1;
        let acks = 1;
        this.peers.forEach(p => this._sendAppendEntries(p, [{ term, command: cmdObj }]));
        const check = setInterval(() => {
          if (acks++ >= needed) {
            clearInterval(check);
            resolve({ gameId: args.gameId || null, success: true });
          }
        }, 10);
      });
    });
  }

  _startRPCServer(port) {
    const app = express();
    app.use(express.json());
    app.get('/ping', (req, res) => res.send('pong'));
    app.post('/request_vote', (req, res) => this._onRequestVote(req, res));
    app.post('/append_entries', (req, res) => this._onAppendEntries(req, res));
    app.listen(port, () => console.log(`[${this.id}] RPC on ${port}`));
  }

  _onRequestVote(req, res) {
    const { term, candidateId, lastLogIndex, lastLogTerm } = req.body;
    if (term > this.currentTerm) this._becomeFollower(term);
    const myLastIdx = this.log.length;
    const myLastTerm = this.log[myLastIdx - 1]?.term || 0;
    let voteGranted = false;
    if (
      term === this.currentTerm &&
      (!this.votedFor || this.votedFor === candidateId) &&
      (lastLogTerm > myLastTerm || (lastLogTerm === myLastTerm && lastLogIndex >= myLastIdx))
    ) {
      voteGranted = true;
      this.votedFor = candidateId;
      this._persistState();
      this._resetElectionTimer();
    }
    res.json({ term: this.currentTerm, voteGranted });
  }

  _onAppendEntries(req, res) {
    const { term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommit } = req.body;
    if (term > this.currentTerm) this._becomeFollower(term);
    if (term === this.currentTerm) {
      this.state = 'follower';
      this.leaderId = leaderId;
      this._resetElectionTimer();
    }
    let success = false;
    if ((prevLogIndex === 0 || this.log[prevLogIndex - 1]?.term === prevLogTerm) && term === this.currentTerm) {
      success = true;
      this.db.serialize(() => {
        this.log.splice(prevLogIndex);
        entries.forEach(e => {
          this.db.run(`INSERT INTO raft_log(term,command) VALUES(?,?)`, [e.term, JSON.stringify(e.command)]);
          this.log.push(e);
        });
        if (leaderCommit > this.commitIndex) {
          this.commitIndex = Math.min(leaderCommit, this.log.length);
          this._applyEntriesUpTo(this.commitIndex);
        }
      });
    }
    res.json({ term: this.currentTerm, success });
  }
}

module.exports = RaftNode;
