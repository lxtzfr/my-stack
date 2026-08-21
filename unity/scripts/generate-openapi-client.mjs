// Generates a C# API client into a Unity project from an OpenAPI spec, via openapi-generator-cli
// (dockerized — no local Java/generator install needed). Handles the two things that make this
// awkward for Unity specifically:
//
// - Unity `.meta` files carry a GUID by value, persisted across runs. Wiping the output directory
//   before every generation would mint a fresh random GUID for every single file, breaking any
//   asset reference into it. Instead this diffs the file list before/after and only removes what
//   openapi-generator no longer emits (a renamed/removed DTO) — every unchanged path keeps its
//   `.meta` untouched, since openapi-generator overwrites same-path files in place.
// - Unity's C# runtime doesn't have Polly (the retry-policy library openapi-generator's `csharp`
//   generator bakes into `ApiClient.cs` by default) — stripped out and replaced with a no-op stub.
//
// A consuming project's own `scripts/generate-client.mjs` is expected to be a thin wrapper that
// calls `generateOpenApiClients` with its own workspace layout — see the usage example in this
// package's README.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

const COMMON_PROPS = 'library=httpclient,targetFramework=netstandard2.1,validatable=false,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false';

function run(args) {
  const [bin, ...rest] = args;
  console.log(`$ ${[bin, ...rest].join(' ')}`);
  const r = spawnSync(bin, rest, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function listCsFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCsFiles(p));
    else if (entry.name.endsWith('.cs')) out.push(p);
  }
  return out;
}

