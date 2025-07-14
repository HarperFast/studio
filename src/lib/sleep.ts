export function sleep(msToSleep: number = 1000) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(true);
		}, msToSleep);
	});
}
