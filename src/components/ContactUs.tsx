export function ContactUs({ overEmail }: { readonly overEmail?: boolean }) {
	return (
		<a
			href={overEmail
				? 'mailto:support@harperdb.io'
				: 'https://discord.com/channels/1415002037439041710/1415002038286286994'}
			target="_blank"
			rel="noreferrer"
			className="underline"
		>
			Contact us
		</a>
	);
}
