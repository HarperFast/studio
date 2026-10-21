import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StaffUserLabel } from '@/features/admin/apiToken/components/StaffUserLabel';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { MintedStaffApiToken } from '@/integrations/api/api.patch';
import { CopyIcon } from 'lucide-react';

interface MintedTokenCardProps {
	token: MintedStaffApiToken;
	selfId: string;
	onDismiss: () => void;
}

export function MintedTokenCard({ token, selfId, onDismiss }: MintedTokenCardProps) {
	const copyText = useCopyTextToClipboard();

	return (
		<Card className="border-green">
			<CardHeader>
				<CardTitle>Token “{token.name}” minted</CardTitle>
				<CardDescription>
					Copy it now — it won't be shown again. It acts as{' '}
					<StaffUserLabel userId={token.ownerUserId} selfId={selfId} /> as {token.role} and expires{' '}
					{new Date(token.expiresAt).toLocaleString()}.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center gap-2">
				<Input
					readOnly
					aria-label="API token"
					value={token.operationToken}
					className="font-mono text-xs"
					onClick={() => copyText(token.operationToken)}
				/>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="shrink-0"
					aria-label="Copy token"
					onClick={() => copyText(token.operationToken)}
				>
					<CopyIcon />
				</Button>
			</CardContent>
			<CardFooter className="justify-between gap-4">
				<p className="text-sm text-muted-foreground">
					Send it as a bearer token:{' '}
					<code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>
				</p>
				<Button type="button" variant="outline" onClick={onDismiss}>
					Done
				</Button>
			</CardFooter>
		</Card>
	);
}
