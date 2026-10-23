# Community moderation

## Automatic rules (server)

- Posts and comments are screened by `server/services/moderation.ts`: a blocked-word list (with common character substitutions), at most one link, and repeated-character spam. Rejected text is never stored.
- Crisis language ("want to die", "kill myself", "suicidal", …) is **not** blocked — people need to be able to ask for prayer — but the author immediately sees 988 Suicide & Crisis Lifeline resources. The same check runs on private prayer journal entries (resources only; nothing is shared).
- Rate limits: 5 posts/hour, 20 comments/hour, 30 reports/hour, 120 likes/minute per user.
- A post or comment reported by 3 different people is hidden until reviewed.
- Blocking is two-way: neither person sees the other's posts or comments.

## Review queue

Admins see **Settings → Moderation queue**. Grant access with `npm run admin:grant -- email`.

For each report choose:

- **Remove** — takes the content down for everyone (keeps it in the database for records).
- **Restore** — makes hidden content visible again.
- **Dismiss** — closes the report without changing the content.

Resolving one report closes all open reports on the same content. Admins can also delete any post or comment from its ••• menu.

## Reports marked "Someone may be at risk"

1. Review within a few hours, every day. Assign an on-call person.
2. Daily Grace does not know users' locations and is not an emergency service. Do not attempt to diagnose or counsel.
3. If the content suggests imminent danger, contact the user by email with crisis resources (988 call/text, 911) and encourage them to reach a trusted person or pastor. Keep the post visible unless it could harm others; prayer support can help.
4. Record what you did. Escalate threats against others to law enforcement.

## Known limits

- The word list is short and English-only; it will miss coded abuse and occasionally flag innocent words. Expand it from real reports.
- There is no image upload, so no image moderation is needed yet.
- Consider adding an AI moderation pass (e.g. a Claude classification call before publishing) once volume justifies the cost.
