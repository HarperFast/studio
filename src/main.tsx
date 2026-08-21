import { App } from '@/App';
import { scrubLegacySettings } from '@/features/instance/apis/explorer/settings';
import { installApiUnauthorizedRedirect } from '@/lib/installApiUnauthorizedRedirect';
import { installBrowserTranslationDomGuard } from '@/lib/installBrowserTranslationDomGuard';
import { installStaleDeployReload } from '@/lib/installStaleDeployReload';
import { addReactError } from '@datadog/browser-rum-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Must run before React mounts: keeps browser page-translation from crashing React
// with `removeChild`/`insertBefore` NotFoundErrors (issue #1388).
installBrowserTranslationDomGuard();
// Reload once when a redeploy invalidates this tab's hashed chunks, instead of
// leaving routes and Monaco language workers broken for the session (issue #1406).
installStaleDeployReload();
// Redirect to /sign-in when a CM call returns 401 (lost/expired session), instead
// of leaving the SPA on a stale user while every data call fails.
installApiUnauthorizedRedirect();
// Remove the pre-sessionStorage API-explorer credential map (plaintext Basic passwords / Bearer
// tokens) at boot, so an upgraded user who never reopens the explorer is still scrubbed.
scrubLegacySettings();

createRoot(
	document.getElementById('root')!,
	{
		onUncaughtError: (error, errorInfo) => {
			// Report uncaught errors to Datadog
			addReactError(error as Error, errorInfo);
			console.error('Uncaught error:', error, errorInfo);
		},
		onCaughtError: (error, errorInfo) => {
			// Report caught errors to Datadog
			addReactError(error as Error, errorInfo);
			console.error('Caught error:', error, errorInfo);
		},
		onRecoverableError: (error, errorInfo) => {
			// Report recoverable errors to Datadog
			addReactError(error as Error, errorInfo);
			console.warn('Recoverable error:', error, errorInfo);
		},
	},
).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
