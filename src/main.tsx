import { App } from '@/App';
import { authStore } from '@/features/auth/store/authStore';
import { scrubLegacySettings } from '@/features/instance/apis/explorer/settings';
import { reactRootErrorHandlers } from '@/integrations/datadog/reportReactError';
import { installApiUnauthorizedRedirect } from '@/lib/installApiUnauthorizedRedirect';
import { installBrowserTranslationDomGuard } from '@/lib/installBrowserTranslationDomGuard';
import { installCrossTabSignOut } from '@/lib/installCrossTabSignOut';
import { installStaleDeployReload } from '@/lib/installStaleDeployReload';
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
installCrossTabSignOut();
// Remove the pre-sessionStorage API-explorer credential map (plaintext Basic passwords / Bearer
// tokens) at boot, so an upgraded user who never reopens the explorer is still scrubbed.
scrubLegacySettings();
// Clear the explorer's per-tab credential when another tab signs an entity out, even while this tab's
// explorer is unmounted — so a tab that navigated away can't later restore a revoked token.
authStore.installExplorerCrossTabCleanup();

createRoot(document.getElementById('root')!, reactRootErrorHandlers).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
