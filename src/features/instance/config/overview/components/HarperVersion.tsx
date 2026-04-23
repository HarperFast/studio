import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';

export const HarperVersion = ({
	loadingRegistration,
	registrationInfo,
}: {
	loadingRegistration?: boolean;
	registrationInfo?: RegistrationInfoResponse;
}) => {
	const link = !!registrationInfo?.version
		&& parseInt(registrationInfo.version[0], 10) >= 5
		&& `https://github.com/HarperFast/harper/releases/tag/v${registrationInfo.version}`;
	return (
		<>
			<dt className="font-bold text-sm/6">Harper Version</dt>
			<dd className="text-sm/6 sm:mt-2">
				{loadingRegistration
					? <TextLoadingSkeleton className="w-10" />
					: link
					? (
						<a href={link} target="_blank" className="underline hover:text-blue-300" rel="noopener noreferrer">
							{registrationInfo.version}
						</a>
					)
					: registrationInfo?.version || 'Unknown'}
			</dd>
		</>
	);
};
