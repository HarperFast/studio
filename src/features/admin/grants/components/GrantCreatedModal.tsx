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
 * Confirms a created grant and hands over its id. The id is generated server-side and is the only
 * handle on an unbound voucher — nothing else identifies it until a cluster claims it — so it is
 * shown for copying rather than announced in a toast that disappears.
 */
export function GrantCreatedModal({
	grant,
	onOpenChange,
}: {
	grant: AdminClusterGrant | null;
	onOpenChange: (open: boolean) => void;
}) {
	const copy = useCopyTextToClipboard();

	return (
		<Dialog open={!!grant} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogTitle>Grant created</DialogTitle>
				<DialogDescription>
					{grant?.clusterId
						? `Applies now to ${grant.clusterId}.`
						: 'Held unbound until this organization creates a cluster, which claims it.'}
				</DialogDescription>

				<div className="flex items-center gap-2 rounded-md border bg-muted/60 p-2">
					<code className="flex-1 truncate font-mono text-sm" data-testid="created-grant-id">{grant?.id}</code>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Copy grant id"
						className="size-7 shrink-0"
						onClick={() => grant && copy(grant.id)}
					>
						<CopyIcon className="size-3.5" />
					</Button>
				</div>

				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt className="text-muted-foreground">Organization</dt>
					<dd className="truncate">{grant?.organizationId}</dd>
					<dt className="text-muted-foreground">Source</dt>
					<dd>{grant?.source}</dd>
					<dt className="text-muted-foreground">Ends</dt>
					<dd>{fmt(grant?.endsAt)}</dd>
					<dt className="text-muted-foreground">Expiry policy</dt>
					<dd>{grant?.expiryPolicy ?? 'none'}</dd>
				</dl>

				<DialogFooter>
					<Button type="button" variant="submit" onClick={() => onOpenChange(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
