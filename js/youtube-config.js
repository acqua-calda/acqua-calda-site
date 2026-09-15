// YouTube Data API v3 key, used only by js/youtube-widget.js for the search
// bar / "popular videos" grid inside ACQUA HOUSE.
//
// This site is fully static (no backend -- see Cloud.md), so this key is
// necessarily shipped to the browser like firebase-config.js already is.
// Do NOT try to hide it; instead, in Google Cloud Console
// (APIs & Services > Credentials > this key):
//   - "API restrictions"  -> limit to "YouTube Data API v3" only
//   - "Application restrictions" -> HTTP referrers, limited to this site's
//     domain(s) (e.g. https://acqua-calda.github.io/*)
// Data API v3 has no paid tier -- it's free up to a daily unit quota, then
// requests just start failing -- so the worst case of a leaked-but-restricted
// key is "someone else burns today's quota from our own domain", not a bill.
const YOUTUBE_API_KEY = 'AIzaSyAAzX1j_sqFjDFMAg3RfnCBhQwjzO_3ptk';
