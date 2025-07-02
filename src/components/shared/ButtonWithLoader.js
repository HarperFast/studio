import React, { useState } from 'react';
import cn from 'classnames';

export default function ButtonWithLoader({ className, onClick, disabled, children }) {
	const [loading, setLoading] = useState(false);

	return (
		<button
			disabled={disabled}
			type="button"
			onClick={async () => {
				setLoading(true);

				try {
					await onClick();
					setLoading(false);
					// eslint-disable-next-line
				} catch (e) {
					setLoading(false);
				}
			}}
			className={cn(`${className} button-with-loader`, { loading })}
		>
			{loading ? <i className="button-with-loader-icon fas fa-spinner fa-spin" /> : children}
		</button>
	);
}
