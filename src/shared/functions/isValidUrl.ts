const isValidUrl = (url: string) => {
	try {
		return Boolean(new URL(url));
	} catch {
		return false;
	}
};

export default isValidUrl;
