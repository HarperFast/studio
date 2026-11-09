/**
 * Reads, by Harper's operation naming: the restart gate holds only these (anything else is refused
 * while the entity restarts), the gateway retry replays only these, and the operations console asks
 * before sending anything else. Token minting is deliberately not one — held, it would stall a route
 * guard's Fabric Connect attempt behind a notice that cannot mount yet; refused, the guard falls
 * through to sign-in at once. `package_component` reads despite its name: it packs a project's files
 * into an archive and changes nothing.
 */
const READ_OPERATION =
	/^(?:get_|search_|describe_|list_|read_|user_info$|system_information$|cluster_status$|registration_info$|package_component$)/;

export function isReadOperation(operation: unknown): boolean {
	return typeof operation === 'string' && READ_OPERATION.test(operation);
}

export function operationOf(data: unknown): unknown {
	if (typeof data !== 'string') {
		return (data as { operation?: unknown } | undefined)?.operation;
	}
	// By the time a request has been sent, axios has serialized `config.data` in place; the operations
	// console also sends raw text.
	try {
		return (JSON.parse(data) as { operation?: unknown } | null)?.operation;
	} catch {
		return undefined;
	}
}

/**
 * Whether a request is safe to send late (the restart gate) or twice (the gateway retry); anything
 * unrecognized counts as a write. Harper and central manager's proxy take an operation only from a
 * POST body, so on any other method an `operation` field is just data.
 */
export function isReadRequest({ method, data }: { method?: unknown; data?: unknown }): boolean {
	const verb = typeof method === 'string' ? method.toLowerCase() : undefined;
	return verb === 'get' || (verb === 'post' && isReadOperation(operationOf(data)));
}
