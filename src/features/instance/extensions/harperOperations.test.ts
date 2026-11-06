import { HARPER_OPERATIONS } from '@/features/instance/extensions/harperOperations';
import { describe, expect, it } from 'vitest';

describe('HARPER_OPERATIONS', () => {
	// Newer than the roles editor's catalog, the only other list the access tests hold this one to.
	it.each(['get_studio_configuration', 'set_network_access', 'get_network_access', 'get_agent_config'])(
		'holds %s, so a page cannot claim it as its own component operation',
		(operation) => {
			expect(HARPER_OPERATIONS.has(operation)).toBe(true);
		},
	);
});
