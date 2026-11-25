import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
	clusterPolicySearchQueryOptions,
	ClusterPolicySearchResult,
} from '@/features/admin/monitoring/monitoringPolicyApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@tanstack/react-query';
import { ReactNode, useId, useState } from 'react';

/**
 * Find a live cluster by name or by its id through central manager's cluster search (needs cluster:read). Shared by
 * Monitoring's policy dialog and the Agent page's start dialog; `trailing` adds a per-match detail on the right.
 */
export function ClusterSearch({ onPick, trailing }: {
	onPick: (match: ClusterPolicySearchResult) => void;
	trailing?: (match: ClusterPolicySearchResult) => ReactNode;
}) {
	const [term, setTerm] = useState('');
	const id = useId();
	const debounced = useDebounce(term.trim(), 300);
	const { data, isFetching, isError } = useQuery(clusterPolicySearchQueryOptions(debounced));

	return (
		<div className="space-y-3">
			<div className="space-y-2">
				<Label htmlFor={id}>Cluster</Label>
				<Input
					id={id}
					autoFocus
					autoComplete="off"
					placeholder="perf-cluster or clu-…"
					value={term}
					onChange={(event) => setTerm(event.target.value)}
				/>
			</div>
			{debounced && (
				<div className="max-h-72 overflow-y-auto rounded-md border">
					{isFetching && !data
						? <Skeleton className="h-16 w-full" />
						: isError
						? <p className="p-3 text-sm text-muted-foreground">Search failed.</p>
						: data?.length
						? (
							<ul aria-label="Matching clusters">
								{data.map((match) => (
									<li key={match.clusterId}>
										<button
											type="button"
											className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/30"
											onClick={() => onPick(match)}
										>
											<span className="min-w-0">
												<span className="block truncate">{match.clusterName}</span>
												<span className="block truncate text-xs text-muted-foreground">
													{match.organizationName} · {match.clusterId}
													{match.clusterStatus ? ` · ${match.clusterStatus}` : ''}
												</span>
											</span>
											{trailing?.(match)}
										</button>
									</li>
								))}
							</ul>
						)
						: <p className="p-3 text-sm text-muted-foreground">No live cluster matches “{debounced}”.</p>}
				</div>
			)}
		</div>
	);
}
