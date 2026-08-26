export const forceBasicAuth = import.meta.env.VITE_FORCE_BASIC_AUTH === 'true';
export const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';

/** Hand-mirrors `DEPLOY_MODES` in `vite.config.ts`; `deployModes.test.ts` pins this to the env files. */
export const deployModes: ReadonlySet<string> = new Set(['dev', 'stage', 'prod']);

/**
 * Whether this bundle was built *and shipped* by the deploy pipeline, and so may report to
 * third-party telemetry.
 *
 * `VITE_TELEMETRY_ENABLED` is the load-bearing clause, and it is deliberately absent from
 * `.github/deploy-public-env` — only the deploy action's build step sets it. Nothing about a build
 * a person runs can forge it, including `pnpm build --mode prod`, which otherwise produces a
 * bundle identical to production and would report as `env:prod` from localhost.
 *
 * The rest is defence in depth: `MODE` must name a deploy, and `VITE_ENV_NAME` must exist, so a
 * mode added to `deployModes` but missed in `vite.config.ts` gets no `envDir` and reports untagged
 * rather than silently mislabelled.
 */
export const isDeployedBuild = import.meta.env.VITE_TELEMETRY_ENABLED === 'true'
	&& !import.meta.env.DEV && !isLocalStudio
	&& deployModes.has(import.meta.env.MODE) && Boolean(import.meta.env.VITE_ENV_NAME);
export const localStudioDevUrl = import.meta.env.VITE_LOCAL_STUDIO_DEV_URL;
// Unset means no bot check on the public auth forms — matches central-manager,
// which only enforces reCAPTCHA where its own secret key is configured.
export const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
export const defaultOperationsApiPort = 9925;
export const defaultOperationsApiSecure = true;
export const defaultClusterUsername = 'HDB_ADMIN';

export const defaultInstanceRoute = '/';
export const defaultInstanceRouteUpOne = '../';

export const maxUploadFileSize = 1024 /* mb */ * 1024 /* kb */ * 1024 /* b */;
export const maxFabricConnectUploadFileSize = 100 /* mb */ * 1024 /* kb */ * 1024 /* b */;
