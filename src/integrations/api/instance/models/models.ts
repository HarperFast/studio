/**
 * Harper's AI model settings: the `models` block of the root config and the `/v1` API switch.
 * What Harper accepts, from which release, and why a save is a per-instance read-modify-write:
 * src/features/instance/config/aiModels/DESIGN.md.
 */
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/** The first tag with the `models` block and `@embed` (harper `resources/models/bootstrap.ts`). */
const MODELS_MIN_VERSION = '5.1.0-beta.1';
/** The first tag with the `/v1` API (harper `resources/models/v1/index.ts`). 5.2.0 shipped without it. */
const MODELS_GATEWAY_MIN_VERSION = '5.2.1';
/** The first tag with decision models and `@decide` (harper `resources/models/decideHook.ts`). */
const DECISION_MODELS_MIN_VERSION = '5.3.0-beta.4';
/** The first tag whose `set_configuration` takes `models` (HarperFast/harper#3205). 5.3 refuses the name. */
const MODELS_WRITE_MIN_VERSION = '5.4.0-alpha.1';

function atLeast(floor: string, version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(floor, version);
}

export const supportsModels = (version: string | undefined) => atLeast(MODELS_MIN_VERSION, version);
export const supportsModelsGateway = (version: string | undefined) => atLeast(MODELS_GATEWAY_MIN_VERSION, version);
export const supportsDecisionModels = (version: string | undefined) => atLeast(DECISION_MODELS_MIN_VERSION, version);
export const supportsModelsWrite = (version: string | undefined) => atLeast(MODELS_WRITE_MIN_VERSION, version);

/**
 * Whether Fabric keeps a customer's own entries. Until HarperFast/host-manager#279 is deployed, host
 * manager replaces the whole block on its next pass, so a model added from Studio would vanish.
 * Turn this on once that fix runs on every Fabric host.
 */
export const FABRIC_KEEPS_CUSTOMER_MODELS: boolean = false;

export const MODEL_KINDS = ['embedding', 'generative', 'decision'] as const;
export type ModelKind = typeof MODEL_KINDS[number];

/** A stored entry, or a whole block, as Harper returned it. Nothing about its shape is assumed. */
export type StoredRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is StoredRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `models` block of a `get_configuration` answer, when it is one. */
export function readModelsBlock(configuration: unknown): StoredRecord | undefined {
	const models = isRecord(configuration) ? configuration.models : undefined;
	return isRecord(models) ? models : undefined;
}

/** The names apps and schema directives can refer to, for each kind a directive uses. */
export interface InstanceModelNames {
	embedding: string[];
	decision: string[];
}

/** The model names in a `get_configuration` answer. */
export function instanceModelNames(configuration: unknown): InstanceModelNames {
	const block = readModelsBlock(configuration);
	const names = (kind: ModelKind) => {
		const entries = block?.[kind];
		return isRecord(entries) ? Object.keys(entries) : [];
	};
	return { embedding: names('embedding'), decision: names('decision') };
}

/** Whether `modelsGateway.enabled` is on in a `get_configuration` answer. */
export function modelsGatewayEnabled(configuration: unknown): boolean {
	const gateway = isRecord(configuration) ? configuration.modelsGateway : undefined;
	return isRecord(gateway) && gateway.enabled === true;
}

/** Whether the root config itself turns on REST, which is what serves `/v1`. */
export function rootConfigServesRest(configuration: unknown): boolean {
	return isRecord(configuration) && (!!configuration.rest || !!configuration.REST);
}

/**
 * Where a Local Studio instance serves REST: its own host, on the HTTP port its config names. The
 * operations address Studio talks to is a different port, so it can't stand in for this one.
 */
export function localRestUrl(configuration: unknown, operationsUrl: string | undefined): string | undefined {
	const http = isRecord(configuration) && isRecord(configuration.http) ? configuration.http : undefined;
	const secure = typeof http?.securePort === 'number';
	const port = secure ? http?.securePort : http?.port;
	if (typeof port !== 'number') {
		return undefined;
	}
	try {
		// Local Studio served by Harper itself talks to a relative address, so resolve it against the page.
		const page = typeof window === 'undefined' ? undefined : window.location.href;
		const { hostname } = new URL(operationsUrl ?? '', page);
		return `${secure ? 'https' : 'http'}://${hostname}:${port}`;
	} catch {
		return undefined;
	}
}

/** One instance's whole configuration, read fresh: a save must merge into what the instance holds now. */
export async function readConfiguration({ instanceClient }: InstanceClientConfig): Promise<unknown> {
	const { data } = await instanceClient.post('/', { operation: 'get_configuration' });
	return data;
}

/** Replaces the instance's whole `models` block. Harper reloads it from the file without a restart. */
export async function setModelsBlock(
	{ instanceClient, models }: InstanceClientConfig & { models: StoredRecord },
): Promise<void> {
	await instanceClient.post('/', { operation: 'set_configuration', models });
}
