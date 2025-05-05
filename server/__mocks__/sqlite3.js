// tests/__mocks__/sqlite3.js

// Simple in-memory map to hold game states by ID
const rows = {};

module.exports.verbose = () => ({
  // Our fake Database class
  Database: class {
    constructor(filename, callback) {
      // ignore filename, pretend to open instantly
      if (callback) callback(null);
    }

    serialize(fn) {
      fn();
    }

    run(sql, params, cb) {
      // Handle INSERT INTO games and UPDATE games
      if (sql.startsWith('INSERT INTO games')) {
        // params = [ gameId, player1Id, stateString ]
        const [gameId, /*player1*/, stateString] = params;
        rows[gameId] = JSON.parse(stateString);
      } else if (sql.startsWith('UPDATE games')) {
        // params = [ stateString, gameId ]
        const [stateString, gameId] = params;
        rows[gameId] = JSON.parse(stateString);
      }
      if (cb) cb(null);
    }

    get(sql, params, cb) {
      // params = [ gameId ]
      const [gameId] = params;
      const state = rows[gameId];
      cb(null, state ? { state: JSON.stringify(state) } : undefined);
    }

    all(sql, params, cb) {
      // Return all rows if someone does SELECT *
      const allRows = Object.entries(rows).map(([id, st]) => ({
        id,
        state: JSON.stringify(st)
      }));
      cb(null, allRows);
    }

    close() {
      // no-op
    }
  }
});
