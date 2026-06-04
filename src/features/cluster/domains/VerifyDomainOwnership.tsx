import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { extractDomainFromTLD } from '@/lib/string/extractDomainFromTLD';
import { CopyIcon } from 'lucide-react';

export function VerifyDomainOwnership(
	{ domain: { challengeToken, challengeTxtRecord, domain, id }, cluster: { fqdn } }: {
		domain: SchemaOrganizationDomain;
		cluster: Cluster;
	},
) {
	const recordName = extractDomainFromTLD(domain);
	const [onCopyTxtRecord, onCopyToken, onCopyName, onCopyTarget, onCopyId] = useCopyToClipboard(
		challengeTxtRecord,
		challengeToken,
		recordName,
		fqdn || '',
		id,
	);

	return (
		<div className="grid gap-2 grid-cols-1 md:grid-cols-[80px_1fr] pb-6">
			<div className="text-muted-foreground md:col-span-2 text-wrap">
				Prove that you own this domain by adding the following to your DNS registrar:
			</div>

			<div className="col-span-1">Type:</div>
			<div className="col-span-1">TXT</div>

			<div className="col-span-1">Name:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-muted rounded-md px-3 py-1 flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="challengeName"
						value={challengeTxtRecord}
						onClick={onCopyTxtRecord}
					/>
					<Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onCopyTxtRecord}>
						<CopyIcon className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<div className="col-span-1">TTL:</div>
			<div className="col-span-1">Auto</div>

			<div className="col-span-1">Content:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-muted rounded-md px-3 py-1 flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="challengeToken"
						value={challengeToken}
						onClick={onCopyToken}
					/>
					<Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onCopyToken}>
						<CopyIcon className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<div className="text-muted-foreground md:col-span-2 text-wrap mt-4">
				While you're at it, you should also add the CNAME record to point to this cluster:
			</div>

			<div className="col-span-1">Type:</div>
			<div className="col-span-1">CNAME</div>

			<div className="col-span-1">Name:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-muted rounded-md px-3 py-1 flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="recordName"
						value={recordName}
						onClick={onCopyName}
					/>
					<Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onCopyName}>
						<CopyIcon className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<div className="col-span-1">TTL:</div>
			<div className="col-span-1">Auto</div>

			<div className="col-span-1">Target:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-muted rounded-md px-3 py-1 flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="recordTarget"
						value={fqdn}
						onClick={onCopyTarget}
					/>
					<Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onCopyTarget}>
						<CopyIcon className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<div className="col-span-1 text-xs">Domain ID:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-muted rounded-md px-3 py-0.5 text-xs text-muted-foreground italic flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="domainId"
						value={id}
						onClick={onCopyId}
					/>
					<Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0" onClick={onCopyId}>
						<CopyIcon className="w-3 h-3" />
					</Button>
				</div>
			</div>

			<div className="text-muted-foreground md:col-span-2 text-wrap mt-2">
				Then after your DNS TTL elapses, click the "Validate" button above.
			</div>
		</div>
	);
}
