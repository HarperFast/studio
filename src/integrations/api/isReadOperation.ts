/**
 * Reads, by Harper's operation naming: the restart gate holds only these (anything else is refused
 * while the entity restarts), and the operations console asks before sending anything else. Token
 * minting is deliberately not one — held, it would stall a route guard's Fabric Connect attempt behind
 * a notice that cannot mount yet; refused, the guard falls through to sign-in at once.
 */
const READ_OPERATION =
	/^(?:get_|search_|describe_|list_|read_|user_info$|system_information$|cluster_status$|registration_info$)/;

export function isReadOperation(operation: unknown): boolean {
	return typeof operation === 'string' && READ_OPERATION.test(operation);
}
