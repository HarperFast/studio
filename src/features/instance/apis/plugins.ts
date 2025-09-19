export const SnippedGeneratorNodeJsPlugin = {
	fn: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		requestSnippetGenerator_node_fetch: (request: any) => {
			const url = new URL(request.get('url'));
			let isMultipartFormDataRequest = false;
			const headers = request.get('headers');
			if (headers && headers.size) {
				request.get('headers').map((val: string, key: string) => {
					isMultipartFormDataRequest = isMultipartFormDataRequest || /^content-type$/i.test(key) && /^multipart\/form-data$/i.test(val);
				});
			}
			let reqBody = request.get('body');
			if (request.get('body')) {
				if (isMultipartFormDataRequest && ['POST', 'PUT', 'PATCH'].includes(request.get('method'))) {
					return 'throw new Error("Currently unsupported content-type: /^multipart\\/form-data$/i");';
				} else {
					if (typeof reqBody !== 'string') {
						reqBody = JSON.stringify(reqBody, null, '\t');
					}
				}
			} else if (!request.get('body') && request.get('method') === 'POST') {
				reqBody = '';
			}

			const stringBody = '`' + (reqBody || '')
					.replace(/\\n/g, '\n')
					.replace(/`/g, '\\`')
				+ '`';

			return `async function main() {
\tconst response = await fetch("${url.toString()}", {
\t\tmethod: "${request.get('method')}",${headers && headers.size ? `
\t\theaders: {
\t\t\t${request.get('headers').map((val: string, key: string) => `"${key}": "${val}"`).valueSeq().join(',\n\t\t\t')}
\t\t},` : ''}${reqBody ? `
\t\tbody: JSON.stringify(${stringBody}),` : ''}
\t});
\tconst data = await response.json();
\tconsole.log(data);
}

main().catch(console.error);
`;
		},
	},
};


export const plugins = [
	SnippedGeneratorNodeJsPlugin,
];
