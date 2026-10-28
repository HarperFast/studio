import { BranchedDatabases } from '@/integrations/api/instance/applications/branchedDatabases';

export type PrivateCopyMode = 'off' | 'all' | 'chosen';

/** `databases` survives switching modes, so a choice isn't lost to a misclick. */
export interface PrivateCopyValue {
	mode: PrivateCopyMode;
	databases: string[];
}

export const PRIVATE_COPY_OFF: PrivateCopyValue = { mode: 'off', databases: [] };

export function privateCopyFromSetting(setting: BranchedDatabases | undefined): PrivateCopyValue {
	if (setting === undefined) {
		return PRIVATE_COPY_OFF;
	}
	return setting === true ? { mode: 'all', databases: [] } : { mode: 'chosen', databases: [...setting] };
}

/** What to send as `branchedDatabases`: `undefined` leaves it out of the deploy, which turns the copy off. */
export function privateCopyToSetting(value: PrivateCopyValue): BranchedDatabases | undefined {
	if (value.mode === 'all') {
		return true;
	}
	if (value.mode === 'chosen' && value.databases.length) {
		return value.databases;
	}
	return undefined;
}

/** Choosing no databases would deploy with the copy off, the opposite of what was asked, so it can't be submitted. */
export function privateCopyError(value: PrivateCopyValue): string | undefined {
	return value.mode === 'chosen' && !value.databases.length ? 'Choose at least one database.' : undefined;
}
