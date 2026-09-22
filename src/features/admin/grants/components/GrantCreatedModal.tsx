import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { CopyIcon } from 'lucide-react';

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmt = (iso: string | null | undefined) => {
	if (!iso) { return 'never'; }
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? 'never' : dateFmt.format(at);
};

/**
 * Confirms created grants and hands over their ids. The ids are generated server-side and are the
 * only handle on an unbound voucher — nothing else identifies it until a cluster claims it — so they
 * are shown for copying rather than announced in a toast that disappears. A batch shares every term
 * but the id, so the terms are shown once and the ids listed.
 */
export function GrantCreatedModal({
	grants,
	onOpenChange,
}: {
	grants: AdminClusterGrant[] | null;
	onOpenChange: (open: boolean) => void;
}) {
	const copy = useCopyTextToClipboard();
	const first = grants?.[0];
	const batch = (grants?.length ?? 0) > 1;

	return (
		<Dialog open={!!first} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogTitle>{batch ? `${grants?.length} grants created` : 'Grant created'}</DialogTitle>
				<DialogDescription>
					{first?.clusterId
						? `Applies now to ${first.clusterId}.`
						: batch
						? 'Held unbound until this organization creates clusters, each of which claims one.'
						: 'Held unbound until this organization creates a cluster, which claims it.'}
				</DialogDescription>

				<div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
					{grants?.map((grant) => (
						<div key={grant.id} className="flex items-center gap-2 rounded-md border bg-muted/60 p-2">
							<code className="flex-1 truncate font-mono text-sm" data-testid="created-grant-id">{grant.id}</code>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={batch ? `Copy grant id ${grant.id}` : 'Copy grant id'}
								className="size-7 shrink-0"
								onClick={() =>
									copy(grant.id)}
							>
								<CopyIcon className="size-3.5" />
							</Button>
						</div>
					))}
				</div>
				{batch && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="self-start"
						onClick={() => grants && copy(grants.map((grant) => grant.id).join('\n'))}
					>
						Copy all ids
					</Button>
				)}

				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt className="text-muted-foreground">Organization</dt>
					<dd className="truncate">{first?.organizationId}</dd>
					<dt className="text-muted-foreground">Source</dt>
					<dd>{first?.source}</dd>
					<dt className="text-muted-foreground">Ends</dt>
					<dd>{fmt(first?.endsAt)}</dd>
					<dt className="text-muted-foreground">Expiry policy</dt>
					<dd>{first?.expiryPolicy ?? 'none'}</dd>
				</dl>

				<DialogFooter>
					<Button type="button" variant="submit" onClick={() => onOpenChange(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
