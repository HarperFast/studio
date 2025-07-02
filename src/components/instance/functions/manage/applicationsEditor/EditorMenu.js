import React from 'react';
import cn from 'classnames';

export function InstallPackageButton({ onClick, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={extraClasses}
			title="Import external component or application"
		>
			<i className="fas fa-share-alt" />
			{text && <span className="ms-2 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export function SaveButton({ onClick, savingFile, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button type="button" onClick={onClick} disabled={disabled} className={extraClasses} title="save file to instance">
			<i className={cn('fas', { 'fa-save': !savingFile, 'fa-spinner': savingFile, 'fa-spin': savingFile })} />
			{text && <span className="ms-2 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export function RestartInstanceButton({ onClick, restarting, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={extraClasses}
			title="Click to restart your instance"
		>
			<i className={cn('fas', { 'fa-sync': !restarting, 'fa-spinner': restarting, 'fa-spin': restarting })} />
			{text && <span className="ms-2 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export function RestartOnSaveToggle({ onClick, restartAfterSave, disabled = false, text = '', extraClasses = '' }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={extraClasses}
			title="Toggle whether saving a file restarts the application"
		>
			<i className={cn('fa', { 'fa-toggle-on': restartAfterSave, 'fa-toggle-off': !restartAfterSave })} />
			{text && <span className="ms-2 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export function RevertFileButton({ onClick, disabled = false, text = '', extraClasses = '', loading }) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className={extraClasses} title="revert file">
			<i
				className={cn('revert-file fas', {
					disabled,
					'fa-history': !loading,
					'fa-spinner': loading,
					'fa-spin': loading,
				})}
			/>
			{text && <span className="ms-2 d-none d-lg-inline-block">{text}</span>}
		</button>
	);
}

export default function EditorMenu({ children }) {
	return (
		<ul className="editor-menu">
			{children.map(
				(child) =>
					child && (
						<li className="editor-menu-item" key={crypto.randomUUID?.() ?? Math.random().toString().slice(2)}>
							{child}
						</li>
					)
			)}
		</ul>
	);
}
