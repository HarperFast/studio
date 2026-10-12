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
