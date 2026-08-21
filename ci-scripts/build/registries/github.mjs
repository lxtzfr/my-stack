import { run, capture, registerSecret } from '../../shared/utils.mjs';

const GHCR_HOST = 'ghcr.io';

export function parseNamespace(remote) {
  const m = remote.match(/github\.com[:/]([^/]+)\/[^/]+$/);
  if (!m) throw new Error(`Cannot parse GitHub owner from remote: ${remote}`);
  return m[1];
}

export function dockerLogin() {
  const token = process.env.GITHUB_TOKEN ?? capture(['gh', 'auth', 'token']);
  if (!token) { console.error('GITHUB_TOKEN missing (or run `gh auth login`) — needs write:packages/read:packages/delete:packages scopes'); process.exit(1); }
  registerSecret(token);
  const owner = capture(['gh', 'api', 'user', '--jq', '.login']) || process.env.GITHUB_ACTOR;
  if (!owner) { console.error('Could not resolve a GitHub username for docker login — set GITHUB_ACTOR'); process.exit(1); }
  console.log(`Logging in to ${GHCR_HOST}...`);
  run(['docker', 'login', GHCR_HOST, '-u', owner, '--password-stdin'], { input: token + '\n' });
}

/** GitHub Packages versions are scoped to either a user or an org, and there's no single API that
 *  covers both without knowing which `namespace` is — try org first (the common case for a repo
 *  under an org), then fall back to user. */
function listVersions(namespace, imagePath) {
  const encoded = encodeURIComponent(imagePath);
  for (const ownerType of ['orgs', 'users']) {
    const out = capture(['gh', 'api', `${ownerType}/${namespace}/packages/container/${encoded}/versions`, '--paginate']);
    if (!out) continue;
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch {
      continue;
    }
    // gh api prints the response body to stdout even on a non-2xx (e.g. 404 "Package not
    // found." as a JSON error object) — only an array is a real, non-empty version list.
    if (!Array.isArray(parsed)) continue;
    return { ownerType, versions: parsed };
  }
  return null;
}

export function listImageTags({ namespace, imagePath }) {
  const found = listVersions(namespace, imagePath);
  if (!found) return [];
  return found.versions.flatMap(v => v.metadata?.container?.tags ?? []);
}

export function dockerBuildPush({ namespace, env, versionTag, registryTag = versionTag, buildArgs = {}, ssh, imagePath, dockerfilePath, contextDir }) {
  const imageName = `${namespace}/${imagePath}`;
  const latest    = `${GHCR_HOST}/${imageName}:latest`;
  const dated     = `${GHCR_HOST}/${imageName}:${registryTag}`;

  console.log(`Pushing [${env}] ${latest} (${registryTag})...`);
  run([
    'docker', 'buildx', 'build',
    '--platform', 'linux/amd64',
    '--provenance=false',
    '--no-cache',
    '--progress', 'quiet',
    '--push',
    // Forwards an SSH key/agent into a `RUN --mount=type=ssh` build step (e.g. `npm install`
    // fetching a private git-hosted dependency) — never baked into any image layer.
    ...(ssh ? ['--ssh', ssh] : []),
    '--label', `org.opencontainers.image.source=https://github.com/${imageName}`,
    '--label', `org.opencontainers.image.version=${versionTag}`,
    '--build-arg', `BUILD_VERSION=${versionTag}`,
    ...Object.entries(buildArgs).flatMap(([k, v]) => ['--build-arg', `${k}=${v}`]),
    '--file', dockerfilePath.replace(/\\/g, '/'),
    '--tag', latest,
    '--tag', dated,
    contextDir.replace(/\\/g, '/'),
  ]);

  return { namespace, imageName };
}

export function cleanupOldTags({ namespace, imagePath }) {
  console.log('Deleting old image tags...');
  const found = listVersions(namespace, imagePath);
  if (!found) { console.warn(`No GHCR package found at ${namespace}/${imagePath} — skipping tag cleanup`); return; }
  const { ownerType, versions } = found;
  const encoded = encodeURIComponent(imagePath);
  // Keep 'latest' (re-pushed every build, never stale on its own) plus the single most recent
  // dated version.
  const dated = versions
    .filter(v => !(v.metadata?.container?.tags ?? []).includes('latest'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const stale of dated.slice(1)) {
    capture(['gh', 'api', '-X', 'DELETE', `${ownerType}/${namespace}/packages/container/${encoded}/versions/${stale.id}`]);
  }
}
