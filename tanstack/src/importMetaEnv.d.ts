// Minimal ambient declaration for `import.meta.env.DEV` — DevSiteSwitcher.tsx
// is the only file here that reads it. Declared locally instead of pulling
// in `vite/client` as a dependency: every bundler that implements the
// `import.meta.env` convention (Vite, and others that copy it) sets this at
// runtime, so this package doesn't need to assume Vite specifically.
interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
