/**
 * Make `Node.removeChild` / `Node.insertBefore` tolerant of DOM mutations made by
 * browser page-translation tools, so they no longer throw and crash React.
 *
 * Page translators (Google Translate, Chrome's built-in translate, Edge, Firefox
 * add-ons, etc.) rewrite the live DOM out from under React: they replace text nodes
 * with translated ones and re-parent fragments. React's commit phase still holds
 * references to the *original* nodes, so when it later unmounts a subtree it calls
 * `removeChild` on a node the translator already moved — throwing
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node':
 *   The node to be removed is not a child of this node.
 *
 * and the same class of failure for `insertBefore`. This is a long-standing React +
 * translation interaction (facebook/react#11538), not a Studio bug, but it surfaces
 * in our RUM Error Tracking (issue #1388) and can wedge the UI for affected users —
 * disproportionately those browsing in a non-English locale with translation on.
 *
 * The widely-used mitigation (Google ships it in their own apps) is to guard these
 * two methods: if the node isn't parented where the caller expects, return without
 * throwing instead of crashing — the translator has effectively already performed the
 * mutation. Everything else falls through to the native implementation unchanged.
 *
 * Idempotent: safe to call more than once (e.g. across HMR reloads).
 */
export function installBrowserTranslationDomGuard() {
	if (typeof Node !== 'function' || !Node.prototype) {
		return;
	}

	const guardFlag = '__harperTranslationGuarded__';
	const proto = Node.prototype as Node & { [guardFlag]?: boolean };
	if (proto[guardFlag]) {
		return;
	}
	proto[guardFlag] = true;

	const originalRemoveChild = Node.prototype.removeChild;
	Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
		if (child.parentNode !== this) {
			// The translator already detached/moved this node; nothing to remove.
			return child;
		}
		return originalRemoveChild.call(this, child) as T;
	};

	const originalInsertBefore = Node.prototype.insertBefore;
	Node.prototype.insertBefore = function insertBefore<T extends Node>(
		this: Node,
		newNode: T,
		referenceNode: Node | null,
	): T {
		if (referenceNode && referenceNode.parentNode !== this) {
			// The reference node was re-parented by the translator; append instead of
			// throwing, which is the closest safe equivalent of React's intent.
			return originalInsertBefore.call(this, newNode, null) as T;
		}
		return originalInsertBefore.call(this, newNode, referenceNode) as T;
	};
}
