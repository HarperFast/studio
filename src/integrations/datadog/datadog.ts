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

		   // First time vs return visit action
	       if (localStorage.getItem('hasVisitedBefore')) {
		       datadogRum.addAction('return_visit');
	       } else {
		       datadogRum.addAction('first_time_visit');
		       localStorage.setItem('hasVisitedBefore', 'true');
	       }

		} else {
			datadogRum.clearUser();
		}
	}, [user]);
}

export function loginSuccessDatadogAction(data: { id: string; email: string; firstname: string; lastname: string }) {
	if (!enabled) return;

	// Time between logins
	const lastLogin = localStorage.getItem('lastLoginTimestamp');
	const now = Date.now();
	
	if (lastLogin) {
		const seconds = Math.floor((now - Number(lastLogin)) / 1000);
		if (!Number.isNaN(seconds) && seconds >= 0) {
			datadogRum.addAction('login_time_gap', { seconds });
		}
	}

	localStorage.setItem('lastLoginTimestamp', String(now));

	datadogRum.setUser({
		id: data.id,
		email: data.email,
		name: [data.firstname, data.lastname].filter(Boolean).join(' ') || undefined,
	});

	datadogRum.addAction('login_success', { userId: data.id });
}
