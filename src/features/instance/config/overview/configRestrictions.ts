export const RESTRICTED_CONFIG: Record<string, any> = {
	http: {
		port: 'blocked',
		securePort: 'blocked',
	},
	threads: 'blocked',
	authentication: {
		enableSessions: 'blocked',
	},
	logging: {
		auditLog: 'blocked',
		root: 'blocked',
		rotation: {
			path: 'blocked',
		},
	},
	mqtt: {
		network: {
			port: 'blocked',
			securePort: 'blocked',
		},
	},
	operationsApi: {
		network: {
			domainSocket: 'blocked',
			port: 'blocked',
			securePort: 'blocked',
		},
	},
	rootPath: 'blocked',
	replication: 'blocked_except_databases',
	storage: 'blocked',
	tls: 'blocked',
	node: 'blocked',
	license: 'blocked',
	componentsRoot: 'blocked',
	// Holds provider keys and Fabric's tokens, and `set_configuration` takes it only whole: the AI Models page
	// shows it without them.
	models: 'blocked',
	analytics: 'allowed',
	applications: 'allowed',
	localStudio: 'allowed',
};

const HIDDEN = Symbol('hidden');

// Harper looks a setting up without regard to case (`CONFIG_PARAM_MAP`, harper `utility/hdbTerms.ts`), so this does too.
function restrictionAt(path: readonly string[]): unknown {
	let current: unknown = RESTRICTED_CONFIG;
	for (const part of path) {
		if (current === 'blocked') { return HIDDEN; }
		if (current === 'blocked_except_databases') { return part.toLowerCase() === 'databases' ? undefined : HIDDEN; }
		const key = typeof current === 'object' && current !== null
			? Object.keys(current).find(candidate => candidate.toLowerCase() === part.toLowerCase())
			: undefined;
		if (key === undefined) { return undefined; }
		current = (current as Record<string, unknown>)[key];
	}
	return current === 'blocked' ? HIDDEN : current;
}

export function isHiddenConfigPath(path: readonly string[]): boolean {
	return restrictionAt(path) === HIDDEN;
}

export function isRestrictedConfigPath(path: string, value: any, originalValue: any): boolean {
	return JSON.stringify(value) !== JSON.stringify(originalValue) && isHiddenConfigPath(path.split('.'));
}

/** Whether `path` names a section that holds restricted settings, so replacing it whole replaces them too. */
export function holdsRestrictedSettings(path: readonly string[]): boolean {
	const node = restrictionAt(path);
	return node === 'blocked_except_databases' || (typeof node === 'object' && node !== null);
}

export function omitRestrictedFields(obj: any, schema: any = RESTRICTED_CONFIG): any {
	if (typeof obj !== 'object' || obj === null) { return obj; }

	const result = Array.isArray(obj) ? [] : {};

	for (const key in obj) {
		const value = obj[key];
		const restriction = schema?.[key];

		if (restriction === 'blocked') {
			continue;
		} else if (restriction === 'blocked_except_databases') {
			if (value && typeof value === 'object' && 'databases' in value) {
				(result as any).replication = { databases: value.databases };
			}
			continue;
		} else if (typeof restriction === 'object' && restriction !== null) {
			const sanitized = omitRestrictedFields(value, restriction);
			if (sanitized !== undefined && (typeof sanitized !== 'object' || Object.keys(sanitized).length > 0)) {
				(result as any)[key] = sanitized;
			}
		} else {
			(result as any)[key] = value;
		}
	}

	return result;
}
