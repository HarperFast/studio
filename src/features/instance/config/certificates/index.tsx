import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { Certificate, listCertificatesQueryOptions } from '@/integrations/api/instance/certificates/listCertificates';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { dataTableColumns } from './constants/tableDefinition';
import { AddCertificateModal } from './modals/AddCertificateModal';
import { ViewCertificateModal } from './modals/ViewCertificateModal';

export function ConfigCertificatesIndex() {
	const navigate = useNavigate();
	const { certName }: { certName?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const {
		data: certificates,
		refetch,
		isFetching,
		isRefetching,
	} = useQuery(listCertificatesQueryOptions(instanceParams));

	const selectedCertificate = useMemo(
		() => certificates?.find((cert) => cert.name === certName),
		[certificates, certName],
	);

	const onSelectCertificate = useCallback(
		(row?: Row<Certificate>) => {
			const newCertName = row?.original?.name;
			const parts = [certName ? '..' : '', newCertName].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[certName, navigate],
	);

	const isViewModalOpen = !!certName && !!selectedCertificate;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<>
			<SimpleBrowseDataTable
				columns={dataTableColumns}
				data={certificates || []}
				isFetching={isFetching}
				onRowClick={onSelectCertificate}
			>
				<Link
					className="inline-block underline text-sm text-gray-400 hover:text-white"
					to="https://docs.harperdb.io/docs/developers/operations-api/certificate-management"
					target="_blank"
				>
					Certificate Management Docs
				</Link>
				<Button variant="defaultOutline" onClick={onRefreshClick} accessKey="r" disabled={isFetching || isRefetching}>
					<RefreshCwIcon />
					<span className="hidden lg:inline-block">
						<u>R</u>efresh
					</span>
				</Button>
				<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a" disabled={isAddModalOpen}>
					<PlusIcon />
					<span>
						<u>A</u>dd
					</span>
				</Button>
			</SimpleBrowseDataTable>
			{isAddModalOpen && (
				<AddCertificateModal
					isModalOpen={isAddModalOpen}
					onChangesSaved={refetch}
					setIsModalOpen={setIsAddModalOpen}
				/>
			)}
			{isViewModalOpen && (
				<ViewCertificateModal
					isModalOpen={isViewModalOpen}
					closeModal={onSelectCertificate}
					data={selectedCertificate}
					onSelectCertificate={onSelectCertificate}
					onChangesSaved={refetch}
				/>
			)}
		</>
	);
}
