import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { listSSHKeysQueryOptions, SSHKeyName } from '@/integrations/api/instance/ssh/listSSHKeys';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { dataTableColumns } from './constants/tableDefinition';
import { KnownHosts } from './KnownHosts';
import { AddSSHKeyModal } from './modals/AddSSHKeyModal';
import { EditSSHKeyModal } from './modals/EditSSHKeyModal';

export function ConfigSSHKeysIndex() {
	const navigate = useNavigate();
	const { keyName }: { keyName?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const {
		data: localSSHKeys,
		refetch,
		isFetching,
		isRefetching,
	} = useQuery(listSSHKeysQueryOptions(instanceParams));

	const selectedSSHKey = useMemo(() => localSSHKeys?.find((role) => role.name === keyName), [localSSHKeys, keyName]);

	const onSelectSSHKey = useCallback(
		(row?: Row<SSHKeyName>) => {
			const newKeyName = row?.original?.name;
			const parts = [keyName ? '..' : '', newKeyName].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[keyName, navigate],
	);

	const isEditModalOpen = !!keyName && !!selectedSSHKey;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<>
			<SimpleBrowseDataTable
				columns={dataTableColumns}
				data={localSSHKeys || []}
				isFetching={isFetching}
				onRowClick={onSelectSSHKey}
			>
				<Link
					className="inline-block underline text-sm text-gray-400 hover:text-white"
					to="https://docs.harperdb.io/docs/developers/security/certificate-management"
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
				<AddSSHKeyModal isModalOpen={isAddModalOpen} onChangesSaved={refetch} setIsModalOpen={setIsAddModalOpen} />
			)}
			{isEditModalOpen && (
				<EditSSHKeyModal
					isModalOpen={isEditModalOpen}
					closeModal={onSelectSSHKey}
					data={selectedSSHKey}
					onSelectSSHKey={onSelectSSHKey}
					onChangesSaved={refetch}
				/>
			)}
			<Suspense fallback={<Loading text="Loading..." />}>
				<KnownHosts />
			</Suspense>
		</>
	);
}
