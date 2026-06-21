# Authentication (Web)

**Read this when:** you implement login/signup pages, auth middleware, account
settings, onboarding, or DiceBear avatars in this repo.
**Skip if:** you need the full cross-component spec — see the meta repo's
[`../../../docs/concepts/authentication.md`](../../../docs/concepts/authentication.md).

> Canonical spec: meta repo `docs/concepts/authentication.md` and ADR 001.
> This page only records **Web-owned** implementation notes.

## Ownership

The Web app renders auth UI and protects routes. It does **not** implement OAuth
token exchange — it redirects the browser to API OAuth start URLs.

## Routes (planned)

```
app/
  login/page.tsx
  signup/page.tsx
  onboarding/confirm-username/page.tsx
  settings/account/page.tsx
  middleware.ts              # session gate + pending_username gate
```

## Key components (planned)

- `AuthProvider` — fetches `GET /api/auth/me`, supplies user to shell
- `middleware.ts` — redirect to `/login?next=` when unauthenticated
- Shared auth layout — Halo background + branding (match existing shell)
- `UserAvatar` — DiceBear `thumbs`, seed = username (`@dicebear/collection`)

## API calls

All auth requests use `credentials: 'include'` (session cookie). Base URL from
`NEXT_PUBLIC_API_BASE_URL`.

OAuth start: redirect to  
`${API_BASE}/auth/github?intent=login|signup|link|upgrade`

## UX copy (required)

- **Signup / set-password:** warn that there is no email and no password reset.
- **Login:** “Remember me” checkbox, default **unchecked**.
- **GitHub login (unlinked):** interstitial with create-account vs sign-in-to-link.
- **Disconnect GitHub:** disabled until password is set.

## Related

- Meta ADR: [`../../../docs/adr/001-authentication.md`](../../../docs/adr/001-authentication.md)
