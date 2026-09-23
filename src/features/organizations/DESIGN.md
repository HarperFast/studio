# Organization navigation

The organization overview, account menu, sidebar switcher, and single-organization landing route share `lib/organizationTargets.ts`. Targets come from current-user membership metadata without extra organization queries. A role carrying `oauthProviders` is locked unless the existing staff `org:read` policy grants entry. Locked memberships remain on the organization overview with their existing provider sign-in actions; they are not direct switch destinations. A sole locked membership therefore lands on the overview rather than a forbidden organization route.

Switching always navigates to the selected organization root. It must not retain the previous organization's cluster ID or page suffix. The sidebar caret opens a selector; it does not collapse the rail. Staff's broader non-membership directory remains on All organizations rather than fetching every organization into the header.

Account actions reuse the existing logout mutation and theme provider. Local Studio accounts expose appearance and sign-out without cloud profile or organization links. Account components receive the navbar's current user rather than adding authentication listeners for each menu entry.

The organization and cluster layouts share `SectionRail`. On desktop the rail has a viewport-bounded height; navigation retains priority and scrolls if needed. The help card appears only when the remaining CSS size container has at least 16rem of height and 11rem of width, so shorter windows and mobile layouts do not trade navigation space for help. No resize observer or application state is needed for this purely visual decision. Header help links remain available when the card is hidden.

The help card can be minimized to its title row and expanded again. `SectionRail` reads the versioned `studio:sidebar-help:minimized:v1` preference once on mount; guarded writes preserve the in-memory toggle when storage is unavailable. The preference follows the existing browser-local hint convention: reloads and route remounts remember it, live cross-tab synchronization is not required, and Studio sign-out clears it with other local storage. Minimized content remains subject to the same CSS space thresholds.

Organization overview controls operate on one complete membership projection, including OAuth-locked entries. Summaries count that unfiltered projection; onboarding guards also read it so filters cannot trigger organization creation. Role filters exclude locked roles, whose API payload has no role name. Staff directory and pasted-ID results retain server ordering/pagination and suppress client-only controls and membership totals. Card actions preserve existing permissions and provider links; no cluster counts or health claims are derived from membership data.

Membership summaries are hidden below the small-screen breakpoint so mobile discovery begins with controls and cards.
