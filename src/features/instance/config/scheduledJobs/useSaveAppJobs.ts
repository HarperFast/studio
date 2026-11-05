import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { componentFilesAtOrUnder, getComponentFile } from '@/integrations/api/instance/applications/getComponentFile';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { setComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SchedulerApp, schedulerApps } from './schedulerApps';

/** The file changed on the instance after this page read it: saving would overwrite that change. */
export class ConfigChangedError extends Error {
	constructor(file: string) {
		super(`${file} changed on the instance since this page loaded it. Refresh, then make the change again.`);
		this.name = 'ConfigChangedError';
	}
}

export interface SaveAppJobsVariables {
	app: SchedulerApp;
	/** The text the change was made against: `undefined` for an app with no config file. */
	baseText: string | undefined;
	change: (text: string | undefined) => string;
}

/**
 * Rewrites an app's config file the way the editor saves one (`set_component_file`, replicated on a cluster), after
 * checking it still holds what the change was made against. Nothing else stops two people's edits overwriting each other.
 * A new file is `config.yaml`, created only if the app still has none of the files Harper would read instead.
 */
export async function saveAppJobs(
	params: InstanceClientIdConfig & InstanceTypeConfig,
	{ app, baseText, change }: SaveAppJobsVariables,
): Promise<{ file: string }> {
	const fresh = schedulerApps(await getComponents(params)).find((candidate) => candidate.name === app.name);
	if (!fresh || fresh.configFile !== app.configFile) {
		throw new ConfigChangedError(fresh?.configFile ?? app.configFile ?? 'config.yaml');
	}
	const file = app.configFile ?? 'config.yaml';
	if (app.configFile) {
		const current = await getComponentFile({ ...params, project: app.name, file: app.configFile, encoding: 'utf8' });
		if (current.message !== baseText) {
			throw new ConfigChangedError(app.configFile);
		}
	}
	await setComponentFile({ ...params, project: app.name, file, payload: change(baseText), encoding: 'utf8' });
	return { file };
}

export function useSaveAppJobs(params: InstanceClientIdConfig & InstanceTypeConfig) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (variables: SaveAppJobsVariables) => saveAppJobs(params, variables),
		// The dialog shows the failure beside the change it refused.
		meta: { skipGlobalErrorToast: true },
		onError: (error) => {
			// Skipping the toast also skips `errorHandler`'s RUM report (AGENTS.md): keep it for anything but the refusal.
			if (!(error instanceof ConfigChangedError)) {
				console.error(error);
			}
		},
		onSettled: (_data, _error, { app }) =>
			Promise.all([
				// Only the config file: the editor may hold unsaved edits to the app's others.
				queryClient.invalidateQueries(
					componentFilesAtOrUnder(params.entityId, `${app.name}/${app.configFile ?? 'config.yaml'}`),
				),
				queryClient.invalidateQueries({ queryKey: [params.entityId, 'get_components'] }),
			]),
	});
}
