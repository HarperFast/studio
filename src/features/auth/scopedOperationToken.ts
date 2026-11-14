const SCOPED_OPERATION_SUBJECT = 'scoped-operation';

export function isScopedOperationToken(token: string | undefined): boolean {
	const payload = token?.split('.')[1];
	if (!payload) {
		return false;
	}
	try {
		return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))?.sub === SCOPED_OPERATION_SUBJECT;
	} catch {
		return false;
	}
}

export class DirectConnectionRequiredError extends Error {
	constructor(reason: 'unreachable' | 'noAddress') {
		super(
			reason === 'unreachable'
				? 'Read-only access connects straight to the instance, and this browser could not reach it. Try again from a network that can.'
				: 'Read-only access connects straight to the instance, which has no address to connect to yet.',
		);
		this.name = 'DirectConnectionRequiredError';
	}
}
