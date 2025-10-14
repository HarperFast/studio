import { ErrorComponent } from '@/components/ErrorComponent';
import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { plugins } from '@/features/instance/apis/plugins';
import { requestSnippets } from '@/features/instance/apis/requestSnippets';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration';
import { getOpenAPIQueryOptions } from '@/features/instance/operations/queries/getOpenAPI';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import { useRollingConfigUpdate } from '@/hooks/useRollingConfigUpdate';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
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
	const http = configurationInfo?.http;

	let apiInaccessibleWarning: string = '';

	const corsDisabled = http?.cors === false;
	const missingFromCORSList = http?.corsAccessList?.length !== undefined
		&& !http.corsAccessList.includes('*')
		&& !http.corsAccessList.includes('null')
		&& !http.corsAccessList.includes(window.location.origin);
	if (corsDisabled) {
		apiInaccessibleWarning = `This ${clusterId && !instanceId ? 'cluster' : 'instance'} has CORS disabled currently, so you won't be able to execute API requests from the browser.`;
	} else if (missingFromCORSList) {
		apiInaccessibleWarning = `This ${clusterId && !instanceId ? 'cluster' : 'instance'} has CORS enabled, but ${window.location.origin} is not allowed, so you won't be able to execute API requests from the browser.`;
	}

	const { onConfigUpdate, isPending: isSettingConfiguration } = useRollingConfigUpdate();
	const enableCORS = useCallback(() => {
		onConfigUpdate({
			...(corsDisabled ? {
				'http_cors': true,
			} : {}),
			...(missingFromCORSList ? {
				'http_corsAccessList': [
					...(http?.corsAccessList ?? []),
					window.location.origin,
				],
			} : {}),
		});
	}, [http, onConfigUpdate]);

	if (isLoadingConfiguration || isLoadingRegistration || isLoadingDocs) {
		return <Loading centered={true} text="Looking up your instance configuration, one moment." />;
	}

	if (error) {
		let message: string;
		if (registrationInfo?.version && !wasAReleasedBeforeB('4.7.0-beta.7', registrationInfo?.version)) {
			message = `API Docs are only available starting in version '4.7.0-beta.7' of Harper, please update your version ${registrationInfo.version}!`;
		} else {
			message = `We weren't able to look up your docs. Please check the Network tab of your developer tools to see why the docs were not accessible to Studio.`;
		}

		return <ErrorComponent
			title="API Docs Unavailable"
			error={{ message }}
			showReturnToHome={false}
		/>;
	}

	return (<>
		{apiInaccessibleWarning && (<ErrorComponent
			title="CORS Disabled: HTTP API Not Accessible"
			className="mt-0 mx-4 m-0 border-yellow text-yellow"
			error={{ message: apiInaccessibleWarning }}
			showReturnToHome={false}
		>
			<Button disabled={isSettingConfiguration} variant="warning" className="rounded-full" onClick={enableCORS}>
				<Plus />
				{isSettingConfiguration ? 'Enabling CORS...' : `Enable CORS for ${window.location.origin}`}
			</Button>
		</ErrorComponent>)}
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
