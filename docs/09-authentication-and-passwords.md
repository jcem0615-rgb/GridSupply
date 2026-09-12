# 09 — Authentication and passwords

## Who may reset whom

| Actor | May reset |
| --- | --- |
| Platform Owner | Any account — every school Principal, every supplier owner, every supplier employee |
| Supplier Owner | Accounts inside **their own supplier** only: themselves and their employees |
| Everyone else | Nobody; they change their own password |

**A supplier can never reset a school account.** A supplier is an external vendor
competing for public contracts; the School Principal is the account that approves their
purchase orders, signs their IARs and issues their cheques. Letting a vendor reset that
password would let them approve their own sales. The rule is enforced in three places:

1. `canResetPasswordFor()` in `src/lib/accounts.ts` — the function every reset path calls.
2. The supplier Team page only ever lists profiles carrying the actor's `supplier_id`.
3. `profiles_supplier_owner_write` in the schema, which checks `supplier_id` in **both**
   `USING` and `WITH CHECK`. Without the second clause a supplier owner could move a
   Principal into their own tenant and then reset it — the write has to be illegal both
   before and after.

## How a reset works
1. An admin clicks **Reset password**. A temporary password is generated from an alphabet
   with no ambiguous glyphs (no `O`/`0`, `I`/`1`), because it gets read aloud.
2. The plaintext is shown **once** and never persisted. Only a PBKDF2-SHA256 digest
   (150,000 iterations, per-account random salt) reaches IndexedDB and the outbox.
3. The account is flagged `must_change_password`. Every guarded route redirects to
   `/change-password` until a new password is set, so a temporary credential cannot be
   left in place.
4. `password_reset_by` and `password_reset_at` record who did it and when.

Losing the temporary password before handing it over means issuing another reset. That is
the intended behaviour — there is nothing to recover it from.

## Local mode versus Supabase
With no backend configured, credentials live in `profiles` and are verified in the browser.
This is real hashing, not a stub, but it is **not** a security boundary: anyone with the
device can edit IndexedDB directly. Local mode is for development and demos.

The seeded demo accounts have `password_hash: null`, which is what "no password set"
means. They are reachable only through the demo picker on the login screen; the sign-in
form rejects them and says so. Once an admin resets such an account, it gains a real
credential and the form path starts working for it.

With `VITE_SUPABASE_URL` set, Supabase Auth owns credentials:

- `setOwnPassword()` also calls `supabase.auth.updateUser({ password })`.
- `resetPassword()` also sends `resetPasswordForEmail()` so the holder gets a link and the
  admin need not read a password aloud.
- **Setting another user's password outright requires the `service_role` key**, which must
  never reach the browser. That belongs in an Edge Function that verifies the caller's
  profile against the same `canResetPasswordFor()` rule before calling
  `auth.admin.updateUserById()`. This is listed as an open item in `CLAUDE.md`; the
  `must_change_password` flag and the audit columns are already in the schema for it.

## Password rules
At least 8 characters, containing a letter and a number — `passwordProblem()` in
`src/lib/auth/password.ts`. Deliberately modest: this is a shared-workstation government
context where a long composition policy produces passwords on sticky notes.
