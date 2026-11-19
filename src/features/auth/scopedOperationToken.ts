import type { LocalRole, LocalRolePermission, LocalUser } from '@/integrations/api/api.patch';

const SCOPED_OPERATION_SUBJECT = 'scoped-operation';

function decodeScopedClaims(token: string | undefined): { role?: { permission?: LocalRolePermission } } | undefined {
	const payload = token?.split('.')[1];
	if (!payload) {
		return undefined;
	}
	try {
		const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
		return claims?.sub === SCOPED_OPERATION_SUBJECT ? claims : undefined;
	} catch {
		return undefined;
	}
}

export function isScopedOperationToken(token: string | undefined): boolean {
	return decodeScopedClaims(token) !== undefined;
}

/** Harper's `user_info` names no role for a scoped token's holder; its allowlist is in the token the instance signed. */
export function withScopedTokenRole(user: LocalUser, token: string | undefined): LocalUser {
	if (!user || user.role) {
		return user;
	}
	const permission = decodeScopedClaims(token)?.role?.permission;
	return permission ? { ...user, role: { permission } as LocalRole } : user;
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
