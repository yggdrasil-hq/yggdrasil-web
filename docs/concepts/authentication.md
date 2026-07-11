# Authentication (Web)

**Read this when:** you implement the login page, auth middleware, account
settings, onboarding, or DiceBear avatars in this repo.
**Skip if:** you need the full cross-component spec — see the meta repo's
[`../../../docs/concepts/authentication.md`](../../../docs/concepts/authentication.md).

> Canonical spec: meta repo `docs/concepts/authentication.md` and ADR 009
> (amending ADR 001). This page only records **Web-owned** implementation notes.
> GitHub OAuth is the only sign-in method — there is no signup page, password
> form, or GitHub link/disconnect UI in this repo.

## Ownership

The Web app renders auth UI and protects routes. It does **not** implement OAuth
token exchange — it redirects the browser to the API's OAuth start URL.

## Routes

```
app/
  login/page.tsx                        # "Continue with GitHub" only
  onboarding/confirm-username/page.tsx
  settings/account/page.tsx              # display name + logout
  middleware.ts              # session gate + pending_username gate
```

## Key components

- `AuthProvider` — fetches `GET /api/auth/me`, supplies user to shell
- `middleware.ts` — redirect to `/login?next=` when unauthenticated; only
  `/login` is public (`PUBLIC_PATHS`)
- `AuthLayout` — shared auth page shell (branding, centered card)
- `UserAvatar` — DiceBear `thumbs`, seed = username (`@dicebear/collection`)

## API calls

All auth requests use `credentials: 'include'` (session cookie). Base URL from
`NEXT_PUBLIC_API_BASE_URL`.

OAuth start: `oauthStartUrl(returnTo?)` in `lib/config.ts` → redirect to
`${API_BASE}/auth/github?return_to=…` (no `intent` param).

## UX copy

- **Login page:** single "Continue with GitHub" button; error banner maps
  `?error=` codes (`github_denied`, `github_failed`, etc.) to short messages.
- **Account settings:** display name, avatar, the linked GitHub login
  (informational only), and logout. No password fields, no
  connect/disconnect GitHub.

## Related

- Meta ADR: [`../../../docs/adr/009-github-only-authentication.md`](../../../docs/adr/009-github-only-authentication.md),
  [`../../../docs/adr/001-authentication.md`](../../../docs/adr/001-authentication.md)
