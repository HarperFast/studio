import { Button } from '@/components/ui/button';
import { ChallengeCertificate } from '@/features/cluster/domains/queries/getChallengeCertificates';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { extractDomainFromTLD } from '@/lib/string/extractDomainFromTLD';
import { CopyIcon } from 'lucide-react';
import { useMemo } from 'react';

export function CertificateProgress({
	certificate,
	domain,
	cluster,
}: {
	certificate: ChallengeCertificate;
	domain: SchemaOrganizationDomain;
	cluster: Cluster;
}) {
	const recordName = extractDomainFromTLD(domain.domain);
	const [onCopyName, onCopyTarget, onCopyId] = useCopyToClipboard(
		recordName,
		cluster.fqdn || '',
		domain.id,
	);

	const progress = useMemo(() => {
		if (certificate.issueDate && !certificate.inProgress) {
			return {
				width: '100%',
				color: 'bg-green/80',
				pulse: false,
				text: 'Certificate Issued',
			};
		}
		if (certificate.inProgress) {
			return {
				width: '100%',
				color: 'bg-yellow/80',
				pulse: true,
				text: 'Generating Certificate...',
			};
		}
		// If neither issueDate nor inProgress, it's pending
		return {
			width: '100%',
			color: 'bg-gray-600',
			pulse: false,
			text: 'Pending Certificate Generation...',
		};
	}, [certificate]);

	return (
		<div className="w-full max-w-2xl border border-border/50 rounded-md p-4 bg-gray-900/20">
			<div className="mb-4">
				<div className="w-full h-1.5 rounded-full overflow-clip flex shadow-sm bg-gray-800">
					<div
						style={{ width: progress.width }}
						className={`grow transition-[width] duration-1000 ease-in-out motion-reduce:transition-none ${progress.color} ${
							progress.pulse ? 'animate-pulse' : ''
						}`}
					>
					</div>
				</div>
				<div className="text-[10px] text-muted-foreground font-light mt-1 italic">{progress.text}</div>
			</div>

			<div className="grid gap-2 grid-cols-1 md:grid-cols-[80px_1fr] text-sm">
				<div className="col-span-1 text-xs text-muted-foreground">CNAME:</div>
				<div className="col-span-1 flex gap-2 items-center flex-wrap">
					<div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs">
						<span className="truncate max-w-[150px]" title={recordName}>
							{recordName}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-4 w-4 p-0"
							onClick={onCopyName}
							title="Copy Name"
						>
							<CopyIcon className="w-3 h-3" />
						</Button>
					</div>
					<ArrowIcon />
					<div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs">
						<span className="truncate max-w-[200px]" title={cluster.fqdn || ''}>
							{cluster.fqdn}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-4 w-4 p-0"
							onClick={onCopyTarget}
							title="Copy Target"
						>
							<CopyIcon className="w-3 h-3" />
						</Button>
					</div>
				</div>

				<div className="col-span-1 text-[10px] text-muted-foreground">Domain ID:</div>
				<div className="col-span-1 flex gap-2 items-center">
					<div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-[10px] text-muted-foreground italic">
						<span className="truncate max-w-[200px]">{domain.id}</span>
						<Button type="button" variant="ghost" size="sm" className="h-3 w-3 p-0" onClick={onCopyId} title="Copy ID">
							<CopyIcon className="w-2.5 h-2.5" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function ArrowIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="w-3 h-3 text-muted-foreground"
		>
			<path d="M5 12h14" />
			<path d="m12 5 7 7-7 7" />
		</svg>
	);
}
