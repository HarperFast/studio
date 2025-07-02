import registrationInfo from '../api/instance/registrationInfo';
import handleCloudInstanceUsernameChange from './handleCloudInstanceUsernameChange';
import getFingerprint from '../api/instance/getFingerprint';
import setLicense from '../api/instance/setLicense';
import createLicense from '../api/lms/createLicense';

export default async ({
	auth,
	customer_id,
	instanceAuth,
	url,
	is_local,
	is_ssl,
	cloud_provider,
	instance_id,
	compute_stack_id,
	compute,
	status,
}) => {
	try {
		let registration = await registrationInfo({ auth: instanceAuth, url });

		if (registration.error && cloud_provider && registration.type === 'catch') {
			return {
				status: 'CREATING INSTANCE',
				error: false,
				retry: true,
			};
		}

		if (
			((registration.error && registration.message === 'Login failed') || registration.error === 'Login failed') &&
			!is_local
		) {
			const result = await handleCloudInstanceUsernameChange({ instance_id, instanceAuth, url });

			if (result) {
				registration = await registrationInfo({ auth: instanceAuth, url });
			} else {
				return {
					status: 'LOGIN FAILED',
					error: true,
					retry: false,
				};
			}
		}

		if (registration.status === 401 || registration.error === 'Login failed') {
			return {
				status: 'LOGIN FAILED',
				error: true,
				retry: false,
			};
		}

		if (registration.error && ['UPDATING INSTANCE', 'CONFIGURING NETWORK'].includes(status)) {
			return {
				status,
				error: false,
				retry: true,
			};
		}

		if (registration.error && is_local && is_ssl && registration.type === 'catch') {
			return {
				status: 'SSL ERROR',
				error: true,
				retry: true,
			};
		}

		if (registration.error) {
			return {
				status: 'UNABLE TO CONNECT1',
				error: true,
				retry: true,
			};
		}
		const registration_matches_stripe_plan =
			!compute || (registration.registered && registration.ram_allocation === compute.compute_ram);

		if (registration_matches_stripe_plan) {
			return {
				status: 'OK',
				error: false,
				version: registration.version,
				retry: false,
			};
		}

		const fingerprint = await getFingerprint({ auth: instanceAuth, url });
		const license = await createLicense({ auth, compute_stack_id, customer_id, fingerprint });
		const apply = await setLicense({ auth: instanceAuth, key: license.key, company: license.company.toString(), url });

		if (apply.error) {
			return {
				status: 'APPLYING LICENSE',
				error: false,
				version: registration.version,
				retry: true,
			};
		}

		return {
			status: 'LICENSE UPDATED - PLEASE RESTART',
			error: false,
			version: registration.version,
			retry: true,
		};
	} catch (e) {
		// eslint-disable-next-line
		console.log(e);
		return {
			status: 'UNABLE TO CONNECT2',
			error: true,
			retry: true,
		};
	}
};
