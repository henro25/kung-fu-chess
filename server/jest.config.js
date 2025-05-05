module.exports = {
    roots: [
      "/Users/bridgetma/Desktop/kung-fu-chess/tests/client",
      "/Users/bridgetma/Desktop/kung-fu-chess/tests/integration",
      "/Users/bridgetma/Desktop/kung-fu-chess/tests/server",
    ],
    testMatch: [
      "**/?(*.)+(test).[jt]s?(x)"
    ],
    transform: {
      "^.+\\.(js|jsx)$": "babel-jest"
    }, 
    moduleNameMapper: {
        // Map any `require('sqlite3')` to your mock
        '^sqlite3$': '<rootDir>/__mocks__/sqlite3.js'
      }
  };
  