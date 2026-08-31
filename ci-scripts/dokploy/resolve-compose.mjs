// Shared "find the Dokploy environment/compose for <service> <env>" resolution — every dokploy/*
// script that needs to act on a specific running compose (seed, compose-sync, env-sync, ssh, logs)
// was independently walking project.all -> environment.byProjectId -> compose by name, which had
// drifted into three near-identical copies. One place now owns it.
import { dokploy } from './dokploy.mjs';
import { loadConfig } from '../shared/config.mjs';

export function dokployEnvName(env) {
  return env === 'prd' ? 'production' : env;
}

/** Resolves `<service>-<env>`'s Dokploy environment + compose entry + compose detail (which
 *  includes `appName`, the `<appName>-<service>-<n>` prefix Dokploy actually names the running
 *  container with — not something derivable from config alone). Throws with an actionable message
 *  (usually "run setup-env.mjs first") if anything along the way isn't provisioned yet. */
export async function resolveComposeApp(service, env) {
  const config = await loadConfig();
  const projectName = config.dokploy?.projectName;
  if (!projectName) throw new Error('Set `dokploy.projectName` in ci-scripts.config.mjs');
  const ENV_NAME = dokployEnvName(env);
  const projects = await dokploy.projectAll();
  const project = projects.find(p => p.name === projectName);
  if (!project) throw new Error(`${projectName} project not found`);
  const environments = await dokploy.environmentByProjectId(project.projectId);
  const environment = environments.find(e => e.name === ENV_NAME);
  if (!environment) throw new Error(`Environment "${ENV_NAME}" not found — run setup-env.mjs first`);
  const compose = (environment.compose ?? []).find(c => c.name === `${service}-${env}`);
  if (!compose) throw new Error(`No ${service}-${env} compose found — run setup-env.mjs first`);
  const composeDetail = await dokploy.composeOne(compose.composeId);
  return { environment, compose, composeDetail, appName: composeDetail.appName };
}
