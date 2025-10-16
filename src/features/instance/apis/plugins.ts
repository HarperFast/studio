export const SnippedGeneratorNodeJsPlugin = {
	fn: {
		requestSnippetGenerator_fetch: (request: { get: (key: string) => unknown }) => {
			const url = new URL(request.get('url') as string);
			let isMultipartFormDataRequest = false;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const headers = request.get('headers') as any;
			if (headers && headers.size) {
				headers.map((val: string, key: string) => {
					isMultipartFormDataRequest = isMultipartFormDataRequest || /^content-type$/i.test(key) && /^multipart\/form-data$/i.test(val);
				});
			}
			let reqBody = request.get('body') as string | object;
			const reqMethod = request.get('method') as string;
			if (reqBody) {
				if (isMultipartFormDataRequest && ['POST', 'PUT', 'PATCH'].includes(reqMethod)) {
					return 'throw new Error("Currently unsupported content-type: /^multipart\\/form-data$/i");';
				} else {
					if (typeof reqBody !== 'string') {
						reqBody = JSON.stringify(reqBody, null, '\t');
					}
				}
			} else if (!reqBody && reqMethod === 'POST') {
				reqBody = '';
			}

			const stringBody = '`' + (reqBody || '')
					.replace(/\\n/g, '\n')
					.replace(/`/g, '\\`')
				+ '`';

			return `const response = await fetch("${url.toString()}", {
\tmethod: "${request.get('method')}",${headers && headers.size ? `
\theaders: {
\t\t${headers.map((val: string, key: string) => `"${key}": "${val}"`).valueSeq().join(',\n\t\t')}
\t},` : ''}${reqBody ? `
\tbody: ${stringBody},` : ''}
});
const data = await response.json();
console.log(data);
`;
		},
	},
};


export const plugins = [
	SnippedGeneratorNodeJsPlugin,
];
