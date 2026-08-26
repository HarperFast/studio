export const forceBasicAuth = import.meta.env.VITE_FORCE_BASIC_AUTH === 'true';
export const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';
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
