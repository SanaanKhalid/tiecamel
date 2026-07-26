export function downloadJson(filename: string, value: unknown) {
	downloadFile(filename, JSON.stringify(value, null, 2), "application/json");
}

export function downloadFile(
	filename: string,
	content: string,
	contentType: string,
) {
	const blob = new Blob([content], { type: contentType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
