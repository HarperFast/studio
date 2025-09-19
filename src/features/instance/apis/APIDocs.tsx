import { ErrorComponent } from '@/components/ErrorComponent';
import { Loading } from '@/components/Loading';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { plugins } from '@/features/instance/apis/plugins';
import { requestSnippets } from '@/features/instance/apis/requestSnippets';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration';
import { getOpenAPIQueryOptions } from '@/features/instance/operations/queries/getOpenAPI';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import './swagger.css';

export function APIDocs() {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const operationsParams = useInstanceClientIdParams();
	const {
		data: configurationInfo,
		isLoading: isLoadingConfiguration,
	} = useQuery(getConfigurationQueryOptions(operationsParams));
	const { data: registrationInfo, isLoading: isLoadingRegistration } = useQuery(
		getRegistrationInfoQueryOptions(operationsParams),
	);
	const {
		data: spec,
		isLoading: isLoadingDocs,
		error,
	} = useQuery(getOpenAPIQueryOptions(operationsParams));

	if (isLoadingConfiguration || isLoadingRegistration || isLoadingDocs) {
		return <Loading centered={true} text="Looking up your instance configuration, one moment." />;
	}

	if (error) {
		if (registrationInfo?.version && !wasAReleasedBeforeB('4.7.0-beta.7', registrationInfo?.version)) {
			return <ErrorComponent
				title="API Docs Unavailable"
				error={{
					message: `API Docs are only available starting in version '4.7.0-beta.7' of Harper, please update your version ${registrationInfo.version}!`,
				}}
				showReturnToHome={false}
			/>;
		}

		return <ErrorComponent
			title="API Docs Unavailable"
			error={{
				message: 'We weren\'t able to look up your docs. Please check the Network tab of your' +
					' developer tools to see why the docs were not accessible to Studio.',
			}}
			showReturnToHome={false}
		/>;
	}

	return (<>
		{configurationInfo?.http?.cors === false && (<ErrorComponent
			title="CORS Disabled: API Not Accessible"
			className="mt-0 mx-4 m-0"
			error={{
				message: `This ${clusterId && !instanceId ? 'cluster' : 'instance'} has CORS disabled currently, so you won't be able to execute API requests from the browser.`,
			}}
			showReturnToHome={false}
		/>)}
		<SwaggerUI
			spec={spec}
			persistAuthorization={true}
			requestSnippetsEnabled={true}
			requestSnippets={requestSnippets}
			plugins={plugins}
			tryItOutEnabled={true}
		/>
	</>);
}
