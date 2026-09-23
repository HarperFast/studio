# Organization navigation

The organization overview, account menu, sidebar switcher, and single-organization landing route share `lib/organizationTargets.ts`. Targets come from current-user membership metadata without extra organization queries. A role carrying `oauthProviders` is locked unless the existing staff `org:read` policy grants entry. Locked memberships remain on the organization overview with their existing provider sign-in actions; they are not direct switch destinations. A sole locked membership therefore lands on the overview rather than a forbidden organization route.

Switching always navigates to the selected organization root. It must not retain the previous organization's cluster ID or page suffix. The sidebar caret opens a selector; it does not collapse the rail. Staff's broader non-membership directory remains on All organizations rather than fetching every organization into the header.

Account actions reuse the existing logout mutation and theme provider. Local Studio accounts expose appearance and sign-out without cloud profile or organization links. Account components receive the navbar's current user rather than adding authentication listeners for each menu entry.
