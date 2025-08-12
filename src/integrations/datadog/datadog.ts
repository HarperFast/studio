import { isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { isLocalUser } from '@/lib/types/isLocalUser';
import { Context, datadogRum } from '@datadog/browser-rum';
import { reactPlugin } from '@datadog/browser-rum-react';
import { useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';

let initialized = false;
const enabled = !import.meta.env.DEV && !isLocalStudio;

export function useDatadog() {
	useEffect(() => {
		if (initialized) {
			return;
		}
		initialized = true;
		if (enabled) {
			datadogRum.init({
				applicationId: 'f590deee-4bac-49b4-a202-3b6963d9721d',
				clientToken: 'pub27aa29cea521492f4fef73032f86a023',

				site: 'datadoghq.com',
				service: 'studio',
				env: import.meta.env.VITE_ENV_NAME,
				version: import.meta.env.VITE_STUDIO_VERSION,

				trackViewsManually: true,

				sessionSampleRate: 100,
				sessionReplaySampleRate: 20,
				defaultPrivacyLevel: 'mask-user-input',

				plugins: [reactPlugin()],
			});
		}
	}, []);
}

export function trackView(name: string, context: Context) {
	if (enabled) {
		datadogRum.startView({
			service: 'studio',
			version: import.meta.env.VITE_STUDIO_VERSION,
			name,
			context,
		});
	}
}

export function useOnRouteLoadTracker() {
	const location = useLocation();
	const { user } = useOverallAuth();

	useEffect(() => {
		const userId = user && !isLocalUser(user) && user.id || null;
		trackView(location.pathname, { userId });
		// we ignore the user in the deps intentionally
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname]);
}
