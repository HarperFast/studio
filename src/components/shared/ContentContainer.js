import React from 'react';

function ContentContainer({ children, header, subheader, maxHeight = 'auto', minHeight = 'auto', className }) {
	return (
		<div className={`content-container ${className}`}>
			<div className="header-container">
				<span className="header">{header}</span>
				<span className="subheader">{subheader}</span>
			</div>
			<div className={maxHeight !== 'auto' ? 'scrollable' : ''} style={{ maxHeight, minHeight }}>
				{children}
			</div>
		</div>
	);
}

export default ContentContainer;
