import { join } from 'node:path';
import { capture } from '../shared/utils.mjs';
import { loadConfig } from '../shared/config.mjs';
import * as gitlab from './registries/gitlab.mjs';
import * as github from './registries/github.mjs';

const { workspaceRoot: WORKSPACE_ROOT } = await loadConfig();

const PROVIDERS = { gitlab, github };

/** Detects the registry provider + namespace (group/owner) from `project`'s own git remote host —
 *  no config needed, so one project's repo can live on GitLab while another lives on GitHub. */
export function resolveRegistry(project) {
  const remote = capture(['git', '-C', join(WORKSPACE_ROOT, project), 'remote', 'get-url', 'origin']);
  const provider = /github\.com/.test(remote) ? 'github' : /gitlab\.com/.test(remote) ? 'gitlab' : null;
  if (!provider) throw new Error(`Cannot detect a supported registry provider (gitlab.com or github.com) from remote: ${remote}`);
  const impl = PROVIDERS[provider];
  return { provider, namespace: impl.parseNamespace(remote), impl };
}

export function resolveDockerNamespace(project) {
  return resolveRegistry(project).namespace;
}

export function dockerLogin(project) {
  resolveRegistry(project).impl.dockerLogin();
}

/** All tag names currently pushed at `imagePath` under `project`'s registry (empty array if it
 *  doesn't exist yet). `project` is the repo whose remote determines provider/namespace/API access
 *  — pass it explicitly when a sub-image is pushed to a nested path under another repo's registry. */
export function listImageTags({ project, imagePath }) {
  const { namespace, impl } = resolveRegistry(project);
  return impl.listImageTags({ namespace, project, imagePath });
}

/** versionTag (human, e.g. 2026.7.15-19.17-dev) drives the app-visible BUILD_VERSION label;
 *  registryTag (versionTag + commit sha suffix) is the actual docker tag pushed, so the commit
 *  identity used for the already-built check lives on the real release tag instead of a separate
 *  marker tag. `dockerfilePath`/`contextDir` default to `<project>/Dockerfile` and the workspace root. */
export function dockerBuildPush({ project, env, versionTag, registryTag = versionTag, buildArgs = {}, imagePath, dockerfilePath, contextDir }) {
  const { namespace, impl } = resolveRegistry(project);
  const file = dockerfilePath ?? join(WORKSPACE_ROOT, project, 'Dockerfile');
  const context = contextDir ?? WORKSPACE_ROOT;
  return impl.dockerBuildPush({ namespace, env, versionTag, registryTag, buildArgs, imagePath, dockerfilePath: file, contextDir: context });
}

export function cleanupOldTags({ project, imagePath }) {
  const { namespace, impl } = resolveRegistry(project);
  impl.cleanupOldTags({ namespace, project, imagePath });
}
