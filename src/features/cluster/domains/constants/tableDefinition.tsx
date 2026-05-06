import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isRunning } from '@/components/ui/utils/badgeStatus';
import { AssociateDomainWithCluster } from '@/features/cluster/domains/AssociateDomainWithCluster';
import { CertificateProgress } from '@/features/cluster/domains/components/CertificateProgress';
import { useChallengeCertificates } from '@/features/cluster/domains/queries/getChallengeCertificates';
import { VerifyDomainOwnership } from '@/features/cluster/domains/VerifyDomainOwnership';
import { useSetDomainIdsOnCluster } from '@/features/clusters/mutations/setDomainIdsOnCluster';
import { useDeleteDomain } from '@/features/organization/mutations/deleteDomain';
import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { unique } from '@/lib/arrays/unique';
import { queryClient } from '@/react-query/queryClient';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

const columnHelper = createColumnHelper<SchemaOrganizationDomain>();

export function useDataTableColumns(
	cluster: Cluster,
	selectedDomainIds: string[],
	onToggleDomainSelection: (domainId: string) => void,
): Array<ColumnDef<SchemaOrganizationDomain>> {
	const { data: challengeCertificates } = useChallengeCertificates(cluster.id);
	const isGeneratingCert = useMemo(
		() => !!challengeCertificates?.some((cert) => !cert.issueDate || cert.inProgress),
		[challengeCertificates],
	);

	const { mutate: setDomainIds, isPending: addPending } = useSetDomainIdsOnCluster();
	const { mutate: deleteDomain, isPending: deletePending } = useDeleteDomain();
	const isPending = addPending || deletePending;

	const bindDomainToThisCluster = useCallback((domainId: string, generateDomainCerts: boolean) => {
		if (!isRunning(cluster.status)) {
			toast.error('Cluster is currently ' + cluster.status, { description: 'To bind a domain, it must be running.' });
			return;
		}
		setDomainIds({
			clusterId: cluster.id,
			domainIds: unique((cluster.domainIds?.slice() || []).concat([domainId])),
			generateDomainCerts,
		}, {
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: [cluster.organizationId], refetchType: 'active' });
				toast.success(
					'Domain bound!' + (generateDomainCerts
						? ' Certificates are being generated in the background now.'
						: ''),
				);
			},
		});
	}, [setDomainIds, cluster]);

	const deleteDomainById = useCallback((domainId: string) => {
		deleteDomain({
			domainId: domainId,
		}, {
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: [cluster.organizationId, 'domains'], refetchType: 'active' });
				toast.success('Domain removed!');
			},
		});
	}, [deleteDomain]);

	const unbindDomainById = useCallback((domainId: string) => {
		setDomainIds({
			clusterId: cluster.id,
			domainIds: (cluster.domainIds?.slice() || []).filter((id) => id !== domainId),
			generateDomainCerts: false,
		}, {
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: [cluster.organizationId], refetchType: 'active' });
				toast.success('Domain unbound!');
			},
		});
	}, [deleteDomain]);

	return useMemo(() => [
		columnHelper.display({
			id: 'select',
			header: 'Bind',
			size: 50,
			cell: (props) => {
				const domain = props.row.original;
				const canBind = domain.status === 'ACTIVE' && !domain.clusterId && !clusterIsSelfManaged(cluster);
				if (!canBind) {
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
					<Tooltip>
						<TooltipTrigger asChild>
							<>
								<div>{domain.domain}</div>
								<Button
									type="button"
									variant="destructiveGhost"
									className="text-muted-foreground text-xs"
									disabled={isPending || !!domain.clusterId}
									onClick={() => deleteDomainById(domain.id)}
								>
									Remove Domain
								</Button>
							</>
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
								{certForDomain && (!certForDomain.issueDate || certForDomain.inProgress) && (
									<div className="py-2">
										<CertificateProgress certificate={certForDomain} domain={domain} cluster={cluster} />
									</div>
								)}
								<Button
									type="button"
									variant="destructiveGhost"
									className="text-muted-foreground text-xs"
									disabled={isPending}
									onClick={() => unbindDomainById(domain.id)}
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
		bindDomainToThisCluster,
		isPending,
		challengeCertificates,
		isGeneratingCert,
		selectedDomainIds,
		onToggleDomainSelection,
	]);
}
