export const forceBasicAuth = import.meta.env.VITE_FORCE_BASIC_AUTH === 'true';
export const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';

/** Hand-mirrors `DEPLOY_MODES` in `vite.config.ts`; `deployModes.test.ts` pins this to the env files. */
export const deployModes: ReadonlySet<string> = new Set(['dev', 'stage', 'prod']);

/**
 * Whether this bundle is a real deploy, and so may report to third-party telemetry.
 *
 * `MODE` because a bare `vite build` is mode `production`, and unlike `VITE_ENV_NAME` no
 * `.env.local` can set it. `VITE_ENV_NAME` as well because the two mode lists can drift: one added
 * here but missed in `vite.config.ts` gets no `envDir`, so it would report untagged.
 */
export const isDeployedBuild = !import.meta.env.DEV && !isLocalStudio
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
