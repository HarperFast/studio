/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DEV: string;
	readonly VITE_STUDIO_VERSION: string;
	readonly VITE_LOCAL_STUDIO: string; // INFO: This flag is the local version of studio ran on HarperDb instances
	readonly VITE_FORCE_BASIC_AUTH: string;
	/** Absent outside the deploy modes — a bare `vite build` reads no file that sets it. */
	readonly VITE_ENV_NAME: string | undefined;
	readonly VITE_PUBLIC_STRIPE_KEY: string;
	readonly VITE_LOCAL_STUDIO_DEV_URL: string;
	readonly VITE_REO_DEV_CLIENT_ID: string;
	readonly VITE_CENTRAL_MANAGER_API_URL: string;
	readonly VITE_RECAPTCHA_SITE_KEY: string;
	readonly VITE_DISABLE_DEVTOOLS: string;
	// more env variables...
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
