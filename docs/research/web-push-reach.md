# Can our web app reach phones and desktops with Web Push?

**Date researched:** 2026-11-15
**Scope:** A React Router app served by one Node server with SQLite and no native app. Can it send Web Push notifications to a user's phone and desktop?
**Method:** Only primary sources were used: specs and RFCs, MDN and its `browser-compat-data` (BCD), vendor blogs and docs from WebKit/Apple, Chrome, Mozilla and Microsoft, the `web-push` repo and npm registry, and vendor pricing pages. BCD was read from the `@mdn/browser-compat-data` v8.1.9 bundle, timestamped 2026-11-12. Versions current at that snapshot: Chrome 157, Edge 157, Firefox 160, Safari/iOS 27.2.

## TL;DR

- **Yes, with one big caveat for iPhone and iPad.** Web Push works in desktop Chrome, Edge, Firefox and Safari (macOS 13 Ventura or later), and in Android Chrome, Firefox and Samsung Internet. On iOS/iPadOS 16.4 or later it works **only in a web app the user has added to the Home Screen**. A Safari tab on iOS cannot subscribe. ([BCD: PushManager](https://developer.mozilla.org/en-US/docs/Web/API/PushManager#browser_compatibility), [WebKit, Feb 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))
- **You can send from your own server.** One Node process using the `web-push` library (MPL-2.0, v4.0.0, Node 16 or later) handles VAPID signing and payload encryption ([repo](https://github.com/web-push-libs/web-push), [npm](https://registry.npmjs.org/web-push/latest)). The browser vendors' push services take the messages. FCM is listed as "No-cost" ([Firebase pricing](https://firebase.google.com/pricing)). Apple says no Apple Developer Program membership is needed ([Apple docs](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). A third-party service such as OneSignal is optional.
- **What the site must ship:** HTTPS (a secure context), a service worker, VAPID keys, a permission request triggered by a user gesture, and `userVisibleOnly: true`. Every push must show a notification. Safari and Edge both state this explicitly.
- **Payload size:** Push services must accept bodies of 4096 bytes or less, which leaves at most 3993 bytes of plaintext (RFC 8030 §7.2, RFC 8291 §4). Apple's limit is 4 KB.
- **Dead subscriptions:** The RFC says a push service returns **404** for an expired subscription. In practice Apple, Mozilla and the web.dev guide also use **410**. Treat both as "delete this subscription."
- **Notification content differs a lot by platform.** Title, body and `data` work everywhere. `image`, `actions`, `badge`, `vibrate` and `renotify` are not supported on Safari (macOS or iOS), and Safari ignores `icon` (it uses the app or site icon). Firefox added `actions` in v152 (June 2026).

## Support matrix

Versions come from BCD unless another source is cited.

| Platform / browser | Web Push (`PushManager`) | Conditions / caveats |
| --- | --- | --- |
| Chrome desktop | 42+ | `applicationServerKey` (VAPID) required ([BCD note](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe#browser_compatibility)); `userVisibleOnly: true` required ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)) |
| Edge desktop | 17+ | Same rules as Chrome. Push is delivered via WNS ([Edge blog 2017](https://blogs.windows.com/msedgedev/2017/12/19/service-workers-going-beyond-page/)). `userVisibleOnly` must be `true` ([Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push)) |
| Firefox desktop | 44+ | Since Firefox 72, `subscribe()` and `requestPermission()` work only from a user gesture ([BCD](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe#browser_compatibility)) |
| Safari macOS | Safari 16+ on macOS 13 Ventura or later | Gesture required, `userVisibleOnly` required, no silent push ([WebKit 2022](https://webkit.org/blog/12945/meet-web-push/), [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Declarative Web Push from Safari 18.5 ([WebKit](https://webkit.org/blog/16923/webkit-features-in-safari-18-5/)) |
| Chrome Android | 42+ | Notifications can only be shown from a service worker ([BCD: Notification](https://developer.mozilla.org/en-US/docs/Web/API/Notification#browser_compatibility)) |
| Firefox Android | 48+ | User gesture required from Firefox Android 79 ([BCD](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe#browser_compatibility)) |
| Samsung Internet | 4.0+ | Notifications only through a service worker (BCD) |
| iOS / iPadOS Safari | 16.4+ | **Home Screen web apps only.** In a normal Safari tab `Notification` is undefined ([BCD](https://developer.mozilla.org/en-US/docs/Web/API/Notification#browser_compatibility)). Declarative Web Push from 18.4 ([WebKit](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)) |
| Chrome / Edge / other iOS browsers | Same as iOS Safari (via Home Screen) | Since 16.4, third-party browsers can offer "Add to Home Screen" ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Chrome iOS documents it ([Chrome Help](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DiOS)) |

## 1. Which browsers and OSes support Web Push

### Desktop and Android

- BCD (behind the MDN compat tables) lists `PushManager` support as follows: Chrome 42, Chrome Android 42, Edge 17, Firefox 44, Firefox Android 48, Safari 16 ("supported on macOS Ventura and later"), Safari iOS 16.4 ("supported in web apps saved to the home screen"), Samsung Internet 4.0. ([MDN PushManager compat](https://developer.mozilla.org/en-US/docs/Web/API/PushManager#browser_compatibility))
- MDN rates the Push API "Baseline: Widely available... available across browsers since March 2023". ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API))
- Safari on macOS: "Web Push is supported in Safari 16 on macOS Ventura" ([WebKit, Jun 7 2022](https://webkit.org/blog/12945/meet-web-push/)). Apple's docs say "Webpages in Safari 16 for macOS 13 or later." ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))
- Edge relies on the Windows Push Notification Service (WNS), which supports the IETF Web Push protocol, message encryption and VAPID. ([Edge blog, Dec 2017](https://blogs.windows.com/msedgedev/2017/12/19/service-workers-going-beyond-page/))
- Firefox has a quota on pushes that do not show a notification: "Push messages that generate notifications are exempt from this limit. The limit is refreshed each time the site is visited. In Chrome there are no limits." ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API))

### iOS / iPadOS: the details

- **Minimum version 16.4, Home Screen only.** "Now with iOS and iPadOS 16.4, we are adding support for Web Push to Home Screen web apps." ([WebKit, Feb 16 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) Apple's docs say "Add web push to Home Screen web apps in iOS 16.4 or later." ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))
- **Manifest `display` requirement. This changed in iOS 26.** On iOS 16.4–18.x a site became a Home Screen web app only if its manifest `display` was `standalone` or `fullscreen` ([WebKit 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). BCD still says "The app's manifest must have a non-default `display` value" ([BCD Notification](https://developer.mozilla.org/en-US/docs/Web/API/Notification#browser_compatibility)). From **iOS/iPadOS 26 (Safari 26.0, Sep 15 2025)**: "By default, every website added to the Home Screen opens as a web app." Users can turn off "Open as Web App", and "there are now zero requirements for 'installability' in Safari... simply no longer requires a manifest file." ([WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), first announced [Jun 9 2025](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)) **This contradicts the brief's hint that a manifest `display` value is required.** It is only required on iOS versions before 26. Still ship a manifest for icons, name and older iOS.
- **Permission only from a user gesture.** A Home Screen web app can request permission "in response to direct user interaction — such as tapping on a 'subscribe' button." ([WebKit 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))
- **Delivery.** iOS web push "uses the same Apple Push Notification service that powers native push." Notifications "show on the Lock Screen, in Notification Center, and on a paired Apple Watch", and they integrate with Focus. ([WebKit 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))
- **Badging API.** Home Screen web apps support `navigator.setAppBadge` from 16.4. ([WebKit 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))
- **Declarative Web Push (verified).** "Declarative Web Push is now available on iOS and iPadOS 18.4 for web apps added to the Home Screen" ([WebKit Safari 18.4, Mar 31 2025](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)). It reached macOS in Safari 18.5 ([WebKit, May 12 2025](https://webkit.org/blog/16923/webkit-features-in-safari-18-5/)). It lets a site "request a Web Push subscription and display user visible notifications without requiring an installed service worker". The JSON payload has `"web_push": 8030` and a `notification` object with a required `title` and `navigate` URL, plus optional `body`, `app_badge` and `mutable`. Browsers that don't support it handle the same message through the service worker as usual. ([WebKit "Meet Declarative Web Push", Mar 27 2025](https://webkit.org/blog/16535/meet-declarative-web-push/), [WWDC25 session 235](https://developer.apple.com/videos/play/wwdc2025/235/)) The format is now in the W3C Push API editor's draft, and `window.pushManager` is defined there ([Push API ED](https://w3c.github.io/push-api/)). BCD lists `window.pushManager` only in Safari 18.4+ and iOS 18.4+. Chrome and Firefox have open bugs ([crbug 382298314](https://crbug.com/382298314), [bugzil.la 1935325](https://bugzil.la/1935325)). Firefox 158 (Oct 2026) shipped only the `navigate` notification option, not declarative push ([Firefox 158 notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/158)).
- **EU / Digital Markets Act (verified, reversed).** In February 2024 Apple's DMA page said: "to comply with the DMA's requirements, we had to remove the Home Screen web apps feature in the EU. EU users will be able to continue accessing websites directly from their Home Screen through a bookmark". Apple then updated it: "We have received requests to continue to offer support for Home Screen web apps in iOS, therefore we will continue to offer the existing Home Screen web apps capability in the EU... can expect the return of the existing functionality... with the availability of iOS 17.4 in early March." ([Apple DMA page, archived 2024-03-04](https://web.archive.org/web/20240304183538/https://developer.apple.com/support/dma-and-apps-in-the-eu/)) The live page has since been rewritten and no longer discusses this ([current page](https://developer.apple.com/support/dma-and-apps-in-the-eu/)). The removal shipped only in iOS 17.4 betas ([WebKit bug 268643](https://bugs.webkit.org/show_bug.cgi?id=268643)). Under the reversal, EU Home Screen web apps stay WebKit-based.
- **Other browsers on iOS.** "In iOS and iPadOS 16.4, third-party browsers can now offer their users the ability to add websites and web apps to the Home Screen from the Share menu" (this requires the browser entitlement). ([WebKit 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) Chrome for iOS documents Share > Add to Home Screen ([Chrome Help](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DiOS)). A Chrome or Edge **tab** on iOS cannot receive push. Only the Home Screen web app can.

## 2. What the site must ship

| Requirement | Detail and source |
| --- | --- |
| **HTTPS / secure context** | `PushManager`, `PushSubscription` and related interfaces are `[SecureContext]`. `subscribe()` rejects with `NotAllowedError` if the scope isn't https ([Push API ED](https://w3c.github.io/push-api/)). `localhost` and `127.0.0.0/8` count as secure for local development ([MDN Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)) |
| **Service worker** | "For an app to receive push messages, it has to have an active service worker" ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). Apple's checklist says "Add a service worker that handles receiving push notifications" ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Exception: Declarative Web Push on Safari 18.4+/18.5+ needs no service worker. Cross-browser apps still need one |
| **Web app manifest** | Needed for iOS 16.4–18.x Home Screen web-app mode (`display: standalone`/`fullscreen`). Optional on iOS 26+ ([WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). Not required for desktop or Android push itself |
| **VAPID keys (RFC 8292)** | ECDSA P-256 (ES256) key pair. The JWT `exp` must be no more than 24 hours ahead. `sub` SHOULD be a `mailto:` or `https:` contact. Invalid auth gets 401/403 ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)). Chrome, Edge and Samsung require `applicationServerKey` ([BCD](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe#browser_compatibility)). Apple: refresh the JWT no more than once per hour, allow `https://*.push.apple.com` outbound, and use TLS with SNI ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). `web-push` notes Apple rejects localhost-style `sub` values with `403 BadJwtToken` ([web-push README](https://github.com/web-push-libs/web-push)) |
| **`userVisibleOnly: true`** | Chrome and Edge "will reject the Promise if `userVisibleOnly` is not set to `true`" ([MDN subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)). Safari requires it ([WebKit 2022](https://webkit.org/blog/12945/meet-web-push/), [Declarative post](https://webkit.org/blog/16535/meet-declarative-web-push/)). Edge "doesn't support push messages that aren't displayed to the user" ([Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push)) |
| **Permission from a user gesture** | Firefox 72+ (desktop) and Firefox Android 79+: `requestPermission()`/`subscribe()` "can only be called in response to a user gesture such as a click" ([BCD](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static#browser_compatibility)). Safari "requires an explicit user gesture" ([WebKit 2022](https://webkit.org/blog/12945/meet-web-push/)). Apple says to call subscribe "immediately from the gesture's event handler" ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Edge recommends it as best practice ([Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/notifications-badges)) |
| **Chrome quiet UI** | "Chrome 80 introduced quieter permission UI for notifications" and "will automatically enroll sites with very low Accept rates into the quieter UI" ([Chrome for Developers](https://developer.chrome.com/blog/notification-permission-data-in-crux)). Chrome shows the full prompt automatically when the request comes from a user gesture ([permissions chip](https://developer.chrome.com/blog/permissions-chip)) |

**Practical takeaway:** Show a "Turn on notifications" button. In its click handler call `Notification.requestPermission()` and then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. POST the resulting `PushSubscription` JSON (endpoint plus `p256dh`/`auth` keys) to the server and store it per user and device in SQLite. On iOS, show this button only when running as a Home Screen web app, and otherwise show "Add to Home Screen" instructions.

## 3. Self-hosted sender vs. third-party service; cost

- **Self-hosting from one Node server works.** The `web-push` library handles payload encryption (`aes128gcm` by default) and VAPID. `generateVAPIDKeys()` creates keys once ("create these keys once, store them and use them for all future messages"). `sendNotification()` accepts `TTL` (default four weeks), `urgency`, `topic` and `contentEncoding`. A failed send rejects with `statusCode`, `headers` and `body` from the push service. The README lists Chrome, Edge, Firefox, Safari 16+ and Samsung as supported. ([web-push README](https://github.com/web-push-libs/web-push)) npm registry: v4.0.0, published 2026-11-06, license MPL-2.0, `engines.node >= 16` ([npm](https://registry.npmjs.org/web-push/latest)). Microsoft's Edge docs recommend this exact library for Node ([Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push)).
- **The browser's push service is the delivery network, and you don't choose it.** The subscription endpoint points at the browser's own service: FCM for Chrome, Mozilla autopush for Firefox, `*.push.apple.com` for Safari, WNS for Edge. Your server just makes an HTTPS POST to that endpoint.
- **Cost of the push services:**
  - FCM: Firebase pricing lists "Cloud Messaging (FCM)" under "No-cost Products" ([Firebase pricing](https://firebase.google.com/pricing)).
  - Apple: "You don't need to join the Apple Developer Program to send web push notifications." ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit 2022](https://webkit.org/blog/12945/meet-web-push/), [WebKit 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) Apple doesn't publish a price for web push, and no source mentions any charge.
  - Mozilla autopush and WNS: neither publishes a price or requires sign-up for standard Web Push endpoints. See Open questions.
- **Third-party services (optional).** OneSignal's [pricing page](https://onesignal.com/pricing) shows a free tier with "10,000 free web push" / "Max 10,000 subscribers per send". Growth costs from $19/month plus $0.004 per web push subscriber, with unlimited sends. These services add dashboards, segmentation and analytics, but they aren't needed for delivery.
- **Rate limits to know about:** From January 2026, Chrome caps Push API sending for sites flagged as disruptive (high volume, low engagement) at "no less than 1000 per minute" and returns HTTP 429 above that ([Chrome blog, Jan 6 2026](https://developer.chrome.com/blog/web-push-rate-limits)). Apple says not to send more than 100 unacknowledged HTTP/1.1 pipelined requests ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)).

## 4. Payloads, notification content, and failure handling

### Payload limits

- RFC 8030 §7.2: "Push services MUST NOT return a 413 status code in responses to an entity body that is 4096 bytes or less in size." ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030))
- RFC 8291 §4: "A push service is not required to support more than 4096 octets of payload body". After the 86-octet header, at least 1 octet of padding and the 16-octet AEAD tag, that "equates to, at most, 3993 octets of plaintext." ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)) **Correction to the brief:** the "4078 bytes" figure doesn't appear in RFC 8030 or 8291. The RFC numbers are 4096 bytes of encrypted body and 3993 bytes of plaintext.
- Apple: `PayloadTooLarge`, "The payload size is over the limit of 4 KB." ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))
- Mozilla autopush docs mention a 4028-character limit for 413 errno 104 ([autopush errors](https://mozilla-services.github.io/autopush-rs/errors.html)). This doesn't match RFC 8030. See Open questions.
- **Practical rule:** Keep the JSON payload well under about 3 KB. Send an ID and a short title/body, and let the service worker or the click target fetch anything larger.

### What a notification can show (BCD, `Notification.*`)

| Option | Chrome / Edge (desktop and Android) | Firefox | Safari macOS | Safari iOS (Home Screen app) |
| --- | --- | --- | --- | --- |
| `title`, `body` | yes | yes | yes | yes |
| `data` (e.g. click URL) | yes | yes | 16+ | 16.4+ |
| `icon` | yes | yes | **no effect** ("can be set, but has no effect") | **no effect** |
| `image` | yes (Chrome 56, Edge 18) | **no** | **no** | **no** |
| `badge` (monochrome small icon) | yes (53) | no | no | no |
| `actions` (buttons) | yes (53) | **yes from 152 (Jun 2026)** | no | no |
| `tag` | yes | yes | set but no effect | no |
| `silent` | yes | 132+ | 16.6+ | no |
| `requireInteraction` | yes | Windows only (117+) | no | no |
| `vibrate`, `renotify`, `timestamp` | yes (Chrome) | no | no | no |
| `navigate` (declarative click URL) | no | 158+ (Oct 2026) | 18.5+ | 18.5+ |
| `notificationclick` handling | yes | yes | yes | yes |

Sources: [BCD Notification](https://developer.mozilla.org/en-US/docs/Web/API/Notification#browser_compatibility), [Firefox 152 notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/152), [Firefox 158 notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/158). App icon badges (`navigator.setAppBadge`) work in Chrome and Edge desktop 81+, Safari macOS 17+ for installed web apps, and iOS 16.4+ Home Screen apps. They don't work in Chrome Android or Firefox ([BCD Navigator.setAppBadge](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/setAppBadge#browser_compatibility)).

**Design implication:** Treat title, body and a click URL in `data` (or `navigate`) as the portable core. Everything else is a progressive enhancement that iOS will drop.

### Request headers (RFC 8030, Apple)

- `TTL` is **required**. A missing TTL gets a 400. "A push message with a zero TTL is immediately delivered if the user agent is available... [otherwise] expires and is never delivered." (RFC 8030 §5.2) Apple stores a message for up to 30 days depending on TTL and keeps a limited number while the device is offline ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Autopush accepts 0–2592000 seconds (30 days) ([autopush](https://mozilla-services.github.io/autopush-rs/errors.html)).
- `Urgency`: `very-low` / `low` / `normal` (default) / `high` (RFC 8030 §5.3). Apple: specify `high` "to attempt to deliver the notification immediately."
- `Topic`: at most 32 characters from the URL-safe base64 alphabet. A newer message replaces a pending one with the same topic (RFC 8030 §5.4, [web.dev](https://web.dev/articles/push-notifications-web-push-protocol)).

### Failure and expiry signals

| Status | Meaning | Source |
| --- | --- | --- |
| 201 | Accepted. This does not mean delivered | RFC 8030 §5 |
| 400 | Bad request (e.g. missing TTL, bad Urgency/Topic) | RFC 8030 §5.2–5.4; Apple `BadTtl`, `BadUrgency`, ... |
| 401 / 403 | VAPID auth missing or invalid | RFC 8292 §4; Apple 403 (`BadJwtToken`, `VapidPkHashMismatch`); autopush 401 |
| **404** | Expired subscription: "A push service MUST return a 404 (Not Found) status code if an application server attempts to send a push message to an expired push message subscription." | RFC 8030 §7.3; web.dev; autopush ("invalid... should not be used again") |
| **410** | Subscription gone. RFC 8030 uses 410 only for *delivery receipts*, but real push services use it for dead subscriptions: Apple "The device token has expired", autopush "no longer valid and should no longer be used", web.dev "should be removed from application server" | [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [autopush](https://mozilla-services.github.io/autopush-rs/errors.html), [web.dev](https://web.dev/articles/push-notifications-web-push-protocol) |
| 413 | Payload too large | RFC 8030 §7.2; Apple `PayloadTooLarge` |
| 429 | Rate limited. SHOULD include `Retry-After` | RFC 8030 §8.4; Apple `TooManyRequests`; Chrome 2026 rate limits |
| 5xx | Retry later | Apple 500/503 |

**Correction to the brief:** RFC 8030 specifies **404** for expired subscriptions. **410** comes from push-service practice (Apple, Mozilla) and the web.dev guidance, not from RFC 8030's subscription-expiry text. Handle both by deleting the stored subscription.

### `pushsubscriptionchange`

- The spec fires it when a subscription is refreshed, revoked or lost, with `oldSubscription` and `newSubscription` (null if there's no replacement) ([Push API ED](https://w3c.github.io/push-api/)).
- Support (BCD): Chrome/Chrome Android **138+ (Jun 2025)**, Firefox 44+ (partial: no `oldSubscription`/`newSubscription` properties), Safari macOS 16+, **Safari iOS: not supported**, Samsung 30+. Edge legacy had it (17–18) and it was removed in 79; Edge Chromium is not listed separately in BCD ([BCD](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event#browser_compatibility)).
- **Implication:** You can't rely on this event, especially on iOS. Also re-check `pushManager.getSubscription()` on each app load and re-POST it, and prune subscriptions on 404/410.

### Silent pushes and permission revocation

- **Safari:** "Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site." ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)) Also: "Violations of the `userVisibleOnly` promise will result in a push subscription being revoked." ([WebKit 2022](https://webkit.org/blog/12945/meet-web-push/))
- **Edge:** "If your PWA doesn't display a notification when a push message is received, Microsoft Edge displays a generic notification." ([Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push))
- **Chrome:** Since October 2025, Chrome on Android and desktop auto-revokes notification permission for sites with low engagement and high notification volume. "This feature does not revoke notifications for any installed web apps." ([Chrome blog, Oct 10 2025](https://blog.google/chromium/automatic-notification-permission/))
- **Firefox:** pushes that don't show a notification count against a quota ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).

## Recent changes (dated)

| Date | Change | Source |
| --- | --- | --- |
| 2020-01-07 | Firefox 72: notification permission and push subscribe require a user gesture | [BCD](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe#browser_compatibility) (release date from BCD) |
| 2020 (Chrome 80) | Chrome quieter notification permission UI | [Chrome for Developers](https://developer.chrome.com/blog/notification-permission-data-in-crux) |
| 2022-06-07 | Web Push announced for Safari 16 / macOS Ventura | [WebKit](https://webkit.org/blog/12945/meet-web-push/) |
| 2023-02-16 | iOS/iPadOS 16.4: Web Push for Home Screen web apps, Badging, third-party browser Add to Home Screen | [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) |
| Feb 2024 → early Mar 2024 | Apple announced removal of Home Screen web apps in the EU (DMA), then reversed it. Restored with iOS 17.4 | [Apple DMA page (archived)](https://web.archive.org/web/20240304183538/https://developer.apple.com/support/dma-and-apps-in-the-eu/) |
| 2025-03-27 / 03-31 | Declarative Web Push: iOS/iPadOS 18.4 (Home Screen apps) | [WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/), [WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) |
| 2025-05-12 | Declarative Web Push on macOS (Safari 18.5) | [WebKit 18.5](https://webkit.org/blog/16923/webkit-features-in-safari-18-5/) |
| 2025-06-24 | Chrome 138: `pushsubscriptionchange` supported | [BCD](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event#browser_compatibility) |
| 2025-09-15 | iOS/iPadOS 26 (Safari 26.0): every site added to the Home Screen opens as a web app by default, and no manifest is required | [WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| 2025-10-10 | Chrome auto-revokes notification permission on low-engagement/high-volume sites (installed web apps exempt) | [Chrome blog](https://blog.google/chromium/automatic-notification-permission/) |
| 2026-01 | Chrome Push API rate limits (429) for disruptive sites | [Chrome blog](https://developer.chrome.com/blog/web-push-rate-limits) |
| 2026-06-16 | Firefox 152: notification `actions` | [Firefox 152](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/152) |
| 2026-10-13 | Firefox 158: `navigate` notification option | [Firefox 158](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/158) |
| 2026-11-06 | `web-push` npm v4.0.0 published | [npm](https://registry.npmjs.org/web-push/latest) |

## Open questions / unverified

- **Mozilla autopush and WNS cost:** No official pricing or "free" statement was found for sending standard Web Push to Mozilla autopush or WNS endpoints. Neither required sign-up in any source read. Microsoft's Windows docs mention Store onboarding for some WNS "web push / alternate" channels (from 2021). That appears to concern Windows app channels, not Edge browser subscriptions, but I couldn't confirm it from a primary source.
- **Apple web push cost:** Apple says no developer account is needed but publishes no pricing statement. "Free" is inferred, not stated.
- **Autopush payload limit:** The autopush-rs docs say "4028 characters" for 413. This conflicts with RFC 8030's 4096-byte floor and may be a typo or bridge-specific. The live behavior wasn't tested.
- **Chrome/Edge on iOS:** Chrome's help page documents Add to Home Screen. I didn't find a first-party Google or Microsoft statement that push works in Home Screen apps created from those browsers. The WebKit post implies it does, since Home Screen web apps are WebKit apps.
- **Edge Chromium `pushsubscriptionchange`:** BCD shows only the legacy Edge entry, which was removed in 79. Current Edge support (likely the same as Chrome 138+) is unverified.
- **Chrome auto-revocation version:** The October 2025 blog gives no Chrome version number.
- **Android 13+ OS-level notification permission for the browser app itself:** Not researched.
- **Firefox 72 gesture rule:** Sourced from BCD notes, not from a Mozilla blog post.
- **Push API spec status:** The editor's draft didn't show its maturity level or date. The Declarative Web Push text there may still change.

## Sources

- RFC 8030 Generic Event Delivery Using HTTP Push: https://www.rfc-editor.org/rfc/rfc8030
- RFC 8291 Message Encryption for Web Push: https://www.rfc-editor.org/rfc/rfc8291
- RFC 8292 VAPID: https://www.rfc-editor.org/rfc/rfc8292
- W3C Push API (Editor's Draft): https://w3c.github.io/push-api/
- Apple, Sending web push notifications in web apps and browsers: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Apple, DMA and apps in the EU (archived 2024-03-04): https://web.archive.org/web/20240304183538/https://developer.apple.com/support/dma-and-apps-in-the-eu/
- Apple WWDC25 "Learn more about Declarative Web Push": https://developer.apple.com/videos/play/wwdc2025/235/
- WebKit, Meet Web Push (2022-06-07): https://webkit.org/blog/12945/meet-web-push/
- WebKit, Web Push for Web Apps on iOS and iPadOS (2023-02-16): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit, Meet Declarative Web Push (2025-03-27): https://webkit.org/blog/16535/meet-declarative-web-push/
- WebKit, Features in Safari 18.4 (2025-03-31): https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- WebKit, Features in Safari 18.5 (2025-05-12): https://webkit.org/blog/16923/webkit-features-in-safari-18-5/
- WebKit, News from WWDC25 (2025-06-09): https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- WebKit, Features in Safari 26.0 (2025-09-15): https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- WebKit bug 268643 (EU 17.4 beta): https://bugs.webkit.org/show_bug.cgi?id=268643
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN PushManager.subscribe(): https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- MDN Secure contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- MDN browser-compat-data v8.1.9 (2026-11-12), via MDN compat tables (PushManager, Notification, ServiceWorkerGlobalScope, Navigator.setAppBadge)
- MDN Firefox 152 release notes: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/152
- MDN Firefox 158 release notes: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/158
- Mozilla autopush-rs error codes: https://mozilla-services.github.io/autopush-rs/errors.html
- web.dev, The Web Push Protocol: https://web.dev/articles/push-notifications-web-push-protocol
- Chrome for Developers, notification permission data in CrUX (quiet UI): https://developer.chrome.com/blog/notification-permission-data-in-crux
- Chrome for Developers, Permissions request chip: https://developer.chrome.com/blog/permissions-chip
- Chrome for Developers, Web push rate limits (2026-01-06): https://developer.chrome.com/blog/web-push-rate-limits
- Google/Chromium blog, automatic notification permission revocation (2025-10-10): https://blog.google/chromium/automatic-notification-permission/
- Chrome Help, Use web apps (iPhone & iPad): https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DiOS
- Microsoft Edge docs, Push messages: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push
- Microsoft Edge docs, Notifications and badges: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/notifications-badges
- Microsoft Edge blog, Service Workers: Going beyond the page (2017): https://blogs.windows.com/msedgedev/2017/12/19/service-workers-going-beyond-page/
- web-push library: https://github.com/web-push-libs/web-push and https://registry.npmjs.org/web-push/latest
- Firebase pricing: https://firebase.google.com/pricing
- OneSignal pricing: https://onesignal.com/pricing
