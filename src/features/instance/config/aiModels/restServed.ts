import { APP_CONFIG_FILES } from '@/features/instance/config/scheduledJobs/jobsConfig';
import { APIDirectoryEntry, APIFileEntry } from '@/integrations/api/instance/applications/getComponents';
import { isRecord } from '@/integrations/api/instance/models/models';
import { parse } from 'yaml';

interface RestApp {
	name: string;
	/** Absent when the app has no config file. */
	configFile?: string;
}

function isDirectory(entry: APIDirectoryEntry | APIFileEntry): entry is APIDirectoryEntry {
	return Array.isArray((entry as APIDirectoryEntry).entries);
}

/** Each deployed app and the config file Harper reads for it, in Harper's own order of preference. */
export function restApps(tree: APIDirectoryEntry | undefined): RestApp[] {
	return (tree?.entries ?? []).filter(isDirectory).map((app) => {
		const files = new Set(app.entries.filter((entry) => !isDirectory(entry)).map((entry) => entry.name));
		return { name: app.name, configFile: APP_CONFIG_FILES.find((file) => files.has(file)) };
	});
}

/**
 * Whether any app turns on REST. An app with no config file gets Harper's default config, which has
 * `rest: true` (harper `components/DEFAULT_CONFIG.ts`); one with a config file turns it on only by
 * naming `rest`. `configTexts` holds each config file read so far, keyed by app name. The answer is
 * undefined while a file that could decide it is unread or unreadable, so a warning is never shown
 * on a guess.
 */
export function appsServeRest(apps: readonly RestApp[], configTexts: ReadonlyMap<string, string>): boolean | undefined {
	let undecided = false;
	for (const app of apps) {
		if (!app.configFile) {
			return true;
		}
		const text = configTexts.get(app.name);
		if (text === undefined) {
			undecided = true;
			continue;
		}
		try {
			const config: unknown = parse(text);
			if (isRecord(config) && (config.rest || config.REST)) {
				return true;
			}
		} catch {
			undecided = true;
		}
	}
	return undecided ? undefined : false;
}
