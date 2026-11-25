/** A page a record step proved to be the last: it was full, and the page after it came back empty. */
export interface LastPageProof {
	pageIndex: number;
	/** The table's count when the step set out, or undefined if it hadn't loaded yet. */
	totalRecords: number | undefined;
}

export interface TableCount {
	totalRecords: number | undefined;
	isEstimated: boolean;
}

/**
 * Whether a last-page proof still stands under the table's count now (#1940, #1963).
 *
 * An unchanged count keeps it, and a count that grows retires it. A count that first arrives, or
 * shrinks, keeps it only when it is exact and leaves no room for a record past the proven page:
 * - First arriving, it must equal the records through that page, which is what the probe found (a full
 *   page and nothing after it). Any other count says the table changed since the probe, and may
 *   already count a record past the page.
 * - Shrinking, it must not exceed them. A count that was already above them when the step set out (a
 *   stale one) can shrink and still have records past the page.
 *
 * An estimate that moves proves nothing either way: Harper's own range for it is not a bound on the
 * live count (`getRecordCount` in harper's resources/Table.ts).
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
