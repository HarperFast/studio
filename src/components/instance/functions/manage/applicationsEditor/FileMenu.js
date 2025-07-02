import React from 'react';

export function AddProjectButton({ onClick, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className={extraClasses} title="Create a new app">
			<i className="fas fa-plus" />
			{text && <span className="ms-1"> {text}</span>}
		</button>
	);
}

export function AddProjectFolderButton({ onClick, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className={extraClasses} title="Add a folder">
			<i className="fas fa-plus" />
			{text && <span className="ms-1 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export function DeleteFolderButton({ onClick, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={extraClasses}
			title="Delete selected app or folder"
		>
			<i className="fas fa-minus" />
			{text && <span className="ms-1 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export function AddFileButton({ onClick, disabled, text = '', extraClasses = '' }) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className={extraClasses} title="Add a new file">
			<i className="fas fa-plus" />
			{text && <span className="ms-1 d-none d-lg-inline-block"> {text}</span>}
		</button>
	);
}

export function DeleteFileButton({ onClick, disabled, text = '', extraClasses = '' }) {
	return (
		<button type="button" onClick={onClick} disabled={disabled} className={extraClasses} title="Delete selected file">
			<i className="fas fa-minus" />
			{text && <span className="ms-1 d-none d-lg-inline-block"> {text}</span>}
		</button>
	);
}

function FileMenu({ children }) {
	return (
		<ul className="file-menu text-nowrap">
			{children.map(
				(child) =>
					child && (
						<li className="file-menu-item" key={crypto.randomUUID?.() ?? Math.random().toString().slice(2)}>
							{child}
						</li>
					)
			)}
		</ul>
	);
}

export default FileMenu;
