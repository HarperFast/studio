/** A page a record step proved to be the last: it was full, and the page after it came back empty. */
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
 * Whether a last-page proof still stands under the table's count now. A count that grows retires it.
 * A count that first arrives must equal the records through the proven page, the number the probe
 * found; any other says the table changed since and may already count a record past the page. A count
 * that shrinks must not exceed them, since a stale count above them can shrink and still be above.
 * An estimate that moves proves nothing: Harper's range for it doesn't bound the live count
 * (`getRecordCount` in harper's resources/Table.ts).
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
