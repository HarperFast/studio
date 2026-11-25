export interface LastPageProof {
	pageIndex: number;
	/** The last count the proof held under, or undefined while none has loaded. */
	totalRecords: number | undefined;
}

interface TableCount {
	totalRecords: number | undefined;
	isEstimated: boolean;
}

/**
 * The rule and its reasons are in the databases DESIGN.md. An arriving count must match what the probe
 * saw, a full page and nothing after it, so one that differs at all costs a fresh probe. An estimate
 * that moves never holds: Harper's range for it doesn't bound the live count (`getRecordCount` in
 * harper's resources/Table.ts).
 */
export function lastPageProofHolds(proof: LastPageProof, count: TableCount, pageSize: number): boolean {
	if (count.totalRecords === proof.totalRecords) {
		return true;
	}
	if (count.totalRecords === undefined || count.isEstimated) {
		return false;
	}
	const recordsThroughPage = (proof.pageIndex + 1) * pageSize;
	if (proof.totalRecords === undefined) {
		return count.totalRecords === recordsThroughPage;
	}
	return count.totalRecords < proof.totalRecords && count.totalRecords <= recordsThroughPage;
}
