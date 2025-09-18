import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { RegistrationInfoResponse } from '@/features/instance/operations/queries/getRegistrationInfo';

export const HarperVersion = ({
	loadingRegistration,
	registrationInfo,
}: {
	loadingRegistration?: boolean;
	registrationInfo?: RegistrationInfoResponse;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">Harper Version</dt>
			<dd className="text-sm/6 sm:mt-2">
				{loadingRegistration ? <TextLoadingSkeleton className="w-10" /> : registrationInfo?.version || 'Unknown'}
			</dd>
		</>
	);
};
