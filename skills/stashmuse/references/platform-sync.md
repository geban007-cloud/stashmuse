# Platform sync

Read this reference only for extension pairing or platform synchronization.

## Shared flow

1. Start the local app on `127.0.0.1:8787`.
2. In Chrome, load the repository's `extension/` directory as an unpacked extension.
3. Generate a one-time pairing code in the local app and enter it in the extension popup.
4. Log in to the platform normally, open the user's own favorites page, and start sync explicitly.
5. Compare the extension's collected/imported/skipped counts with a small sample in the local inbox.

The extension does not receive permission to read or store platform cookies. It reads only the logged-in page that the user opened. It must not modify source favorites or likes.

## Platform notes

- **小红书:** open the profile's 收藏 tab. Virtualized cards disappear while scrolling, so the content script accumulates cards for the current tab session. Verification, login expiry, and hidden/deleted notes require user handling.
- **B 站:** open the user's favorites collection. Check collection pagination and stable video IDs; a repeated sync should update records rather than duplicate them.
- **知乎:** starting from 我的收藏 may traverse individual collections; starting inside one collection limits sync to that collection. Verify each collection's pagination separately.
- **微博:** page structure and login gates change frequently. Treat missing cards as an adapter issue before assuming the account has no favorites.

Likes are out of scope unless the UI exposes a separate, explicit opt-in. Keep them marked as a distinct source type.

## Failure signals

- `401`: pairing token missing or expired; re-pair from the local app.
- `403`: request is not from the permitted loopback origin/host, or browser CORS protections rejected it.
- Collected count grows but imported count does not: inspect deduplication keys and server-side filters.
- Only the visible screen is collected: confirm the content script remains active while the page scrolls and that the platform adapter observes virtualized-card mounts.
- A page challenge or expired login appears: stop and ask the user to resolve it in the browser; do not automate around it.
