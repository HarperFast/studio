export const activeClusterStatuses = ['RUNNING'];
export const deletedClusterStatuses = ['TERMINATING', 'TERMINATED', 'REMOVED'];

export function isDeletedClusterStatus(status: string | undefined): boolean {
	return !!status && deletedClusterStatuses.includes(status);
}
