import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AssociateDomainWithCluster } from '@/features/cluster/domains/AssociateDomainWithCluster';
import { canBindDomain } from '@/features/cluster/domains/canBindDomain';
import { CertificateProgress } from '@/features/cluster/domains/components/CertificateProgress';
import {
	isGeneratingCertificate,
	useChallengeCertificates,
} from '@/features/cluster/domains/queries/getChallengeCertificates';
import { VerifyDomainOwnership } from '@/features/cluster/domains/VerifyDomainOwnership';
import { isSettingDomainIds, useIsSettingDomainIds } from '@/features/clusters/mutations/setDomainIdsOnCluster';
import { useDeleteDomain } from '@/features/organization/mutations/deleteDomain';
import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { ColumnDef, createColumnHelper } from '@/lib/table';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

const columnHelper = createColumnHelper<SchemaOrganizationDomain>();

export function useDataTableColumns(
	cluster: Cluster,
	selectedDomainIds: string[],
	onToggleDomainSelection: (domainId: string) => void,
	onUnbindClick: (domainId: string) => void,
): Array<ColumnDef<SchemaOrganizationDomain>> {
	const { data: challengeCertificates } = useChallengeCertificates(cluster.id);
	const isGeneratingCert = useMemo(
		() => !!challengeCertificates?.some(isGeneratingCertificate),
		[challengeCertificates],
	);

	const settingDomainIds = useIsSettingDomainIds();
	const { mutate: deleteDomain, isPending: deletePending } = useDeleteDomain();
	const isPending = settingDomainIds || deletePending;
	const activeQueryClient = useQueryClient();

	const deleteDomainById = useCallback((domainId: string) => {
		// A Bind sending this domain disables Remove only once React re-renders.
		if (isSettingDomainIds(activeQueryClient)) {
			return;
		}
		deleteDomain({
			domainId: domainId,
			organizationId: cluster.organizationId,
		}, {
			onSuccess: () => {
				void activeQueryClient.invalidateQueries({
					queryKey: [cluster.organizationId, 'domains'],
					refetchType: 'active',
				});
				toast.success('Domain removed!');
			},
		});
	}, [activeQueryClient, deleteDomain, cluster.organizationId]);

	return useMemo(() => [
		columnHelper.display({
			id: 'select',
			header: 'Bind',
			size: 50,
			cell: (props) => {
				const domain = props.row.original;
				if (!canBindDomain(domain, cluster)) {
					return null;
				}
				return (
					<label className="p-10 -m-10">
						<input
							type="checkbox"
							checked={selectedDomainIds.includes(domain.id)}
							onChange={() => onToggleDomainSelection(domain.id)}
							disabled={isPending || isGeneratingCert}
						/>
					</label>
				);
			},
		}),
		columnHelper.display({
			header: 'Domains',
			id: 'domain',
			enableSorting: false,
			size: 150,
			cell: (props) => {
				const domain = props.row.original;
				return (
					<>
						<div>{domain.domain}</div>
						<Tooltip>
							{/* A disabled button takes no pointer events, so the hover has to land on a wrapper. */}
							<TooltipTrigger asChild>
								<div className="w-fit">
									<Button
										type="button"
										variant="destructiveGhost"
										className="text-muted-foreground text-xs"
										disabled={isPending || !!domain.clusterId}
										onClick={() => deleteDomainById(domain.id)}
									>
										Remove Domain
									</Button>
								</div>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								align="center"
							>
								{domain.clusterId
									? 'To delete this domain, please unbind it from all clusters first.'
									: 'Remember to clean up your DNS records!'}
							</TooltipContent>
						</Tooltip>
					</>
				);
			},
		}),
		columnHelper.display({
			header: 'Next Steps',
			enableSorting: false,
			size: 500,
			id: 'nextSteps',
			cell: (props) => {
				const domain = props.row.original;

				const certForDomain = challengeCertificates?.find((c) => c.domain === domain.domain);

				if (domain.status === 'ACTIVE' && domain.clusterId) {
					if (cluster.id === domain.clusterId) {
						return (
							<>
								<div>Bound to this cluster</div>
								{certForDomain && isGeneratingCertificate(certForDomain) && (
									<div className="py-2">
										<CertificateProgress certificate={certForDomain} domain={domain} cluster={cluster} />
									</div>
								)}
								<Button
									type="button"
									variant="destructiveGhost"
									className="text-muted-foreground text-xs"
									disabled={isPending}
									onClick={() => onUnbindClick(domain.id)}
								>
									Unbind Domain
								</Button>
							</>
						);
					} else {
						return `Bound to cluster ${domain.clusterId}`;
					}
				}

				if (domain.status === 'PENDING_VALIDATION') {
					return <VerifyDomainOwnership domain={domain} cluster={cluster} />;
				}

				if (clusterIsSelfManaged(cluster)) {
					return `Cannot be associated with this self-managed cluster.`;
				}

				if (domain.status === 'ACTIVE' && !domain.clusterId) {
					return (
						<AssociateDomainWithCluster
							cluster={cluster}
							domain={domain}
						/>
					);
				}

				// Otherwise... probably an unhandled status:
				return domain.status;
			},
		}),
	], [
		cluster,
		deleteDomainById,
		onUnbindClick,
		isPending,
		challengeCertificates,
		isGeneratingCert,
		selectedDomainIds,
		onToggleDomainSelection,
	]);
}
