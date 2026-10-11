import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSSHKeyQueryOptions } from '@/integrations/api/instance/ssh/getSSHKey';
import { listSSHKeysQueryOptions } from '@/integrations/api/instance/ssh/listSSHKeys';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { CheckCircle2Icon, TriangleAlertIcon } from 'lucide-react';
import { ReactNode, useCallback } from 'react';
import { Control, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { z } from 'zod';
import { extractGitUrlHost, replaceGitUrlHost, toSSHGitUrl, usesNonSSHTransport } from './gitUrl';
import { NewApplicationSchema } from './schema';

export function ImportAuthorization({
	control,
	setValue,
	watch,
}: {
	control: Control<z.infer<typeof NewApplicationSchema>>;
	setValue: UseFormSetValue<z.infer<typeof NewApplicationSchema>>;
	watch: UseFormWatch<z.infer<typeof NewApplicationSchema>>;
}) {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	} = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const requiresAuth = watch('contents.requiresAuth');
	const ref = watch('contents.ref');
	const sshKeyName = watch('contents.sshKeyName');

	const { data: sshKeys } = useQuery({
		...listSSHKeysQueryOptions(instanceParams),
		enabled: requiresAuth,
	});

	// Fetch the selected key's host so we can verify the URL targets it. No polling needed here.
	const { data: selectedKey } = useQuery({
		...getSSHKeyQueryOptions({ ...instanceParams, name: sshKeyName }),
		refetchInterval: false,
		enabled: requiresAuth && !!sshKeyName,
	});

	const urlHost = extractGitUrlHost(ref);
	const listedKey = sshKeys?.find((key) => key.name === sshKeyName);
	const keyHost = selectedKey?.host ?? listedKey?.host;
	const keyHostname = selectedKey?.hostname ?? listedKey?.hostname;
	const nonSSHUrl = usesNonSSHTransport(ref);
	const hostMatches = !nonSSHUrl && !!urlHost && !!keyHost && urlHost.toLowerCase() === keyHost.toLowerCase();
	const hostMismatch = !nonSSHUrl && !!urlHost && !!keyHost && !hostMatches;
	const keyServesUrlHost = !!keyHost && !!keyHostname && keyHostname.toLowerCase() === urlHost?.toLowerCase();
	const sshUrl = nonSSHUrl && keyHost && keyServesUrlHost ? toSSHGitUrl(ref, keyHost) : null;
	const suggestedUrl = sshUrl ?? (hostMismatch ? replaceGitUrlHost(ref, keyHost) : '');

	const useSuggestedUrl = useCallback(() => {
		setValue('contents.ref', suggestedUrl, { shouldValidate: true, shouldDirty: true });
	}, [setValue, suggestedUrl]);

	let body: ReactNode;
	if (sshKeys && sshKeys.length > 0) {
		body = (
			<>
				<FormField
					control={control}
					name="contents.sshKeyName"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="pb-1">SSH Key</FormLabel>
							<FormControl>
								<Select value={field.value || ''} onValueChange={field.onChange}>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Choose an SSH key" />
									</SelectTrigger>
									<SelectContent>
										{sshKeys.map((key) => (
											<SelectItem key={key.name} value={key.name}>
												{key.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormControl>
						</FormItem>
					)}
				/>

				{!sshKeyName && (
					<p className="text-sm text-muted-foreground">
						Select the SSH key this repository uses so we can verify the URL.
					</p>
				)}

				{hostMatches && (
					<Alert>
						<CheckCircle2Icon className="h-4 w-4" />
						<AlertDescription>
							<span>
								This URL targets <code>{keyHost}</code>, matching the selected key.
							</span>
						</AlertDescription>
					</Alert>
				)}

				{hostMismatch && (
					<Alert variant="warning">
						<TriangleAlertIcon className="h-4 w-4" />
						<AlertDescription>
							<span>
								The URL targets <code>{urlHost}</code>, but the selected key <strong>{sshKeyName}</strong> uses the host
								{' '}
								<code>{keyHost}</code>. SSH auth resolves the key from the host in the URL, so this import will likely
								fail to authenticate. Did you mean:
							</span>
							<code className="block break-all">{suggestedUrl}</code>
							<Button type="button" variant="defaultOutline" size="sm" onClick={useSuggestedUrl}>
								Use suggested URL
							</Button>
						</AlertDescription>
					</Alert>
				)}
			</>
		);
	} else {
		// No keys configured yet, still loading, or the list couldn't be fetched. Fall back to the
		// informational guidance the screen showed before the picker existed, so a slow or failing
		// list_ssh_keys degrades gracefully instead of surfacing a loading bar or an error.
		body = (
			<Alert>
				<AlertDescription>
					<span>
						Manage your SSH keys in{' '}
						<Link to={buildAbsoluteLinkToPage(params, 'config')} className="underline">Config</Link> &gt;{' '}
						<Link to={buildAbsoluteLinkToPage(params, 'config/ssh-keys')} className="underline">SSH Keys</Link>. This
						enables SSH based auth for private repos, i.e. following the pattern of{' '}
						<a
							href="https://github.com/HarperFast/Studio"
							target="_blank"
							rel="noreferrer"
							className="underline"
						>
							git@github.com:HarperFast/studio.git
						</a>. If you have more than one key, make sure to utilize unique hostnames!
					</span>
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<>
			<FormLabel>Authorization</FormLabel>
			<FormField
				control={control}
				name="contents.requiresAuth"
				render={({ field }) => (
					<Tabs
						className="w-full pt-2 pb-0 mb-0"
						value={String(field.value)}
						onValueChange={(value) => field.onChange(value === 'true')}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="false">Public Access</TabsTrigger>
							<TabsTrigger value="true">Requires Auth</TabsTrigger>
						</TabsList>

						<TabsContent value="false" className="space-y-4 mt-4" />

						<TabsContent value="true" className="space-y-4 mt-4">
							{body}
							{nonSSHUrl && (
								<Alert variant="warning">
									<TriangleAlertIcon className="h-4 w-4" />
									<AlertDescription>
										<span>
											Git only uses an SSH key for an SSH URL, so this import won't use one and a private repository
											will likely fail to authenticate.
										</span>
										{sshUrl
											? (
												<>
													<span>Use the SSH URL for the selected key instead:</span>
													<code className="block break-all">{sshUrl}</code>
													<Button type="button" variant="defaultOutline" size="sm" onClick={useSuggestedUrl}>
														Use SSH URL
													</Button>
												</>
											)
											: (
												<span>
													Use the repository's SSH clone URL from your git host instead, with its host replaced by{' '}
													{keyServesUrlHost
														? <code>{keyHost}</code>
														: 'the host alias of the SSH key for this repository'}.
												</span>
											)}
									</AlertDescription>
								</Alert>
							)}
						</TabsContent>
					</Tabs>
				)}
			/>
		</>
	);
}
