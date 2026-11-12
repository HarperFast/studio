import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { useEntityRestURL } from '@/config/useEntityRestURL';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useRollingConfigUpdate } from '@/hooks/useRollingConfigUpdate';
import { getComponentFileQueryOptions } from '@/integrations/api/instance/applications/getComponentFile';
import { getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import { localRestUrl, modelsGatewayEnabled, rootConfigServesRest } from '@/integrations/api/instance/models/models';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CopyIcon, TriangleAlertIcon } from 'lucide-react';
import { appsServeRest, restApps } from './restServed';

const ENDPOINTS = ['POST /v1/embeddings', 'POST /v1/chat/completions', 'GET /v1/models'];

/**
 * Undefined while it can't be told. The apps are read only when the root config doesn't decide it.
 */
function useRestServed(instanceParams: InstanceClientIdConfig, configuration: unknown): boolean | undefined {
	const rootServes = rootConfigServesRest(configuration);
	const { data: components } = useQuery(getComponentsQueryOptions({ ...instanceParams, enabled: !rootServes }));
	const apps = rootServes || !components ? [] : restApps(components);
	// An app with no config file serves REST, so no other app's config needs reading.
	const withConfig = apps.some((app) => !app.configFile) ? [] : apps.filter((app) => app.configFile);
	const configQueries = useQueries({
		queries: withConfig.map((app) =>
			getComponentFileQueryOptions({ ...instanceParams, project: app.name, file: app.configFile, encoding: 'utf8' })
		),
	});
	if (rootServes) {
		return true;
	}
	if (!components) {
		return undefined;
	}
	const configTexts = new Map<string, string>();
	withConfig.forEach((app, index) => {
		const text = configQueries[index]?.data?.message;
		if (typeof text === 'string') {
			configTexts.set(app.name, text);
		}
	});
	return appsServeRest(apps, configTexts);
}

export function ModelsApiCard({ instanceParams, configuration, targetNoun }: {
	instanceParams: InstanceClientIdConfig;
	configuration: unknown;
	targetNoun: 'instance' | 'cluster';
}) {
	const enabled = modelsGatewayEnabled(configuration);
	const restServed = useRestServed(instanceParams, configuration);
	const entityRestUrl = useEntityRestURL();
	const restUrl = isLocalStudio
		? localRestUrl(configuration, instanceParams.instanceClient.defaults.baseURL)
		: entityRestUrl;
	const address = restUrl ? `${restUrl.replace(/\/+$/, '')}/v1` : undefined;
	const [onCopyClick] = useCopyToClipboard(address ?? '');
	const { onConfigUpdate, isPending } = useRollingConfigUpdate();

	return (
		<section className="flex flex-col gap-3 rounded-md border p-4" aria-label="/v1 API">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h3 className="flex items-center gap-2 font-semibold">
						<span>
							<code className="font-mono">/v1</code> API
						</span>
						{enabled ? <Badge variant="success">On</Badge> : <Badge variant="outline">Off</Badge>}
					</h3>
					<p className="text-sm text-muted-foreground">
						An OpenAI-style API over this{' '}
						{targetNoun}'s models, for tools that already speak it. Every request needs an admin (super user) user.
					</p>
				</div>
				<Button
					variant={enabled ? 'destructiveOutline' : 'defaultOutline'}
					disabled={isPending}
					title={targetNoun === 'cluster'
						? 'Saves the setting and restarts the cluster, one instance at a time.'
						: 'Saves the setting and restarts the instance.'}
					onClick={() => onConfigUpdate({ modelsGateway_enabled: !enabled })}
				>
					{isPending ? 'Saving…' : enabled ? 'Turn Off & Restart' : 'Turn On & Restart'}
				</Button>
			</div>

			<dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">Address</dt>
				<dd className="flex items-center gap-2 break-all font-mono text-xs">
					{address ?? 'Not known'}
					{address && (
						<Button type="button" size="sm" variant="ghost" aria-label="Copy the /v1 address" onClick={onCopyClick}>
							<CopyIcon className="size-4" />
						</Button>
					)}
				</dd>
				<dt className="text-muted-foreground">Endpoints</dt>
				<dd className="font-mono text-xs">{ENDPOINTS.join(' · ')}</dd>
			</dl>

			{restServed === false && (
				<Alert variant="warning">
					<TriangleAlertIcon />
					<AlertDescription>
						<span>
							Nothing turns on REST here, so <code className="font-mono">/v1</code> won't answer{' '}
							{enabled ? '' : 'once it is on '}until something does: an application with{' '}
							<code className="font-mono">rest: true</code> in its config, or a <code className="font-mono">rest</code>
							{' '}
							section in this {targetNoun}'s own config.
						</span>
					</AlertDescription>
				</Alert>
			)}
		</section>
	);
}
