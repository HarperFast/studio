export default ({ version }) => {
	if (version) {
		const [a, b] = version?.split('.') || [];

		const major = parseInt(a, 10);
		const minor = parseInt(b, 10);
		const versionAsFloat = parseFloat(`${major}.${minor}`);

		return versionAsFloat >= 4.2;
	}
	return true;
};
