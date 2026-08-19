import { isLocalStudio } from '@/config/constants';

export function MainLogo() {
	const logoPrefix = isLocalStudio ? 'studio' : 'fabric';
	const logoAlt = isLocalStudio ? 'Harper Studio' : 'Harper Fabric';

	return (
		<>
			<img
				src={`/harper-${logoPrefix}_black.png`}
				alt={logoAlt}
				className="w-64 hidden md:inline-block dark:hidden"
			/>
			<img src={`/harper-${logoPrefix}_white.png`} alt={logoAlt} className="w-64 hidden md:dark:inline-block" />
			<img src="/HDBDogOnly.svg" width="50px" height="44px" alt="Harper" className="inline-block md:hidden" />
		</>
	);
}
