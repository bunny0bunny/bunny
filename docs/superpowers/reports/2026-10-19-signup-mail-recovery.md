# Pending-account signup recovery

The reported signup email address already belonged to an unverified migrated account. All of its earlier verification tokens were revoked. Repeating signup returned the generic privacy-preserving response but exited before generating or sending a new activation token.

`registerReaderService` now reuses an eligible pending account unchanged, revokes old verification tokens and issues a fresh activation email using its original nickname. It never replaces the existing password, identity or role. Verified and disabled accounts remain no-ops with the same public response; rate limits and serializable transactions are unchanged.

Three focused regression tests reproduced the missing email before the patch (two failed, one passed), then passed with 17 assertions after it. The tests use in-memory boundaries and do not modify the production database or send messages. One focused Claude review found no introduced must-fix issue.

The coordinator separately verified SMTP authentication without sending a message. Exactly one real resend was submitted through the deployed verification Server Action for the user's requested address. It created a fresh valid token, and the user confirmed the activation email arrived. That confirms delivery for this resend; the HTTP success alone was not treated as delivery evidence. The coordinator did not manually verify the account or overwrite its password.

The user then confirmed successful activation and login on the deployed site. This is human-confirmed end-to-end account acceptance, not an automated login or load test.

The existing public registration/resend services still intentionally use a generic response and do not expose the transport result; this patch addresses the confirmed skipped-send branch, not a mail queue, delivery monitoring or all possible provider failures.
