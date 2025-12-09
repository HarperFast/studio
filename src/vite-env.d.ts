/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DEV: string;
	readonly VITE_STUDIO_VERSION: string;
	readonly VITE_LOCAL_STUDIO: string; // INFO: This flag is the local version of studio ran on HarperDb instances
	readonly VITE_FORCE_BASIC_AUTH: string;
	readonly VITE_ENV_NAME: string;
	readonly VITE_PUBLIC_STRIPE_KEY: string;
	readonly VITE_LOCAL_STUDIO_DEV_URL: string;
	readonly VITE_REO_DEV_CLIENT_ID: string;
	readonly VITE_CENTRAL_MANAGER_API_URL: string;
	// more env variables...
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
