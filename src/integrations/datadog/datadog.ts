import { isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { translateUrlForDatadog } from '@/integrations/datadog/translateUrlForDatadog';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { isLocalUser } from '@/lib/types/isLocalUser';
import { datadogRum } from '@datadog/browser-rum';
import { reactPlugin } from '@datadog/browser-rum-react';
import { useLocation, useRouter } from '@tanstack/react-router';
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
				trackUserInteractions: true,

				sessionSampleRate: 100,
				sessionReplaySampleRate: 0,
				defaultPrivacyLevel: 'mask',

				plugins: [reactPlugin()],
			});

			datadogRum.onReady(() => {
				datadogRum.startView({
					service: 'studio',
					version: import.meta.env.VITE_STUDIO_VERSION,
					name: window.location.pathname || 'initial',
				});
			});
		}
	}, []);
}

export function useOnRouteLoadTracker() {
	const location = useLocation();
	const router = useRouter();
	const { user } = useOverallAuth();

	useEffect(() => {
		const currentMatches = router.matchRoutes(router.state.location);
		const name = translateUrlForDatadog(
			location.href,
			currentMatches.map((m) => m.params)
		);
		if (!enabled) {
			return;
		}

		datadogRum.onReady(() => {
			datadogRum.startView({
				service: 'studio',
				version: import.meta.env.VITE_STUDIO_VERSION,
				name,
			});
		});
	}, [location.href, router]);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		if (user && !isLocalUser(user)) {
			datadogRum.setUser({
				id: user.id,
				name: [user.firstname, user.lastname].filter(excludeFalsy).join(' ') || undefined,
				email: user.email,
			});
		} else {
			datadogRum.clearUser();
		}
	}, [user]);
}
