import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { extractDomainFromTLD } from '@/lib/string/extractDomainFromTLD';
import { CopyIcon } from 'lucide-react';

export function AssociateDomainWithCluster({ cluster: { fqdn }, domain: { domain, id } }: {
	cluster: Cluster;
	domain: SchemaOrganizationDomain;
}) {
	const recordName = extractDomainFromTLD(domain);
	const [onCopyName, onCopyTarget, onCopyId] = useCopyToClipboard(recordName, fqdn || '', id);

	return (
		<div className="grid gap-4 grid-cols-1 md:grid-cols-[80px_1fr] pb-6">
			<div className="text-muted-foreground md:col-span-2 text-wrap">
				This domain has been verified! Now to associate it with this cluster, add the following to your DNS registrar:
			</div>

			<div className="col-span-1">Type:</div>
			<div className="col-span-1">CNAME</div>

			<div className="col-span-1">Name:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-gray-700 rounded-md px-3 py-1 flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="recordName"
						value={recordName}
						onClick={onCopyName}
					/>
					<Button type="button" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onCopyName}>
						<CopyIcon className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<div className="col-span-1">TTL:</div>
			<div className="col-span-1">Auto</div>

			<div className="col-span-1">Target:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-gray-700 rounded-md px-3 py-1 flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="recordTarget"
						value={fqdn}
						onClick={onCopyTarget}
					/>
					<Button type="button" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onCopyTarget}>
						<CopyIcon className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<div className="col-span-1 text-xs">Domain ID:</div>
			<div className="col-span-1 flex gap-2 items-center">
				<div className="flex items-center gap-1 bg-gray-800 rounded-md px-3 py-0.5 text-xs text-muted-foreground italic flex-1 overflow-hidden">
					<input
						className="bg-transparent border-none outline-none w-full cursor-text truncate"
						type="text"
						readOnly={true}
						name="domainId"
						value={id}
						onClick={onCopyId}
					/>
					<Button type="button" variant="ghost" className="h-5 w-5 p-0 shrink-0" onClick={onCopyId}>
						<CopyIcon className="w-3 h-3" />
					</Button>
				</div>
			</div>

			<div className="text-muted-foreground md:col-span-2 text-wrap italic text-sm">
				Select this domain using the checkbox to the left, then click "Bind" in the top right to finish associating it
				with this cluster.
			</div>
		</div>
	);
}
