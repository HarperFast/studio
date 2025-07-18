export function PriceDisplay({ price }: { readonly price?: string }) {
	const parts = (price || '$0.00').split('$')[1].split('.');
	return <span className="text-4xl">
		<sup className="font-light text-xl">$</sup>{parts[0]}<sup className="font-light text-xl">{parts[1]}</sup>
	</span>;
}
