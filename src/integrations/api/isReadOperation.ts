/**
 * Reads, by Harper's operation naming: the restart gate holds only these (anything else is refused
 * while the entity restarts), the gateway retry replays only these, and the operations console asks
 * before sending anything else. Token minting is deliberately not one — held, it would stall a route
 * guard's Fabric Connect attempt behind a notice that cannot mount yet; refused, the guard falls
 * through to sign-in at once.
 */
const READ_OPERATION =
	/^(?:get_|search_|describe_|list_|read_|user_info$|system_information$|cluster_status$|registration_info$)/;

export function isReadOperation(operation: unknown): boolean {
	return typeof operation === 'string' && READ_OPERATION.test(operation);
}

function operationOf(data: unknown): unknown {
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
 * A GET, or an operations-API body naming a read. Only these are safe to send late (the restart gate)
 * or twice (the gateway retry); anything unrecognized counts as a write.
 */
export function isReadRequest({ method, data }: { method?: unknown; data?: unknown }): boolean {
	return (typeof method === 'string' && method.toLowerCase() === 'get') || isReadOperation(operationOf(data));
}
