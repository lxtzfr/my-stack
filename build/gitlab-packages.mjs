import { capture } from '../shared/utils.mjs';

/** Most recent version names of a generic package (newest first), excluding 'latest'. */
export function listPackageVersions({ projectId, packageName, limit = 20 }) {
  const packages = JSON.parse(capture(['glab', 'api', '-X', 'GET', `projects/${projectId}/packages`,
    '--field', `package_name=${packageName}`,
    '--field', `per_page=${limit}`,
    '--field', 'order_by=created_at',
    '--field', 'sort=desc',
  ]) || '[]');
  return packages.map(p => p.version).filter(v => v !== 'latest');
}

/** Unlike Docker tags, re-pushing the same generic-package version+filename doesn't overwrite —
 *  it appends a new package_file. Deletes all but the newest file for that name so a repeatedly
 *  re-pushed version (e.g. 'latest') doesn't accumulate duplicates forever. */
export function pruneOldPackageFiles({ projectId, packageName, version, fileName }) {
  const pkgs = JSON.parse(capture(['glab', 'api', '-X', 'GET', `projects/${projectId}/packages`,
    '--field', `package_name=${packageName}`,
    '--field', `package_version=${version}`,
  ]) || '[]');
  const pkg = pkgs.find(p => p.version === version);
  if (!pkg) return;
  const files = JSON.parse(capture(['glab', 'api', `projects/${projectId}/packages/${pkg.id}/package_files`]) || '[]')
    .filter(f => f.file_name === fileName)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const stale of files.slice(1)) {
    capture(['glab', 'api', '-X', 'DELETE', `projects/${projectId}/packages/${pkg.id}/package_files/${stale.id}`]);
  }
}

/** Delete old generic-package versions, keeping 'latest' plus the single most recent versioned one. */
export function cleanupOldPackages({ projectId, packageName }) {
  console.log(`Deleting old ${packageName} packages...`);
  const packages = JSON.parse(capture(['glab', 'api', '-X', 'GET', `projects/${projectId}/packages`,
    '--field', `package_name=${packageName}`,
    '--field', 'per_page=100',
    '--field', 'order_by=created_at',
    '--field', 'sort=desc',
  ]));
  const stale = packages.filter(p => p.version !== 'latest').slice(1);
  for (const pkg of stale) {
    capture(['glab', 'api', '-X', 'DELETE', `projects/${projectId}/packages/${pkg.id}`]);
  }
}
