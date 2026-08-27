// jsdom implements neither of these, and Radix calls both while opening a Select. Without them a
// test that opens one dies with `candidate?.scrollIntoView is not a function` from inside Radix —
// which reads like a library bug rather than a missing DOM API.
//
// The trap this exists to prevent is quieter than the crash: Radix renders a Select's options ONLY
// while it is open, and in jsdom a pointerDown does not open one (ArrowDown does). So asserting
// that an option is *absent* passes whether or not the code that removes it works at all. The plan
// filter in the cluster editor survived a mutation pass for exactly that reason.

// Setup files run in EVERY environment, including the node-environment tests that have no DOM at
// all — touching `Element` unguarded there is a ReferenceError that fails the whole file.
if (typeof Element !== 'undefined') {
	patchElementPrototype();
}

function patchElementPrototype() {
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = function scrollIntoView() {};
	}

	// Radix's pointer handling probes these before deciding how to open a menu.
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = function hasPointerCapture() {
			return false;
		};
	}

	if (!Element.prototype.releasePointerCapture) {
		Element.prototype.releasePointerCapture = function releasePointerCapture() {};
	}
}
