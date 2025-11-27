export function readAsDataURL(file: File): Promise<ProgressEvent<FileReader>> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onabort = reject;
		reader.onerror = reject;
		reader.onload = resolve;
		reader.readAsDataURL(file);
	});
}
