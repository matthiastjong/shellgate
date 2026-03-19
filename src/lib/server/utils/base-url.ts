export function getBaseUrl(request: Request, url: URL): string {
	const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
	const host = request.headers.get("x-forwarded-host") ?? url.host;
	return `${proto}://${host}`;
}
