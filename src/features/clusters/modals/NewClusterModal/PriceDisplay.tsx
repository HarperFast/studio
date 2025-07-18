export function PriceDisplay({ price }: { readonly price?: number }) {
	const numberFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const parts = numberFormat.formatToParts(price || 0);
	return <span className="text-4xl">
		{parts.map((part) => <PricePart key={part.type} type={part.type} value={part.value} />)}
	</span>;
}

function PricePart({ type, value }: ReturnType<Intl.NumberFormat['formatToParts']>[0]) {
	switch (type) {
		case 'currency':
		case 'decimal':
		case 'fraction':
			return <sup className="font-light text-xl">{value}</sup>;
		default:
			return value;
	}
}
