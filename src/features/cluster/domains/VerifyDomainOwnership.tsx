import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { CopyIcon } from 'lucide-react';

export function VerifyDomainOwnership(
	{ domain: { challengeToken, challengeTxtRecord } }: { domain: SchemaOrganizationDomain },
) {
	const [onCopyTxtRecord, onCopyToken] = useCopyToClipboard(challengeTxtRecord, challengeToken);

	return (
		<div className="grid gap-2 grid-cols-1 md:grid-cols-[80px_1fr] pb-6">
			<div className="text-muted-foreground md:col-span-2 text-wrap">
				Prove that you own this domain by adding the following to your DNS registrar:
			</div>

			<div className="col-span-1">Type:</div>
			<div className="col-span-1">TXT</div>

			<div className="col-span-1">Name:</div>
			<div className="col-span-1 flex gap-2">
				<input
					className="py-1 px-3 bg-gray-700 rounded-md w-full"
					type="text"
					readOnly={true}
					name="challengeName"
					value={challengeTxtRecord}
					onClick={onCopyTxtRecord}
				/>
				<Button type="button" size="sm" onClick={onCopyTxtRecord}>
					<CopyIcon className="w-4 h-4" />
				</Button>
			</div>

			<div className="col-span-1">TTL:</div>
			<div className="col-span-1">Auto</div>

			<div className="col-span-1">Content:</div>
			<div className="col-span-1 flex gap-2">
				<input
					className="py-1 px-3 bg-gray-700 rounded-md w-full"
					type="text"
					readOnly={true}
					name="challengeToken"
					value={challengeToken}
					onClick={onCopyToken}
				/>
				<Button type="button" size="sm" onClick={onCopyToken}>
					<CopyIcon className="w-4 h-4" />
				</Button>
			</div>

			<div className="text-muted-foreground md:col-span-2 text-wrap">
				Then after your DNS TTL elapses, click the "Validate" button above.
			</div>
		</div>
	);
}
