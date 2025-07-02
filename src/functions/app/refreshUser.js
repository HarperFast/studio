import getUser from '../api/lms/getUser';

export default async ({ auth, loggingIn = false, controller, setFetchingUser = false }) => {
	if (auth?.email && auth?.pass) {
		controller = new AbortController();
		if (setFetchingUser) setFetchingUser(true);
		await getUser({ ...auth, loggingIn, signal: controller.signal });
		if (setFetchingUser) setFetchingUser(false);
	}
};
