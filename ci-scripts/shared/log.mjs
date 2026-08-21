// Structured logging so build output is easy to read live and to summarize after the fact.
// Every line is tagged `[project][env] LEVEL message` (or `[project] LEVEL` with no env, e.g. unity-asset).
// A final DONE/ERROR line is guaranteed even if the process exits via a raw process.exit() deep
// in a subprocess call (run() in utils.mjs, publish-guard.mjs) that never touches this logger.
export function makeLogger(project, env) {
  const tag = env ? `[${project}][${env}]` : `[${project}]`
  const line = (level, msg) => `${tag} ${level.padEnd(5)} ${msg}`

  let resultPrinted = false
  process.on('exit', (code) => {
    if (resultPrinted) return
    console.log(line(code === 0 ? 'DONE' : 'ERROR', code === 0 ? 'exited 0' : `exited ${code}`))
  })

  return {
    step:  (msg) => console.log(line('STEP', msg)),
    skip:  (msg) => { resultPrinted = true; console.log(line('SKIP', msg)) },
    warn:  (msg) => console.warn(line('WARN', msg)),
    error: (msg) => { resultPrinted = true; console.error(line('ERROR', msg)) },
    done:  (msg) => { resultPrinted = true; console.log(line('DONE', msg)) },
  }
}
