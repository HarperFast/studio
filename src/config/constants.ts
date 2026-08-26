export const forceBasicAuth = import.meta.env.VITE_FORCE_BASIC_AUTH === 'true';
export const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';

/** Hand-mirrors `DEPLOY_MODES` in `vite.config.ts`; `deployModes.test.ts` pins this to the env files. */
export const deployModes: ReadonlySet<string> = new Set(['dev', 'stage', 'prod']);

/**
 * Whether this bundle may report to third-party telemetry.
 *
 * `VITE_TELEMETRY_ENABLED` carries it: only the deploy action's build step sets it, and no file in
 * `.github/deploy-public-env` does, because those are read by a local `pnpm build --mode prod`
 * too — which otherwise produces a bundle identical to production. Setting the variable by hand
 * does enable reporting; the point is that no documented local workflow sets it by accident.
 *
 * `MODE` and `VITE_ENV_NAME` are defence in depth: a mode added here but missed in
 * `vite.config.ts` gets no `envDir`, so its env file is never read and it stays silent instead of
 * reporting with no `env` tag.
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

// The self-serve conversion target: what an expiring trial upgrades to. Studio otherwise picks
// plans by catalogue description, but this one is named in the flow itself, so the id is pinned
// here rather than matched on a display string.
export const hobbyistPlanId = 'fabric-block-hobbyist';

// Plans whose region set central-manager freezes: while one of these is on the cluster, a region
// change in the same request as a plan change is refused ("upgrade first, then change regions").
// Keyed on the cluster's CURRENT plan, not the one being selected.
export const regionFrozenPlanIds = ['fabric-block-trial', 'fabric-block-level-0'];
