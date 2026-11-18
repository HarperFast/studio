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

export function isRestrictedConfigPath(path: string, value: any, originalValue: any): boolean {
	// If value hasn't changed, it's not "blocked" from staying the same
	if (JSON.stringify(value) === JSON.stringify(originalValue)) {
		return false;
	}

	const parts = path.split('.');
	let current: any = RESTRICTED_CONFIG;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (current === 'blocked') { return true; }
		if (current === 'blocked_except_databases') {
			return part !== 'databases';
		}
		if (typeof current === 'object' && current !== null && part in current) {
			current = current[part];
		} else {
			// Not in RESTRICTED_CONFIG, so it's allowed
			return false;
		}
	}

	return current === 'blocked';
}

/** Whether `omitRestrictedFields` drops this setting, so neither editor ever shows it. */
export function isHiddenConfigPath(path: readonly string[]): boolean {
	let current: any = RESTRICTED_CONFIG;
	for (const part of path) {
		if (current === 'blocked') { return true; }
		if (current === 'blocked_except_databases') { return part !== 'databases'; }
		if (typeof current !== 'object' || current === null || !Object.hasOwn(current, part)) { return false; }
		current = current[part];
	}
	return current === 'blocked';
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
