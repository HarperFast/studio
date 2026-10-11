/** A controllable stand-in for `IntersectionObserver`, which jsdom does not implement. Install it
 *  with `vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)`, then drive visibility
 *  with `setIntersecting`. */
export class FakeIntersectionObserver {
	static instances: FakeIntersectionObserver[] = [];

	readonly callback: IntersectionObserverCallback;
	readonly options: IntersectionObserverInit | undefined;
	readonly targets = new Set<Element>();

	constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
		this.callback = callback;
		this.options = options;
		FakeIntersectionObserver.instances.push(this);
	}

	observe(target: Element) {
		this.targets.add(target);
	}

	unobserve(target: Element) {
		this.targets.delete(target);
	}

	disconnect() {
		this.targets.clear();
	}

	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}

	/** Report observed targets as (not) intersecting — all of them, or those `which` accepts. */
	static setIntersecting(isIntersecting: boolean, which: (target: Element) => boolean = () => true) {
		for (const observer of FakeIntersectionObserver.instances) {
			const targets = [...observer.targets].filter(which);
			if (targets.length === 0) {
				continue;
			}
			const entries = targets.map(target => ({ isIntersecting, target }) as IntersectionObserverEntry);
			observer.callback(entries, observer as unknown as IntersectionObserver);
		}
	}

	static reset() {
		FakeIntersectionObserver.instances = [];
	}
}
