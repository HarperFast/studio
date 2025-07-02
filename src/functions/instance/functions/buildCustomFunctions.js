import instanceState from '../../state/instanceState';
import customFunctionsStatus from '../../api/instance/customFunctionsStatus';
import getCustomFunctions from '../../api/instance/getCustomFunctions';
import getComponents from '../../api/instance/getComponents';

const buildCustomFunctions = async ({ auth, url }) => {
	const { is_enabled, port, directory, error, message } = await customFunctionsStatus({ auth, url });
	const fileTree = await getComponents({ auth, url });

	// TODO: [] should be {}
	// TODO: rename endpoints to file tree or something more descriptive
	const endpoints = is_enabled ? await getCustomFunctions({ auth, url }) : {};

	const custom_functions = {
		is_enabled,
		port,
		endpoints,
		directory,
		error,
		message,
		fileTree,
	};

	instanceState.update((s) => {
		s.custom_functions = custom_functions;
	});

	return {
		custom_functions,
	};
};

export default buildCustomFunctions;
