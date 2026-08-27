import { run, capture, registerSecret } from '../../shared/utils.mjs';

export function parseNamespace(remote) {
  const m = remote.match(/gitlab\.com[:/](.+)\/[^/]+$/);
  if (!m) throw new Error(`Cannot parse GitLab namespace from remote: ${remote}`);
  return m[1];
}

export function dockerLogin() {
  const token = process.env.GITLAB_PAT;
  if (!token) { console.error('GITLAB_PAT missing — set a GitLab PAT with read_registry/write_registry scopes'); process.exit(1); }
  registerSecret(token);
  console.log('Logging in to registry.gitlab.com...');
  run(['docker', 'login', 'registry.gitlab.com', '-u', 'oauth2', '--password-stdin'], { input: token + '\n' });
}

/** GitLab's container registry API is scoped per-project — `project` (the repo the registry
 *  lives under) is resolved to a project ID first, then `imagePath` matches a repository within it. */
export function listImageTags({ namespace, project, imagePath }) {
  const projectApiPath = `${namespace}%2F${project}`;
  const repos = JSON.parse(capture(['glab', 'api', `projects/${projectApiPath}/registry/repositories`]) || '[]');
  const repo  = repos.find(r => r.path === `${namespace}/${imagePath}`);
  if (!repo) return [];
  const tags = JSON.parse(capture(['glab', 'api', `projects/${projectApiPath}/registry/repositories/${repo.id}/tags`]) || '[]');
  return tags.map(t => t.name);
}

export function dockerBuildPush({ namespace, env, versionTag, registryTag = versionTag, buildArgs = {}, ssh, imagePath, dockerfilePath, contextDir }) {
  const imageName = `${namespace}/${imagePath}`;
  const latest    = `registry.gitlab.com/${imageName}:latest`;
  const dated     = `registry.gitlab.com/${imageName}:${registryTag}`;

  console.log(`Pushing [${env}] ${latest} (${registryTag})...`);
  run([
    'docker', 'buildx', 'build',
    '--platform', 'linux/amd64',
    '--provenance=false',
    '--progress', 'quiet', // still surfaces errors, just drops the (huge) per-layer progress log
    '--push',
    // Forwards an SSH key/agent into a `RUN --mount=type=ssh` build step (e.g. `npm install`
    // fetching a private git-hosted dependency) — never baked into any image layer.
    ...(ssh ? ['--ssh', ssh] : []),
    '--label', `org.opencontainers.image.source=https://gitlab.com/${imageName}`,
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

export function cleanupOldTags({ namespace, project, imagePath }) {
  console.log('Deleting old image tags...');
  const projectApiPath = `${namespace}%2F${project}`;
  const repos  = JSON.parse(capture(['glab', 'api', `projects/${projectApiPath}/registry/repositories`]));
  const repo   = repos.find(r => r.path === `${namespace}/${imagePath}`);
  if (repo) {
    capture(['glab', 'api', '-X', 'DELETE',
      '--field', 'name_regex_delete=\\d{4}\\..*',
      '--field', 'keep_n=1',
      `projects/${projectApiPath}/registry/repositories/${repo.id}/tags`,
    ]);
  } else {
    console.warn(`No registry repository found at ${namespace}/${imagePath} — skipping tag cleanup`);
  }
}
