// server/raft.js
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const EventEmitter = require('events');
const { joinOrCreate, makeMove, updateLobby, setReady, applyCreateOrJoin } = require('./gameLogic');
const express = require('express');

class RaftNode extends EventEmitter {
  /**
   * @param {{ id: string, peers: string[], dbPath: string, raftPort: number }} opts
   */
  constructor({ id, peers, dbPath, raftPort, gamesDb }) {
    super();
    this.id = id;
    this.peers = peers;
    this.dbPath = dbPath;
    this.raftPort = raftPort;
    this.currentTerm = 0;
    this.votedFor = null;
    this.log = [];
    this.commitIndex = 0;
    this.lastApplied = 0;
    this.nextIndex = {};
    this.matchIndex = {};
    this.state = 'follower';
    this.leaderId = null;
    this.electionTimer = null;
    this.heartbeatTimer = null;
    this.gamesDb = gamesDb;
    
    // Initialize database connection for this node
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        return;
      }
      // Enable WAL mode for better concurrency
      this.db.run('PRAGMA journal_mode=WAL');
      // Set busy timeout to handle concurrent access
      this.db.run('PRAGMA busy_timeout=5000');
      this._initStorage();
    });
    
    this._startRPCServer(raftPort);
    setTimeout(() => {
      this._resetElectionTimer();
      this._testConnections();
    }, 1000);
  }

  _initStorage() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS raft_state (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      this.db.run(`
        CREATE TABLE IF NOT EXISTS raft_log (
          idx INTEGER PRIMARY KEY AUTOINCREMENT,
          term INTEGER,
          command TEXT
        )
      `, () => {
        this.db.get(`SELECT value FROM raft_state WHERE key='currentTerm'`, (e, row) => {
          if (row) this.currentTerm = parseInt(row.value, 10);
          this.db.get(`SELECT value FROM raft_state WHERE key='votedFor'`, (e2, row2) => {
            if (row2) this.votedFor = row2.value;
            this.db.all(`SELECT idx, term, command FROM raft_log ORDER BY idx`, (e3, rows) => {
              if (rows) this.log = rows.map(r => ({ term: r.term, command: JSON.parse(r.command) }));
            });
          });
        });
      });
    });
  }

  _persistState() {
    this.db.run(`INSERT OR REPLACE INTO raft_state(key,value) VALUES('currentTerm',?)`, [String(this.currentTerm)]);
    this.db.run(`INSERT OR REPLACE INTO raft_state(key,value) VALUES('votedFor',?)`, [this.votedFor || '']);
  }

  async _testConnections() {
    console.log(`[${this.id}] Testing connections to peers:`, this.peers);
    for (const peer of this.peers) {
      try {
        const response = await fetch(`http://${peer}/ping`, {
          timeout: 1000
        });
        if (response.ok) {
          console.log(`[${this.id}] Successfully connected to ${peer}`);
        } else {
          console.error(`[${this.id}] Failed to connect to ${peer}: ${response.status}`);
        }
      } catch (err) {
        console.error(`[${this.id}] Error connecting to ${peer}:`, err.message);
      }
    }
  }

  _resetElectionTimer() {
    // Only reset election timer if we're a follower
    if (this.state !== 'follower') {
      return;
    }

    clearTimeout(this.electionTimer);
    // Increase the election timeout to reduce the chance of multiple elections
    const timeout = 1000 + Math.random() * 1000;  // 1000-2000ms
    this.electionTimer = setTimeout(() => {
      if (this.state === 'follower') {
        this._startElection();
      }
    }, timeout);
  }

  _startElection() {
    // Only start election if we're a follower
    if (this.state !== 'follower') {
      console.log(`[${this.id}] Not starting election - not a follower (state: ${this.state})`);
      return;
    }

    this.state = 'candidate';
    console.log(`[${this.id}] Starting election for term ${this.currentTerm + 1}`);
    this.currentTerm++;
    this.votedFor = this.id;
    this._persistState();

    const votesNeeded = Math.floor(this.peers.length / 2) + 1;
    const lastLog = this.log[this.log.length - 1] || { term: 0 };

    // Send vote requests to all peers with timeout
    const votePromises = this.peers.map(peer => {
      console.log(`[${this.id}] Requesting vote from ${peer}`);
      return Promise.race([
        fetch(`http://${peer}/request_vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            term: this.currentTerm,
            candidateId: this.id,
            lastLogIndex: this.log.length,
            lastLogTerm: lastLog.term
          }),
          timeout: 1000
        }).then(r => r.json()),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 1000)
        )
      ])
      .then(res => {
        console.log(`[${this.id}] Received vote response from ${peer}:`, res);
        if (res.term > this.currentTerm) {
          console.log(`[${this.id}] Found higher term, stepping down`);
          this.currentTerm = res.term;
          this.state = 'follower';
          this.votedFor = null;
          this._persistState();
          return false;
        }
        if (this.state !== 'candidate') {
          console.log(`[${this.id}] Not a candidate anymore (state: ${this.state})`);
          return false;
        }
        return res.voteGranted;
      })
      .catch(err => {
        console.error(`[${this.id}] Error requesting vote from ${peer}:`, err.message);
        return false;
      });
    });

    // Wait for all vote requests to complete
    Promise.all(votePromises).then(results => {
      if (this.state !== 'candidate') {
        console.log(`[${this.id}] Not a candidate anymore (state: ${this.state})`);
        return;
      }
      
      const grantedVotes = results.filter(granted => granted).length;
      console.log(`[${this.id}] Received ${grantedVotes} votes out of ${votesNeeded} needed`);
      
      if (grantedVotes >= votesNeeded) {
        console.log(`[${this.id}] Won election with ${grantedVotes} votes`);
        this._becomeLeader();
      } else {
        // If we didn't get enough votes, become a follower
        console.log(`[${this.id}] Lost election, becoming follower`);
        this.state = 'follower';
        this._resetElectionTimer();
      }
    });
  }

  _becomeLeader() {
    console.log(`[${this.id}] Becoming leader for term ${this.currentTerm}`);
    this.state = 'leader';
    this.leaderId = this.id;
    clearTimeout(this.electionTimer);
    
    // Initialize nextIndex and matchIndex for each peer
    this.peers.forEach(peer => {
      this.nextIndex[peer] = this.log.length + 1;
      this.matchIndex[peer] = 0;
    });

    // Start sending heartbeats
    this._sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), 100);
  }

  _sendHeartbeat() {
    if (this.state !== 'leader') return;
    
    const prevLogIndex = this.log.length - 1;
    const prevLogTerm = this.log[prevLogIndex]?.term || 0;
    
    this.peers.forEach(peer => {
      fetch(`http://${peer}/append_entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: this.currentTerm,
          leaderId: this.id,
          prevLogIndex,
          prevLogTerm,
          entries: [],
          leaderCommit: this.commitIndex
        }),
        timeout: 1000
      }).catch(err => {
        if (!this.failedPeers) this.failedPeers = new Set();
        if (!this.failedPeers.has(peer)) {
          console.warn(`[${this.id}] Peer ${peer} unreachable: ${err.message}`);
          this.failedPeers.add(peer);
        }
      });
    });
  }

  /**
   * Propose a new command to the Raft cluster
   * @param {{ type: string, args: any }} command
   */
  propose(command) {
    console.log(`[${this.id}] propose() called; state=${this.state}; peers=${this.peers.length}`);
    if (this.state !== 'leader') {
      console.log(`[${this.id}] propose(): not leader, rejecting`);
      return Promise.reject(new Error(`Not leader ${this.leaderId}`));
    }

    return new Promise((resolve, reject) => {
      const term   = this.currentTerm;
      const cmd    = { type: command.type, args: command.args };
      const cmdStr = JSON.stringify(cmd);

      // Step 1: append to local log
      this.db.run(
        `INSERT INTO raft_log(term,command) VALUES(?,?)`,
        [term, cmdStr],
        err => {
          if (err) {
            console.error(`[${this.id}] propose(): log append error`, err);
            return reject(err);
          }

          // In-memory log
          const entry = { term, command: cmd };
          this.log.push(entry);
          console.log(`[${this.id}] propose(): appended entry idx=${this.log.length}`);

          // Step 2: single-node fast-path
          if (this.peers.length === 1) {
            console.log(`[${this.id}] propose(): single-node fast-path`);
            this.commitIndex = this.log.length;
            return this._applyEntry(entry)
              .then(result => {
                console.log(`[${this.id}] propose(): fast-path applied`, result);
                resolve(result);
              })
              .catch(err => {
                console.error(`[${this.id}] propose(): fast-path apply error`, err);
                reject(err);
              });
          }

          // Step 3: multi-node replication
          const N         = this.peers.length;
          const majority  = Math.floor(N/2) + 1;
          let acks        = 1;   // self-vote
          let responses   = 0;
          let errors      = 0;
          let committed   = false;
          const idx          = this.log.length;
          const prevLogIndex = idx - 1;
          const prevLogTerm  = this.log[prevLogIndex - 1]?.term || 0;

          console.log(`[${this.id}] propose(): replicating to ${N} peers, need ${majority}`);

          const checkDone = () => {
            if (!committed && acks >= majority) {
              committed = true;
              this.commitIndex = idx;
              console.log(`[${this.id}] propose(): got majority acks (${acks}), applying entry`);
              this._applyEntry(entry).then(resolve).catch(reject);
            } else if (responses + errors === N && !committed) {
              console.error(`[${this.id}] propose(): failed to reach majority (acks=${acks}, resp+err=${responses+errors})`);
              reject(new Error('Failed to get majority consensus'));
            }
          };

          this.peers.forEach(peer => {
            fetch(`http://${peer}/append_entries`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                term:         this.currentTerm,
                leaderId:     this.id,
                prevLogIndex,
                prevLogTerm,
                entries:      [entry],
                leaderCommit: this.commitIndex
              }),
              timeout: 100
            })
            .then(r => r.json())
            .then(res => {
              responses++;
              if (res.success) acks++;
              checkDone();
            })
            .catch(err => {
              errors++;
              console.warn(`[${this.id}] propose(): append_entries to ${peer} error`, err.message);
              checkDone();
            });
          });
        }
      );
    });
  }


  _applyEntry(entry) {
    return new Promise((resolve, reject) => {
      if (!entry) {
        return reject(new Error('No entry provided'));
      }
      const { type, args } = entry.command;
      let p;
      switch(type) {
        case 'createOrJoinGame':
        case 'join':
          p = applyCreateOrJoin(this.gamesDb, args.playerId, args.gameId, args.mode);
          break;
        case 'move':
          p = makeMove(this.gamesDb, args.playerId, args.gameId, args.from, args.to);
          break;
        case 'lobby':
          p = updateLobby(this.gamesDb, args.playerId, args.gameId, args.settings);
          break;
        case 'ready':
          p = setReady(this.gamesDb, args.playerId, args.gameId, args.ready);
          break;
        default:
          return reject(new Error(`Unknown command ${type}`));
      }
      p.then(result => {
        if (!result || !result.success) {
          return reject(new Error(result?.message || 'Failed to apply command'));
        }
        resolve(result);
      }).catch(reject);
    });
  }

  _startRPCServer(port) {
    const app = express();
    app.use(express.json());
    
    app.get('/ping', (req, res) => res.send('pong'));
    app.post('/request_vote', (req, res) => this._handleRequestVote(req, res));
    app.post('/append_entries', (req, res) => this._handleAppendEntries(req, res));
    
    app.listen(port, () => {
      console.log(`[${this.id}] Raft RPC server listening on port ${port}`);
    });
  }

  _handleRequestVote(req, res) {
    const { term, candidateId, lastLogIndex, lastLogTerm } = req.body;
    
    // If we see a higher term, step down
    if (term > this.currentTerm) {
      console.log(`[${this.id}] Stepping down - saw higher term ${term} > ${this.currentTerm}`);
      this.currentTerm = term;
      this.state = 'follower';
      this.votedFor = null;
      this._persistState();
    }

    let voteGranted = false;
    if (term === this.currentTerm && (!this.votedFor || this.votedFor === candidateId)) {
      const myLast = this.log[this.log.length - 1] || { term: 0 };
      const upToDate = (lastLogTerm > myLast.term) ||
                      (lastLogTerm === myLast.term && lastLogIndex >= this.log.length);
      if (upToDate) {
        voteGranted = true;
        this.votedFor = candidateId;
        this._persistState();
        this._resetElectionTimer();
      }
    }
    
    console.log(`[${this.id}] Voting ${voteGranted ? 'for' : 'against'} ${candidateId} in term ${term}`);
    res.json({ term: this.currentTerm, voteGranted });
  }

  _handleAppendEntries(req, res) {
    const { term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommit } = req.body;
    
    if (term > this.currentTerm) {
      this.currentTerm = term;
      this.state = 'follower';
      this.votedFor = null;
      this._persistState();
    }

    if (term === this.currentTerm) {
      if (this.state !== 'follower' && leaderId !== this.id) {
        this.state = 'follower';
      }
      this.leaderId = leaderId;
      this._resetElectionTimer();
    }

    let success = false;
    if (term === this.currentTerm) {
      const localTerm = this.log[prevLogIndex - 1]?.term || 0;
      if (prevLogIndex === 0 || localTerm === prevLogTerm) {
        success = true;
        if (entries.length > 0) {
          this.log.splice(prevLogIndex);
          entries.forEach(e => {
            this.db.run(
              `INSERT INTO raft_log(term,command) VALUES(?,?)`,
              [e.term, JSON.stringify(e.command)],
              (err) => {
                if (err) {
                  success = false;
                } else {
                  this.log.push(e);
                }
              }
            );
          });
        }
        if (success) {
          this.commitIndex = Math.min(leaderCommit, this.log.length);
          while (this.lastApplied < this.commitIndex) {
            this.lastApplied++;
            this._applyEntry(this.log[this.lastApplied - 1]).catch(() => {});
          }
        }
      }
    }
    res.json({ term: this.currentTerm, success });
  }
}

module.exports = RaftNode;