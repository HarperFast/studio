import { isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { isLocalUser } from '@/lib/types/isLocalUser';
import { currentUrlAfterHash } from '@/lib/urls/currentUrlAfterHash';
import { datadogRum } from '@datadog/browser-rum';
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

export function useOnRouteLoadTracker() {
	const location = useLocation();
	const { user } = useOverallAuth();

	useEffect(() => {
		if (!enabled) {
			return;
		}
		datadogRum.startView({
			service: 'studio',
			version: import.meta.env.VITE_STUDIO_VERSION,
			name: currentUrlAfterHash(),
		});
	}, [location.href]);

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
