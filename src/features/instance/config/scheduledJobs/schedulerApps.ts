import { isProtectedComponentPackage } from '@/features/instance/applications/context/isProtectedComponentPackage';
import { APIDirectoryEntry, APIFileEntry } from '@/integrations/api/instance/applications/getComponents';
import { APP_CONFIG_FILES } from './jobsConfig';

export interface SchedulerApp {
	name: string;
	configFile?: string;
	files: ReadonlySet<string>;
	readOnly?: string;
	schedulerFailed: boolean;
}

function isDirectory(entry: APIDirectoryEntry | APIFileEntry): entry is APIDirectoryEntry {
	return Array.isArray((entry as APIDirectoryEntry).entries);
}

function collectFiles(entry: APIDirectoryEntry, prefix: string, into: Set<string>) {
	for (const child of entry.entries) {
		const path = prefix ? `${prefix}/${child.name}` : child.name;
		if (isDirectory(child)) {
			collectFiles(child, path, into);
		} else {
			into.add(path);
		}
	}
}

function readOnlyReason(entry: APIDirectoryEntry): string | undefined {
	if (entry.preview) {
		return 'A pull request preview: its next deploy replaces its config.';
	}
	if (isProtectedComponentPackage(entry.package)) {
		return 'Managed by the platform.';
	}
	if (entry.package) {
		return `Deployed from ${entry.package}: its next deploy replaces its config, so change its jobs in its source.`;
	}
	return undefined;
}

export function schedulerApps(tree: APIDirectoryEntry | undefined): SchedulerApp[] {
	if (!tree) {
		return [];
	}
	return tree.entries
		.filter(isDirectory)
		.map((entry) => {
			const files = new Set<string>();
			collectFiles(entry, '', files);
			const scheduler = entry.status?.details?.[`${entry.name}.scheduler`];
			return {
				name: entry.name,
				configFile: APP_CONFIG_FILES.find((file) => files.has(file)),
				files,
				readOnly: readOnlyReason(entry),
				schedulerFailed: scheduler?.status === 'error',
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}
