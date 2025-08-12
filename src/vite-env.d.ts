/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DEV: string;
	readonly VITE_STUDIO_VERSION: string;
	readonly VITE_LOCAL_STUDIO: string; //INFO: This flag is the local version of studio ran on HarperDb instances
	readonly VITE_ENV_NAME: string;
	readonly DISABLE_ESLINT_PLUGIN: string;
	readonly VITE_PUBLIC_URL: string;
	readonly VITE_PUBLIC_STRIPE_KEY: string;
	readonly VITE_LOCAL_STUDIO_DEV_URL: string;
	readonly VITE_REO_DEV_CLIENT_ID: string;
	readonly VITE_LMS_API_URL: string;
	readonly VITE_CENTRAL_MANAGER_API_URL: string;
	readonly VITE_GOOGLE_ANALYTICS_CODE: string;
	readonly VITE_TC_VERSION: string;
	readonly VITE_CHECK_VERSION_INTERVAL: string;
	readonly VITE_CHECK_USER_INTERVAL: string;
	readonly VITE_REFRESH_CONTENT_INTERVAL: string;
	readonly VITE_FREE_CLOUD_INSTANCE_LIMIT: string;
	readonly VITE_MAX_FILE_UPLOAD_SIZE: string;
	readonly VITE_ALARM_BADGE_THRESHOLD: string;
	readonly VITE_MAINTENANCE: string;
	// more env variables...
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
