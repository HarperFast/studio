import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { Certificate } from '@/integrations/api/instance/certificates/listCertificates';
import { useRemoveCertificate } from '@/integrations/api/instance/certificates/useRemoveCertificate';
import { Row } from '@tanstack/react-table';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function ViewCertificateModal({
	data,
	isModalOpen,
	closeModal,
	onSelectCertificate,
	onChangesSaved,
}: {
	data: Certificate;
	isModalOpen: boolean;
	closeModal: () => void;
	onSelectCertificate: (row?: Row<Certificate>) => void;
	onChangesSaved: () => void;
}) {
	const { name } = data;
	const instanceParams = useInstanceClientIdParams();

	const { mutate: removeCertificate, isPending: isRemovePending } = useRemoveCertificate();

	const [isConfirmRemoveModalOpen, setIsConfirmRemoveModalOpen] = useState(false);

	const onCertificateRemoveClicked = useCallback(() => {
		setIsConfirmRemoveModalOpen(true);
	}, []);

	const onDeletionConfirmed = useCallback(() => {
		removeCertificate(
			{
				instanceParams,
				name,
			},
			{
				onSuccess: () => {
					toast.success('Certificate removed successfully!');
					onSelectCertificate(undefined);
					onChangesSaved();
				},
			},
		);
	}, [name, removeCertificate, instanceParams, onChangesSaved, onSelectCertificate]);

	return (
		<>
			<Dialog onOpenChange={closeModal} open={isModalOpen}>
				<DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
					<div className="grid gap-4 my-4">
						<DialogHeader>
							<DialogTitle>View Certificate: {name}</DialogTitle>
							<DialogDescription>
								Details of the selected certificate.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4 text-sm bg-gray-900/50 p-4 rounded-lg border border-gray-800">
								<div className="col-span-2">
									<p className="font-semibold">Issuer</p>
									<p className="text-gray-400 break-all">{data.details.issuer || 'N/A'}</p>
								</div>
								<div className="col-span-2">
									<p className="font-semibold">Subject</p>
									<p className="text-gray-400 break-all">{data.details.subject || 'N/A'}</p>
								</div>
								{data.details.subject_alt_name && (
									<div className="col-span-2">
										<p className="font-semibold">Subject Alternative Name</p>
										<p className="text-gray-400 break-all">{data.details.subject_alt_name}</p>
									</div>
								)}
								<div>
									<p className="font-semibold">Valid From</p>
									<p className="text-gray-400">
										{data.details.valid_from ? new Date(data.details.valid_from).toLocaleString() : 'N/A'}
									</p>
								</div>
								<div>
									<p className="font-semibold">Valid To (Expires At)</p>
									<p className="text-gray-400">
										{data.details.valid_to ? new Date(data.details.valid_to).toLocaleString() : 'N/A'}
									</p>
								</div>
								<div>
									<p className="font-semibold">Serial Number</p>
									<p className="text-gray-400 font-mono text-xs break-all">{data.details.serial_number || 'N/A'}</p>
								</div>
								<div>
									<p className="font-semibold">Private Key Name</p>
									<p className="text-gray-400">{data.private_key_name || 'N/A'}</p>
								</div>
								<div>
									<p className="font-semibold">Is Authority</p>
									<p className="text-gray-400">{data.is_authority ? 'Yes' : 'No'}</p>
								</div>
								<div>
									<p className="font-semibold">Is Self-Signed</p>
									<p className="text-gray-400">{data.is_self_signed ? 'Yes' : 'No'}</p>
								</div>
								{data.hosts && data.hosts.length > 0 && (
									<div className="col-span-2">
										<p className="font-semibold">Hosts</p>
										<p className="text-gray-400">{data.hosts.join(', ')}</p>
									</div>
								)}
								<div className="col-span-2">
									<p className="font-semibold">Uses</p>
									<p className="text-gray-400">{data.uses?.join(', ') || 'N/A'}</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label>Certificate Content</Label>
								<Textarea
									autoComplete="off"
									autoCapitalize="off"
									rows={8}
									readOnly={true}
									className="font-mono text-xs"
									value={data.certificate}
								/>
							</div>
						</div>

						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button
									type="button"
									variant="destructiveOutline"
									className="rounded-full"
									onClick={onCertificateRemoveClicked}
									disabled={isRemovePending}
								>
									Remove Certificate
								</Button>

								<Button
									type="button"
									variant="defaultOutline"
									className="rounded-full"
									onClick={() => closeModal()}
								>
									Close
								</Button>
							</div>
						</DialogFooter>
					</div>
				</DialogContent>
			</Dialog>
			<ConfirmDeletionModal
				isModalOpen={isConfirmRemoveModalOpen}
				setIsModalOpen={setIsConfirmRemoveModalOpen}
				deletionConfirmed={onDeletionConfirmed}
				deletionPending={isRemovePending}
				typeOfThingBeingDeleted="certificate"
				presentParticiple="Removing"
				transitiveVerb="Remove"
				nameOfThingBeingDeleted={name}
				hideDataLossWarning={true}
			/>
		</>
	);
}
