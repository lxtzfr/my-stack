// Where runtime-writable state persists across redeploys (visitor logs,
// game grids, a SQLite file...) — prod sets DATA_DIR to an absolute Docker
// volume mount; locally it's unset, so this falls back to ./data next to
// the repo.
//
// Deliberately keyed off DATA_DIR rather than NODE_ENV: Vite/Rollup inline
// `process.env.NODE_ENV` at build time (a near-universal bundler
// convention), which would freeze this to whatever it resolved to during
// `vite build` regardless of the env the built server actually runs in. A
// plain custom env var like DATA_DIR isn't special-cased by bundlers and
// stays a genuine runtime read.
export const RUNTIME_DATA_DIR = process.env.DATA_DIR ?? './data'
