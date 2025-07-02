import instanceState from '../../state/instanceState';
import describeAll from '../../api/instance/describeAll';
import buildInstanceDataStructure from './buildInstanceDataStructure';
import registrationInfo from '../../api/instance/registrationInfo';

export default async ({ auth, url }) => {
	const schema = await describeAll({ auth, url });
	const registration = await registrationInfo({ auth, url });

	if (schema.error) {
		return {
			error: 'Could not log into instance',
		};
	}

	const { structure, defaultBrowseURL } = buildInstanceDataStructure(schema);

	instanceState.update((s) => {
		s.auth = auth;
		s.structure = structure;
		s.defaultBrowseURL = defaultBrowseURL;
		s.loading = false;
		s.registration = registration;
	});

	return {
		error: false,
	};
};
