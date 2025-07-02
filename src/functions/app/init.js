import getCurrentVersion from '../api/lms/getCurrentVersion';
import getProducts from '../api/lms/getProducts';
import getRegions from '../api/lms/getRegions';
import getWavelengthRegions from '../api/lms/getWavelengthRegions';
import getAkamaiRegions from '../api/lms/getAkamaiRegions';
import appState from '../state/appState';
import refreshUser from './refreshUser';
import config from '../../config';
import getThemes from './getThemes';

export default ({
	currentPath,
	navigate,
	setFetchingUser,
	persistedUser,
	setPersistedUser,
	instanceAuths,
	controller,
}) => {
	getThemes(persistedUser.theme);

	if (!config.is_local_studio) {
		if (['/sign-up', '/reset-password', '/resend-registration-email'].includes(currentPath)) {
			setFetchingUser(false);
			return setPersistedUser({});
		}

		if (['/sign-in'].includes(currentPath)) {
			return navigate('/');
		}

		if (!persistedUser?.email) {
			setFetchingUser(false);
		} else {
			refreshUser({ auth: persistedUser, controller, setFetchingUser, loggingIn: true });
		}

		getCurrentVersion();
		getProducts();
		getRegions();
		getWavelengthRegions();
		getAkamaiRegions();

		return appState.update((s) => {
			s.auth = { email: persistedUser?.email, pass: persistedUser?.pass };
		});
	}
	appState.update((s) => {
		s.instances = [{ compute_stack_id: 'local', url: config.local_studio_dev_url || '/', instance_name: 'local' }];
	});
	setFetchingUser(false);

	if (instanceAuths?.local?.valid) {
		setFetchingUser(false);
		return setTimeout(navigate('/o/local/i/local/browse'), 10);
	}
	return navigate('/');
};
