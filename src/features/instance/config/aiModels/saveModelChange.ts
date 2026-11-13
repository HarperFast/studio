import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { getClusterRestartTargets } from '@/hooks/getClusterRestartTargets';
import {
	ModelKind,
	readConfiguration,
	readModelsBlock,
	setModelsBlock,
	StoredRecord,
	supportsModelsWrite,
} from '@/integrations/api/instance/models/models';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { stableJson } from '@/lib/stableJson';
import { describeError } from '@/react-query/queryClient';
import type { AxiosInstance } from 'axios';
import { isFabricManaged, KIND_LABELS, storedEntry, withModelEntry } from './modelEntries';

export interface ModelChange {
	kind: ModelKind;
	name: string;
	entry?: StoredRecord;
	loaded?: unknown;
}

export interface ModelSaveOutcome {
	saved: number;
	/** Live instances that weren't running, so were not reached. */
	notRunning: number;
}

/** A refusal Studio decided on. Its message is written for the person saving, so it is shown as it is. */
export class ModelSaveError extends Error {}

interface SaveTarget {
	instanceClient: AxiosInstance;
	label: string;
	version?: string;
}

async function planTargets(
	params: InstanceClientIdConfig & InstanceTypeConfig,
): Promise<{ targets: SaveTarget[]; notRunning: number }> {
	if (params.entityType !== 'cluster') {
		return { targets: [{ instanceClient: params.instanceClient, label: 'This instance' }], notRunning: 0 };
	}
	const { allInstances, targets } = await getClusterRestartTargets(params.entityId);
	const live = allInstances.filter((instance) =>
		!(instance.status && deletedClusterStatuses.includes(instance.status))
	);
	return {
		targets: targets.map(({ instance, instanceClient }) => ({
			instanceClient,
			label: instance.name || instance.id,
			version: instance.version,
		})),
		notRunning: live.length - targets.length,
	};
}

/** A target's version isn't always known beforehand, and an old one must stop the save before any write. */
async function readVersion(instanceClient: AxiosInstance): Promise<string | undefined> {
	const { data } = await instanceClient.post('/', { operation: 'registration_info' });
	return typeof data?.version === 'string' ? data.version : undefined;
}

/**
 * Sets or removes one model on every running instance. Harper's `set_configuration` replaces the
 * whole `models` block, and each instance's block differs (Fabric's entries point at that
 * instance's own host), so the change is merged into the block each instance holds right now and
 * written to that instance alone: never fanned out. See ./DESIGN.md.
 */
export async function saveModelChange(
	params: InstanceClientIdConfig & InstanceTypeConfig,
	change: ModelChange,
	fabricKeys: ReadonlySet<string> | undefined,
): Promise<ModelSaveOutcome> {
	const { targets, notRunning } = await planTargets(params);
	if (targets.length === 0) {
		throw new ModelSaveError('No running instance was found to save to, so nothing was changed.');
	}
	for (const target of targets) {
		target.version ??= await readVersion(target.instanceClient);
	}
	const tooOld = targets.find((target) => target.version !== undefined && !supportsModelsWrite(target.version));
	if (tooOld) {
		throw new ModelSaveError(
			`Saving a model from Studio needs Harper 5.4 or later on every instance. ${tooOld.label} runs `
				+ `${tooOld.version}, so nothing was changed.`,
		);
	}
	const described = `${KIND_LABELS[change.kind].one} model '${change.name}'`;
	let saved = 0;
	for (const target of targets) {
		try {
			const block = readModelsBlock(await readConfiguration(target));
			const current = storedEntry(block, change.kind, change.name);
			if (isFabricManaged(change.kind, change.name, current, fabricKeys)) {
				throw new ModelSaveError(`Fabric manages the ${described}, so it can't be changed here.`);
			}
			// With one instance, what the page loaded is what this instance held: a difference means
			// someone else changed it since. Across a cluster the page read whichever instance answered,
			// so a difference there may only be an instance that was behind, and the save brings it level.
			if (targets.length === 1 && stableJson(current) !== stableJson(change.loaded)) {
				if (change.loaded === undefined && change.entry !== undefined) {
					throw new ModelSaveError(
						`The ${described} was added since this page loaded. Reload the page to see it.`,
					);
				}
				throw new ModelSaveError(
					`The ${described} changed since this page loaded it. Reload the page to see it, then try again.`,
				);
			}
			if (change.entry !== undefined || current !== undefined) {
				await setModelsBlock({
					instanceClient: target.instanceClient,
					models: withModelEntry(block, change.kind, change.name, change.entry),
				});
			}
			saved += 1;
		} catch (error) {
			if (saved === 0) {
				throw error;
			}
			const reached = `Saved on ${saved} of ${targets.length} instances, then ${target.label} `;
			throw new ModelSaveError(
				isUnansweredWrite(error)
					? `${reached}didn't answer. Check whether the model changed there before you try again.`
					: `${reached}refused: ${describeError(error).message}`,
				{ cause: error },
			);
		}
	}
	return { saved, notRunning };
}
