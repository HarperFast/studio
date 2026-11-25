# Router — reading data in a route

- **A route read's failure is the route's to show and report.** When a `beforeLoad` or `loader` read
  through [`ensureRouteQueryData`](ensureRouteQueryData.ts) has to fetch, it claims the query until
  the read settles or the router abandons the load
  ([`routeQueryClaims.ts`](../react-query/routeQueryClaims.ts)), and `queryErrorHandler` neither
  toasts nor `console.error`s a claimed failure: the route's error component is the one message and
  the root `onCaughtError` the one RUM report. Everything else keeps the global toast and report — a
  background refetch, an imperative fetch, a load the user navigated away from, and any preload.
  [`routeLoadFailureReporting.test.tsx`](__tests__/routeLoadFailureReporting.test.tsx) pins each case
  against the real router.
- **Guards read the app sign-in through [`guardedAppSignIn`](guardedAppSignIn.ts).** The store learns of a
  sign-out at once and clears the query cache; the router context hears a tick later, through the store's
  listeners. A load that starts in between (Back, a preload) would pass the dashboard guard on the old
  context and fetch on the ended session, and the redirect that then abandons it would leave the failure to
  the global toast. So a sign-out the store knows of overrides the context, for the dashboard guard and the
  sign-in guards alike: if only one of them heard, they would redirect a load back and forth until the
  router gave up ("Too many redirects").
  [`endedSessionRouteFailures.test.tsx`](__tests__/endedSessionRouteFailures.test.tsx) starts such a load
  from a pending and from a signed-in context.
- **Preloads never claim, so no failure goes unreported.** A navigation runs `beforeLoad` again and
  claims a read its preload left in flight. It does not run a `loader` its preload has in flight —
  it adopts it — so that one failure is still reported twice (toast and console, then the boundary).
  Claiming loader preloads would close it, at the price of silencing every failed hover nobody
  clicked.
- **Only the rendered failure is reported.** If two loaders in one route chain awaited different
  queries in parallel and both failed, the boundary that renders reports one and the other is lost.
  Every loader today reads the same registration-info query. A caller that catches the rejection
  instead of letting it reach the route also takes on reporting it.

# Router — routes other systems link to

- **A route in [`stableRoutes.ts`](stableRoutes.ts) is a public URL, not an implementation detail.**
  Central-manager links people to these: the Harper Fabric MCP connector's tool results
  (`src/lib/studioLinks.js`), its emails, and its OAuth plugin's sign-in. Those links are already in agents'
  answers and people's inboxes, so a rename sends every one of them to a dead page. Adding an entry is fine;
  changing or removing one never is. To move a page, add the new path, keep the old one as a route whose
  `beforeLoad` throws `redirect` to it, and change central-manager's link builders in the same release. The old
  entry stays in the list: a redirect route has no page of its own, so its check in
  [`stableRoutes.test.ts`](__tests__/stableRoutes.test.ts) changes to where `router.load()` lands, as
  [`signedInSignInRedirect.test.ts`](__tests__/signedInSignInRedirect.test.ts) does. Rewriting the entry to the new
  path would leave the old link unpinned.
- **Moving a page under a different layout is safe; changing its path is not.** The test pins the URL and
  the component it lands on, not the route tree in between, so a new pathless layout passes and a renamed
  segment fails.
- **A value such a link carries stays the string the link spelled.** The router JSON-parses every
  search value by default, so a `token` of `0` or `12345678901234567890` would reach the page as a number.
  [`searchParams.ts`](searchParams.ts) keeps the emailed links' `token` and `flow` verbatim, in both directions;
  [`emailedLinkSearch.test.tsx`](../features/auth/emailedLinkSearch.test.tsx) opens those links in the app's router.
  A new parameter like them belongs in its list, not in a page that reads the URL itself: the history moves on
  to the next page while this one is still mounted.
