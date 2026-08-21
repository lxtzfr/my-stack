/** Convenience for building an `envs` entry from a shared base domain — dev.example.com,
 *  api.dev.example.com etc. Optional: `envs` in ci-scripts.config.mjs can be written by hand too. */
export const subdomainEnv = (domain, sub) => ({
  host:    sub ? `${sub}.${domain}` : domain,
  apiHost: sub ? `https://api.${sub}.${domain}` : `https://api.${domain}`,
});
