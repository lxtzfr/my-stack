import { join } from 'node:path';
import { capture } from '../shared/utils.mjs';
import { loadConfig } from '../shared/config.mjs';
import * as gitlab from './registries/gitlab.mjs';
import * as github from './registries/github.mjs';

const { workspaceRoot: WORKSPACE_ROOT } = await loadConfig();

const PROVIDERS = { gitlab, github };

/** Detects the registry provider + namespace (group/owner) from the git remote of the repo
 *  checked out at `<WORKSPACE_ROOT>/<dir>` — no config needed, so one project's repo can live on
 *  GitLab while another lives on GitHub. `dir` is a filesystem path relative to WORKSPACE_ROOT
 *  (e.g. '.' for a single-repo project) — NOT a services-map key or a display name; callers that
 *  only have a service/sub-image name must resolve it to `services[name]?.dir ?? name` first. Also
 *  returns `repoName`, the repo's own name parsed straight from its remote — distinct from `dir`
 *  (which can be `.`) and required by GitLab's project-scoped registry API. */
export function resolveRegistry(dir) {
  const remote = capture(['git', '-C', join(WORKSPACE_ROOT, dir), 'remote', 'get-url', 'origin']);
  const provider = /github\.com/.test(remote) ? 'github' : /gitlab\.com/.test(remote) ? 'gitlab' : null;
  if (!provider) throw new Error(`Cannot detect a supported registry provider (gitlab.com or github.com) from remote: ${remote}`);
  const impl = PROVIDERS[provider];
  const repoName = remote.replace(/\.git$/, '').split(/[:/]/).pop();
  return { provider, namespace: impl.parseNamespace(remote), repoName, impl };
}

export function resolveDockerNamespace(project) {
  return resolveRegistry(project).namespace;
}

export function dockerLogin(project) {
  resolveRegistry(project).impl.dockerLogin();
}

/** All tag names currently pushed at `imagePath` under `project`'s registry (empty array if it
 *  doesn't exist yet). `project` is the checkout dir (relative to workspaceRoot) whose remote
 *  determines provider/namespace/API access — pass it explicitly when a sub-image is pushed to a
 *  nested path under another repo's registry. */
export function listImageTags({ project, imagePath }) {
  const { namespace, repoName, impl } = resolveRegistry(project);
  return impl.listImageTags({ namespace, project: repoName, imagePath });
}

/** versionTag (human, e.g. 1.0.0+dev-2026.07.15-19.17, or just dev-2026.07.15-19.17 without a
 *  `contracts` entry — see gen-version.mjs) drives the app-visible BUILD_VERSION label;
 *  registryTag (versionTag + commit sha suffix) is the actual docker tag pushed, so the commit
 *  identity used for the already-built check lives on the real release tag instead of a separate
 *  marker tag. `dockerfilePath`/`contextDir` default to `<project>/Dockerfile` and the workspace root. */
export function dockerBuildPush({ project, env, versionTag, registryTag = versionTag, buildArgs = {}, ssh, imagePath, dockerfilePath, contextDir }) {
  const { namespace, impl } = resolveRegistry(project);
  const file = dockerfilePath ?? join(WORKSPACE_ROOT, project, 'Dockerfile');
  const context = contextDir ?? WORKSPACE_ROOT;
  return impl.dockerBuildPush({ namespace, env, versionTag, registryTag, buildArgs, ssh, imagePath, dockerfilePath: file, contextDir: context });
}

export function cleanupOldTags({ project, imagePath }) {
  const { namespace, repoName, impl } = resolveRegistry(project);
  impl.cleanupOldTags({ namespace, project: repoName, imagePath });
}
