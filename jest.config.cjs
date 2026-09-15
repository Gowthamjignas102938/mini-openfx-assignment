/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/*.spec.ts'],
  // Integration specs (trades, balances) share one real Postgres database
  // as their fixture. Jest runs separate spec *files* in parallel worker
  // processes by default, which lets two files' beforeEach/assertions race
  // against the same rows. maxWorkers: 1 forces spec files to run one at a
  // time, eliminating the race — the trade-off (slower) is irrelevant at
  // this suite's size (sub-second either way).
  maxWorkers: 1,
};
