import { ErrorComponent } from '@/components/ErrorComponent';
import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { useEntityRestURL } from '@/config/useEntityRestURL';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { ApiExplorer } from '@/features/instance/apis/explorer/ApiExplorer';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { useRollingConfigUpdate } from '@/hooks/useRollingConfigUpdate';
import {
	createInstanceAuthenticationTokens,
	mintOperationTokenWithCredentials,
} from '@/integrations/api/instance/auth/createInstanceAuthenticationTokens';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { getOpenAPIQueryOptions } from '@/integrations/api/instance/status/getOpenAPI';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export function APIDocs() {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const operationsParams = useInstanceClientIdParams();
	const {
		data: configurationInfo,
		isLoading: isLoadingConfiguration,
	} = useQuery(getConfigurationQueryOptions(operationsParams));
	const { data: registrationInfo, isLoading: isLoadingRegistration } = useQuery(
		getRegistrationInfoQueryOptions(operationsParams),
	);
	const baseURL = useEntityRestURL();
	const {
		data: spec,
		isLoading: isLoadingDocs,
		error,
	} = useQuery(getOpenAPIQueryOptions(operationsParams));

	// The credential (username/password) log-in mints directly against the operations client's own
	// base URL — the address Studio already talks to this instance on. When that address is the Fabric
	// Connect proxy path, it fails the direct check and the credential fallback is withheld so typed
	// credentials never reach central manager; session mint (below) still works there.
	const operationsBaseURL = operationsParams.instanceClient.defaults.baseURL;
	const onSessionMint = useCallback(
		async () =>
			(await createInstanceAuthenticationTokens({ instanceClient: operationsParams.instanceClient })).operationToken,
		[operationsParams.instanceClient],
	);
	const onCredentialMint = useMemo(
		() =>
			isDirectOperationsUrl(operationsBaseURL)
				? (credentials: { username: string; password: string }) =>
					mintOperationTokenWithCredentials({ operationsUrl: operationsBaseURL, ...credentials })
				: null,
		[operationsBaseURL],
	);
	// The explorer builds its own server list from `baseURL` (Studio's computed REST URL) plus the
	// spec's declared servers, and lets the user pick — so we no longer mutate the spec's servers as
	// the previous Swagger integration did.
	const http = configurationInfo?.http;

	let apiInaccessibleWarning: string = '';

	const corsDisabled = http?.cors === false;
	const missingFromCORSList = http?.corsAccessList?.length !== undefined
		&& !http.corsAccessList.includes('*')
		&& !http.corsAccessList.includes('null')
		&& !http.corsAccessList.includes(window.location.origin);
	if (corsDisabled) {
		apiInaccessibleWarning = `This ${
			clusterId && !instanceId ? 'cluster' : 'instance'
		} has CORS disabled currently, so you won't be able to execute API requests from the browser.`;
	} else if (missingFromCORSList) {
		apiInaccessibleWarning = `This ${
			clusterId && !instanceId ? 'cluster' : 'instance'
		} has CORS enabled, but ${window.location.origin} is not allowed, so you won't be able to execute API requests from the browser.`;
	}

	const { onConfigUpdate, isPending: isSettingConfiguration } = useRollingConfigUpdate();
	const enableCORS = useCallback(() => {
		onConfigUpdate({
			...(corsDisabled
				? {
					'http_cors': true,
				}
				: {}),
			...(missingFromCORSList
				? {
					'http_corsAccessList': [
						...(http?.corsAccessList ?? []),
						window.location.origin,
					],
				}
				: {}),
		});
	}, [corsDisabled, http?.corsAccessList, missingFromCORSList, onConfigUpdate]);

	if (isLoadingConfiguration || isLoadingRegistration || isLoadingDocs) {
		return <Loading centered={true} text="Looking up your instance configuration, one moment." />;
	}

	if (error) {
		let message: string;
		if (registrationInfo?.version && !wasAReleasedBeforeB('4.7.0-beta.7', registrationInfo?.version)) {
			message =
				`API Docs are only available starting in version '4.7.0-beta.7' of Harper, please update your version ${registrationInfo.version}!`;
		} else {
			message =
				`We weren't able to look up your docs. Please check the Network tab of your developer tools to see why the docs were not accessible to Studio.`;
		}

		return (
			<ErrorComponent
				title="API Docs Unavailable"
				error={{ message }}
				showReturnToHome={false}
			/>
		);
	}

	return (
		// On lg, a fixed-height app-shell: the container fills from below the layout chrome
		// (`--spacing(32)` = the layout's `mt-32`) to the viewport bottom, so the explorer's sidebar
		// and detail scroll internally and the sidebar reaches the bottom exactly. On smaller screens
		// it's a normal block that the page scrolls.
		<div className="flex flex-col px-4 pt-6 pb-12 md:px-8 lg:h-[calc(100vh-(--spacing(32)))] lg:pb-0">
			{apiInaccessibleWarning && (
				<ErrorComponent
					title="CORS Disabled: HTTP API Not Accessible"
					className="mt-0 mb-6 shrink-0 border-yellow text-yellow"
					error={{ message: apiInaccessibleWarning }}
					showReturnToHome={false}
				>
					<Button
						type="button"
						disabled={isSettingConfiguration}
						variant="warning"
						onClick={enableCORS}
					>
						<Plus />
						{isSettingConfiguration ? 'Enabling CORS...' : `Enable CORS for ${window.location.origin}`}
					</Button>
				</ErrorComponent>
			)}
			{
				/* Key by entity so switching instances remounts the explorer — no draft request body or
			    response from one instance can carry over to (or be sent against) another. */
			}
			<ApiExplorer
				key={operationsParams.entityId}
				spec={spec as OpenApiSpec | undefined}
				baseURL={baseURL}
				entityId={operationsParams.entityId}
				onSessionMint={onSessionMint}
				onCredentialMint={onCredentialMint}
			/>
		</div>
	);
}
