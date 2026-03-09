import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCheckboxCallback } from '@/hooks/useCheckboxCallback';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { extractDomainFromTLD } from '@/lib/string/extractDomainFromTLD';
import { CopyIcon, Save } from 'lucide-react';
import { useCallback } from 'react';

export function AssociateDomainWithCluster({ cluster: { fqdn }, disabled, domain: { domain, id }, bindDomain }: {
	cluster: Cluster;
	domain: SchemaOrganizationDomain;
	bindDomain: (generateDomainCerts: boolean) => void;
	disabled: any;
}) {
	const [generateDomainCerts, onGenerateDomainCerts] = useCheckboxCallback(true);
	const recordName = extractDomainFromTLD(domain);
	const [onCopyName, onCopyTarget] = useCopyToClipboard(recordName, fqdn || '');
	const onClick = useCallback(() => bindDomain(generateDomainCerts), [bindDomain, generateDomainCerts]);

	return (
		<div className="grid gap-4 grid-cols-1 md:grid-cols-[80px_1fr] pb-6">
			<div className="text-muted-foreground md:col-span-2 text-wrap">
				This domain has been verified! Now to associate it with this cluster, add the following to your DNS registrar:
			</div>

			<div className="col-span-1">Type:</div>
			<div className="col-span-1">CNAME</div>

			<div className="col-span-1">Name:</div>
			<div className="col-span-1 flex gap-2">
				<input
					className="py-1 px-3 bg-gray-700 rounded-md w-full"
					type="text"
					readOnly={true}
					name="recordName"
					value={recordName}
					onClick={onCopyName}
				/>
				<Button type="button" size="sm" onClick={onCopyName}>
					<CopyIcon className="w-4 h-4" />
				</Button>
			</div>

			<div className="col-span-1">TTL:</div>
			<div className="col-span-1">Auto</div>

			<div className="col-span-1">Target:</div>
			<div className="col-span-1 flex gap-2">
				<input
					className="py-1 px-3 bg-gray-700 rounded-md w-full"
					type="text"
					readOnly={true}
					name="recordTarget"
					value={fqdn}
					onClick={onCopyTarget}
				/>
				<Button type="button" size="sm" onClick={onCopyTarget}>
					<CopyIcon className="w-4 h-4" />
				</Button>
			</div>

			<div className="text-muted-foreground md:col-span-2 text-wrap">
				Once you've completed the above steps, you are ready to bind the domain to this cluster. A domain can only be
				bound to a single cluster.
			</div>

			<div className="col-span-1">
				<label htmlFor="generateDomainCerts">
					Certs:
				</label>
			</div>
			<div className="col-span-1">
				<label htmlFor="generateDomainCerts" className="-m-2 p-2">
					Should we generate SSL certificates with LetsEncrypt?
					<div className="flex mt-2">
						<Switch
							id="generateDomainCerts"
							checked={generateDomainCerts}
							className="mr-2"
							onCheckedChange={onGenerateDomainCerts}
						/>
						{generateDomainCerts ? 'Yes' : 'No, I will add my own certificates, thank you very much.'}
					</div>
				</label>
			</div>

			<div className="col-span-1"></div>
			<div className="col-span-1">
				<Button
					type="button"
					variant="submit"
					data-id={id}
					onClick={onClick}
					disabled={disabled}
				>
					<Save /> Bind to This Cluster
				</Button>
			</div>
		</div>
	);
}