// Normalizes to CRLF, matching a repo checked out with core.autocrlf=true (the Unity/Windows
// norm) — the dockerized generator always writes LF, which would otherwise flag every
// byte-identical-content file as modified on every run for no real reason. Pass `false` if your
// repo uses LF instead.
function normalizeLineEndings(path, crlf) {
  if (!crlf) return;
  const content = readFileSync(path, 'utf8');
  writeFileSync(path, content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
}

// Creates the .asmdef (+ .meta) for a generated client if it's missing — e.g. on first
// generation. Never overwrites an existing one: the GUID must stay stable across runs since it's
// persisted by value in the .meta file and in any asmdef that references it.
function ensureAsmdef(outputDir, asmdefName) {
  const asmdefPath = join(outputDir, `${asmdefName}.asmdef`);
  if (existsSync(asmdefPath)) return;

  writeFileSync(
    asmdefPath,
    JSON.stringify({ name: asmdefName, rootNamespace: '', references: [], includePlatforms: [], excludePlatforms: [], allowUnsafeCode: false, overrideReferences: false, precompiledReferences: [], autoReferenced: true, defineConstraints: [], versionDefines: [], noEngineReferences: false }, null, 4) + '\n'
  );

  const guid = randomBytes(16).toString('hex');
  writeFileSync(
    `${asmdefPath}.meta`,
    `fileFormatVersion: 2\nguid: ${guid}\nAssemblyDefinitionImporter:\n  externalObjects: {}\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n`
  );
}

/** Generates one C# client (via the dockerized openapi-generator-cli) into `outputDir`.
 *  - `workspaceRoot`: absolute path mounted into the container as /workspace — every path below
 *    is given relative to it (so the container never sees your real host filesystem layout).
 *  - `specPath`: relative to workspaceRoot, e.g. 'server/openapi/device-management.json'.
 *  - `outputDir`: relative to workspaceRoot, e.g. 'unity/Assets/API/Management' — Unity project
 *    root, not repo root, so the client lands somewhere Unity will actually import it.
 *  - `packageName`: the C# namespace/package openapi-generator emits (its `packageName` property).
 *  - `asmdefName`: the .asmdef this client's code compiles into.
 *  - `crlf` (default true): normalize generated files to CRLF to match core.autocrlf=true. */
export function generateOpenApiClient({ workspaceRoot, specPath, outputDir, packageName, asmdefName, dockerImage = 'openapitools/openapi-generator-cli:v7.22.0', crlf = true }) {
  // Docker Desktop on Windows needs forward slashes for volume mounts.
  const workspaceDocker = workspaceRoot.replace(/\\/g, '/');
  const absOutputDir = join(workspaceRoot, outputDir);
  const srcDir = join(absOutputDir, 'src');

  // Snapshot of currently-generated files, so we can prune anything openapi-generator no longer
  // emits after this run — see the file-level comment above for why we don't just wipe first.
  const before = new Set(listCsFiles(srcDir));

  // openapi-generator recreates the `src` folder itself (independent of the diffing above), which
  // drops Unity's .meta for that directory and churns its GUID on every run — back it up and
  // restore it below.
  const srcMetaPath = `${srcDir}.meta`;
  const srcMetaBackup = existsSync(srcMetaPath) ? readFileSync(srcMetaPath) : null;

  run([
    'docker', 'run', '--rm',
    '-v', `${workspaceDocker}:/workspace`,
    dockerImage, 'generate',
    '-i', `/workspace/${specPath.replace(/\\/g, '/')}`,
    '-g', 'csharp',
    '-o', `/workspace/${outputDir.replace(/\\/g, '/')}`,
    '--additional-properties', `packageName=${packageName},${COMMON_PROPS}`,
  ]);

  // Keep only src/ and the hand-maintained .asmdef (+ .meta)
  for (const entry of readdirSync(absOutputDir)) {
    if (entry === 'src' || entry === `${asmdefName}.asmdef` || entry === `${asmdefName}.asmdef.meta`) continue;
    rmSync(join(absOutputDir, entry), { recursive: true, force: true });
  }
  rmSync(join(absOutputDir, 'src', `${packageName}.Test`), { recursive: true, force: true });

  if (srcMetaBackup && !existsSync(srcMetaPath)) writeFileSync(srcMetaPath, srcMetaBackup);
  rmSync(join(absOutputDir, 'src', packageName, 'README.md'), { force: true });
  rmSync(join(absOutputDir, 'src', packageName, `${packageName}.csproj`), { force: true });

  // Polly patch — Unity's C# runtime doesn't have it, see file-level comment.
  const apiClientPath = join(absOutputDir, 'src', packageName, 'Client', 'ApiClient.cs');
  let content = readFileSync(apiClientPath, 'utf8');
  content = content.split('\n').filter(line => line !== 'using Polly;').join('\n');
  content = content.replace(
    /if \(RetryConfiguration\.AsyncRetryPolicy != null\)[\s\S]*?else\s*\{\s*(response = await _httpClient\.SendAsync\(req, finalToken\)\.ConfigureAwait\(false\);)\s*\}/,
    '$1'
  );
  writeFileSync(apiClientPath, content);

  writeFileSync(
    join(absOutputDir, 'src', packageName, 'Client', 'RetryConfiguration.cs'),
    `// Polly removed — not available in Unity.\nnamespace ${packageName}.Client\n{\n    public static class RetryConfiguration { }\n}\n`
  );

  // Prune files openapi-generator no longer emits (e.g. a removed/renamed DTO) — only these
  // paths, so unrelated files keep their .meta untouched.
  const after = new Set(listCsFiles(srcDir));
  for (const f of before) {
    if (after.has(f)) continue;
    rmSync(f, { force: true });
    rmSync(`${f}.meta`, { force: true });
  }

  for (const f of after) normalizeLineEndings(f, crlf);

  ensureAsmdef(absOutputDir, asmdefName);
}

/** Generates every client in `clients` (see generateOpenApiClient for the per-client shape). */
export function generateOpenApiClients({ workspaceRoot, clients, dockerImage, crlf }) {
  for (const client of clients) {
    generateOpenApiClient({ workspaceRoot, dockerImage, crlf, ...client });
  }
}

/** Writes a lock file recording a hash of every file in `specPaths` (absolute paths) — pair with
 *  assertGeneratedClientFresh (in ci-scripts' shared/publish-guard.mjs) to catch a build running
 *  against a stale client whose upstream specs changed since the last time this ran. */
export function writeSpecsLock(lockFilePath, specPaths) {
  const hash = createHash('sha256');
  for (const spec of specPaths) hash.update(readFileSync(spec));
  mkdirSync(dirname(lockFilePath), { recursive: true });
  writeFileSync(lockFilePath, JSON.stringify({ sha256: hash.digest('hex') }, null, 2) + '\n');
}
