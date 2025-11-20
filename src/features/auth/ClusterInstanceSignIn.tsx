import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { activeClusterStatuses } from '@/config/clusterStatuses';
import { isLocalStudio } from '@/config/constants';
import { calculateCreateClusterDeepLink } from '@/config/deepLinks';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useClusterInstanceSignIn } from '@/features/auth/hooks/useClusterInstanceSignIn';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { SchemaHdbInstance } from '@/integrations/api/api.gen';
import { UsernameSignInSchema } from '@/integrations/api/instance/auth/signInSchema';
import { getInstanceHealthQueryOptions } from '@/integrations/api/instance/status/getInstanceHealth';
import { CrossLocalhostIssueType, detectCrossLocalhostUrls } from '@/lib/urls/detectCrossLocalhostUrls';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';

export function ClusterInstanceSignIn() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const instance: SchemaHdbInstance | undefined = useMemo(
		() => instanceId && cluster && cluster?.instances?.find(i => i.id === instanceId) || undefined,
		[cluster, instanceId]);
	const isActive = useMemo(() => cluster?.status && activeClusterStatuses.includes(cluster.status), [cluster?.status]);

	const properNoun = isLocalStudio ? 'Local' : instanceId ? 'Instance' : 'Cluster';
	const commonNoun = isLocalStudio ? 'instance' : instanceId ? 'instance' : 'cluster';

	const operationsUrl = useMemo(() => {
		if (cluster) {
			if (instance) {
				authStore.flagForFabricConnect(instance.id, false);
				return getOperationsUrlForInstance(instance);
			} else {
				authStore.flagForFabricConnect(cluster.id, false);
				return getOperationsUrlForCluster(cluster);
			}
		}
		return null;
	}, [cluster, instance]);

	const instanceParams = useInstanceClientIdParams(operationsUrl);
	const warnAboutLoginCookieIssues = useMemo(
		() => detectCrossLocalhostUrls(navigator.userAgent, location.hostname, operationsUrl),
		[operationsUrl],
	);
	const { data: healthy } = useQuery(
		getInstanceHealthQueryOptions(instanceParams),
	);

	const methods = useForm({
		resolver: zodResolver(UsernameSignInSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});
	const { control, handleSubmit } = methods;

	const { submitForm, isPending } = useClusterInstanceSignIn({
		cluster,
		instance,
		instanceParams,
	});

	if (!instanceId && cluster && !cluster?.fqdn) {
		return <Navigate to="../instances" replace={true} />;
	}

	if (isActive && cluster?.resetPassword) {
		return <Navigate to={`/${cluster.organizationId}/${cluster.id}/finish-setup`} replace={true} />;
	}
	if (!isActive && cluster?.resetPassword) {
		return <Navigate to={`/${cluster.organizationId}/${cluster.id}/starting-up`} replace={true} />;
	}

	return (
		<>
			{!isLocalStudio && (
				<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700 flex items-center">
					<Breadcrumbs />
				</nav>)}
			<div className="h-screen items-center justify-center flex">
				<div className="text-white w-xs">
					<h2 className="text-2xl font-light">
						Sign in to Harper {properNoun}</h2>
					<Form {...methods}>
						<form onSubmit={handleSubmit(submitForm)} className="my-4">
							<FormField
								control={control}
								name="username"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input
												autoComplete="username"
												autoFocus={true}
												type="text"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name="password"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button disabled={isPending} type="submit" variant="submit" className="w-full my-2 rounded-full">
								Sign In
							</Button>
							{healthy === false && (
								<div className="p-4 mt-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300" role="alert">
									<span className="font-medium">Warning!</span> This {commonNoun} is not responding to
									GET {operationsUrl}health. Is the server running? Have
									you <a href="https://docs.harperdb.io/docs/developers/security/configuration#cors" target="_blank" className="underline">enabled
									CORS</a> for the operations API?
								</div>
							)}
							{warnAboutLoginCookieIssues === CrossLocalhostIssueType.MixedLoopback && (
								<div className="p-4 mt-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300" role="alert">
									<span className="font-medium">Warning!</span> Your login might not work because
									you're mixing 127.0.0.1 and localhost. Pick one or the other.
								</div>
							)}
							{warnAboutLoginCookieIssues === CrossLocalhostIssueType.InsecureCookieOutsideChromeAndFirefox && (
								<div className="p-4 mt-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300" role="alert">
									<span className="font-medium">Warning!</span> Your login might not work because your
									browser doesn't consider localhost to be secure, so it doesn't pass the cookies
									along. Firefox or Chromium based browsers should pass the cookies properly.
								</div>
							)}

							{isLocalStudio && <div className="p-4 mt-4 text-sm rounded-lg bg-purple-950" role="alert">
								<span className="font-medium">Did you know?</span> You can add this instance to your Harper account to
								manage it remotely.
								<div className="text-center pt-2">
									<Link to={calculateCreateClusterDeepLink()} target="_blank">
										<Button type="button" variant="positive">
											Connect to Harper Fabric
										</Button>
									</Link>
								</div>
							</div>}
						</form>
					</Form>
				</div>
			</div>
		</>
	);
}
