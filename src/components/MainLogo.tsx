import { isLocalStudio } from '@/config/constants';

export function MainLogo() {
	return (
		<>
			{isLocalStudio
				? <img src="/harper-studio_white.png" alt="Harper Studio" className="w-64 hidden md:inline-block" />
				: <img src="/harper-fabric_white.png" alt="Harper Fabric" className="w-64 hidden md:inline-block" />}
			<img src="/HDBDogOnly.svg" width="50px" height="44px" alt="Harper" className="inline-block md:hidden" />
		</>
	);
}
