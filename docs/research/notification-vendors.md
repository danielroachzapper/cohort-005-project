# Would a third-party notification vendor suit Cadence better than building it?

**Date researched:** 2026-11-17
**Ticket:** [#11](https://github.com/danielroachzapper/cohort-005-project/issues/11). It challenges the build decision in [#7](https://github.com/danielroachzapper/cohort-005-project/issues/7).
**Scope:** Knock, Novu (cloud and self-hosted), Courier, SuprSend and MagicBell, judged against Cadence's constraints:
- one Node process and one SQLite file through synchronous `better-sqlite3` (ADR 0006), with no queue or scheduler;
- a Notification Feed with read/unread state and an unread badge, read at page load, kept forever, and paged;
- one plain-text email per 15-minute window of unread Notifications for each person, then nothing until that person visits again;
- an unsubscribe-all footer and a one-click `List-Unsubscribe` that flips our own "email me" switch;
- Postmark already in use;
- web push in v2;
- small scale.

**Method:** Every claim comes from primary sources: vendor pricing pages, vendor docs, Knock's published OpenAPI file (`docs.knock.app/openapi.json`) and the Novu GitHub repo. Most vendor pages carry **no date**. They are marked "undated" below and were read as live on 2026-11-17. Other vendors were out of scope. This file covers only the five the ticket names.

## TL;DR

- **Recommendation: build, as decided in #7.** Use a vendor in v2 only if web push grows into multi-device or mobile delivery. Even then, it is probably unnecessary.
- **No vendor can keep the "event and its Notifications saved together" guarantee.** Every vendor is a remote HTTP API, so the write can't join the SQLite transaction. To be safe we would need an outbox table plus a worker to drain it. #7 deliberately avoided both.
- **The "one email until the next visit" rule is not built into any of the five.** Each can approximate it. Each approximation means syncing our `lastVisitedAt` to the vendor, or calling a cancel API from our page loads. The rule's state would then live in two places.
- **The feed would move out of our database.** Knock and Novu have server-side feed APIs, so a page-load read is possible, but each page load would make a network call. Novu's free plan keeps feed items for only 30 days ([limits](https://docs.novu.co/platform/developer/limits.md)), which breaks "kept forever."
- **Postmark:** Knock, Novu, Courier and SuprSend all have a Postmark integration. MagicBell's API reference lists no Postmark integration, only SMTP. **None of the five documents a way to set `List-Unsubscribe` / `List-Unsubscribe-Post`** with our own URL.
- **Price at small scale:** free tiers of 10k messages a month (Knock, Novu, Courier, SuprSend) or 1k deliveries (MagicBell). The features we need often sit on paid plans: SuprSend's batching needs Business at $250/mo, Novu's 90-day feed needs Pro from $30/mo, and Knock's next tier is $250/mo.

## Per-vendor findings

### Knock

| Criterion | Finding |
| --- | --- |
| Batching and the "one email until next visit" rule | The batch step has fixed, dynamic, relative and sliding windows, keyed per recipient. A batch can stay open for at most 90 days ([batch docs](https://docs.knock.app/designing-workflows/batch-function), undated; mentions an Aug 20 2026 behaviour change). A 15-minute fixed window is easy. Step conditions can check whether an earlier in-app step "has not been seen/read", and the docs give "only send an email if an in-app notification was not previously read or seen" as an example ([step conditions](https://docs.knock.app/designing-workflows/step-conditions)). "Nothing until they visit again" is **not native**. It would need a condition on a recipient property we sync (for example `lastVisitedAt` against the last email), so the rule would live partly in Knock. The batch docs say a batch **cannot be closed early from a trigger**. |
| Feed | There is a hosted React UI or a headless API. The OpenAPI file includes the server-side `GET /v1/users/{user_id}/feeds/{id}` ("Returns a paginated list of feed items … including metadata"), with `after`/`before`/`page_size` cursors and a `status` filter. The metadata carries `unread_count` / `unseen_count` ([API overview](https://docs.knock.app/in-app-ui/api-overview)). There are batch read/unread endpoints (`/v1/messages/batch/read`, etc.). **A server-side read at page load is possible**, at the cost of one HTTP call per page load. |
| Data location and the transaction guarantee | Data lives in Knock's cloud. "In-app feed notifications are available indefinitely". Message logs are kept 30 days, or 90 on Enterprise ([data retention](https://docs.knock.app/manage-your-account/data-retention)). Triggering is an HTTP call outside our transaction, so the guarantee is lost unless we add an outbox. |
| Price | Free: 10,000 messages/mo. Starter: $250/mo for 50,000, then $0.005 per message. A message is "a single message delivered to a single user on a single channel", so a feed item plus its email counts as 2 ([pricing](https://knock.app/pricing), undated). |
| Lock-in | High. Workflows, templates, preferences and all feed history live in Knock. Leaving means exporting through the list APIs and rebuilding the feed, batching and templates. |
| Postmark | Yes. It uses Postmark's `outbound` stream by default, and `MessageStream` can be changed with a payload override ([Postmark integration](https://docs.knock.app/integrations/email/postmark)). **Custom headers / `List-Unsubscribe` are not documented.** Payload overrides merge into the Postmark request, which might allow Postmark's `Headers` field, but this is unconfirmed. Knock has its own "commercial unsubscribe" link ([docs](https://docs.knock.app/preferences/commercial-unsubscribe)), which flips *Knock's* preferences, not our switch. |
| Web push (v2) | No first-party web push channel. Browser push goes through FCM ([tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)) or OneSignal. |

### Novu (cloud and self-hosted)

| Criterion | Finding |
| --- | --- |
| Batching and the "one email until next visit" rule | The digest step offers `regular` (with an optional look-back window) and `timed` (cron) modes, plus a digest key ([digest reference](https://docs.novu.co/.mintlify/skills/dashboard-workflows/references/digest-step.md), undated). The longest digest is 1 day on Free, 7 days on Pro and 30 days on Team ([limits](https://docs.novu.co/platform/developer/limits.md), undated). Step conditions can read `steps.<in-app-id>.read` / `seen` to skip an email ([step conditions](https://docs.novu.co/platform/workflow/add-and-configure-steps/step-conditions)). "Nothing until next visit" is **not native**. It needs a synced subscriber attribute, as with Knock. |
| Feed | There is a hosted `<Inbox />` or a headless API. The API reference has server-side subscriber endpoints: list notifications, a notifications count, and mark read/unread/seen/archived ([API index](https://docs.novu.co/_llms/api-reference.txt)). Some older v1 feed endpoints are marked deprecated. A page-load read is possible over HTTP. |
| Data location and the transaction guarantee | **Cloud:** Inbox feed retention is **30 days on Free**, 90 days on Pro/Team and custom on Enterprise ([limits](https://docs.novu.co/platform/developer/limits.md)). That conflicts with "kept forever" on every plan except Enterprise. **Self-hosted:** the guidance is a single VM with 4 vCPU and 8 GB RAM, plus **MongoDB and Redis** with persistence, plus object storage ([self-hosting overview](https://docs.novu.co/community/self-hosting-novu/overview), undated). That is three more stateful services beside our single process and SQLite file, which goes against ADR 0006. Either way, triggering is a call outside the transaction. |
| Price | Free: 10k workflow runs/mo. Pro: from $30/mo for 30k+. Team: from $250/mo. Extra runs cost $1.20 per 1k. Self-hosting appears on the pricing page **only under Enterprise** ([pricing](https://novu.co/pricing), undated, ©2026). |
| Lock-in | Medium in principle, because the core is MIT-licensed and the `enterprise/` folder is under a commercial licence ([repo](https://github.com/novuhq/novu); GitHub reports the licence as `NOASSERTION`). Latest release v3.20.0, 2026-11-16. In practice, leaving still means moving feed data out of MongoDB and rewriting the workflows. |
| Postmark | Yes, with a Postmark server token ([Postmark integration](https://docs.novu.co/platform/integrations/email/postmark.md), undated). **The page doesn't mention message streams, custom headers or `List-Unsubscribe`.** |
| Web push (v2) | Push providers: FCM, Expo, APNs, OneSignal, Pushpad, Pusher Beams, Push Webhook ([push integrations](https://docs.novu.co/platform/integrations/push)). No VAPID web push of its own is documented. |

### Courier

| Criterion | Finding |
| --- | --- |
| Batching and the "one email until next visit" rule | The Journeys batch node is scoped per user. It has a quiet-window wait of 1 minute to 1 day, a max wait of up to 7 days and a max of 1000 items ([batch node](https://www.courier.com/docs/platform/journeys/nodes/batch.md), undated). Courier's own [comment-batching recipe](https://www.courier.com/recipes/comment-notification-batching) cancels a pending batch **from your app** when the user reads, through `journeys.cancel` with a cancellation token. For Cadence, that means calling Courier on every page load to cancel. "One email until next visit" would still need state that we keep. |
| Feed | The Inbox is fed by client SDKs over a **real-time connection** authenticated with the user's JWT ([how the inbox behaves](https://www.courier.com/docs/in-app/how-the-inbox-behaves.md)). The server-side `GET /messages` returns delivery status (`opened`, `clicked`) with cursor paging, but **no inbox read state** ([list messages](https://www.courier.com/docs/api-reference/messages/list-messages.md)). A server-rendered unread badge at page load is not documented. |
| Data location and the transaction guarantee | Data lives in Courier's cloud. Inbox messages "stay in the feed until archived or expires". The docs disagree on log retention for the Business plan: [one page](https://www.courier.com/docs/platform/analytics/message-logs) says 90 days and [another](https://www.courier.com/docs/monitor/logs) says 30. The transaction guarantee is lost unless we add an outbox. |
| Price | Developer: free up to 10,000 sends/mo. Business: $0.005 per send from the first send. Enterprise: custom ([pricing](https://www.courier.com/pricing), published Nov 12 2026). |
| Lock-in | High, because templates, journeys and inbox history live in Courier. |
| Postmark | Yes. "Courier sends through your Postmark account". `MessageStream` can be set through the provider override `config` ([Postmark integration](https://www.courier.com/docs/external-integrations/email/postmark)). Headers / `List-Unsubscribe` are **not documented**. |
| Web push (v2) | Not researched in depth. |

### SuprSend

| Criterion | Finding |
| --- | --- |
| Batching and the "one email until next visit" rule | The batch node has fixed, dynamic and relative windows, keyed per recipient. Its window cannot change once it opens ([batch](https://docs.suprsend.com/docs/batch), page metadata suggests about 2023). There is a digest node with per-recipient schedules ([digest](https://docs.suprsend.com/docs/digest)). Branching on message status ("only if not seen") arrived 12 Jan 2026 ([changelog](https://docs.suprsend.com/changelog/overview), latest entry 30 Oct 2026). **Batching & Digest is listed only on Business ($250/mo) and above** ([pricing](https://www.suprsend.com/pricing), undated). "Until next visit" is not native. |
| Feed | The inbox uses client and headless SDKs with `fetch()` / `fetchNextPage()` and badge and unread counts. A server-side Messages API (27 Apr 2026) lets us page through messages by recipient and bulk-update read/seen ([changelog](https://docs.suprsend.com/changelog/overview)). I didn't find a documented server-side unread-count endpoint. |
| Data location and the transaction guarantee | Data lives in SuprSend's cloud. Logs are kept 30–90 days depending on plan. Inbox items can now be given an expiry (5 Jun 2026). **Default inbox retention is not documented.** The transaction guarantee is lost unless we add an outbox. |
| Price | Free: 10k notifications/mo, with SuprSend branding on the inbox and no batching. Essentials: $100/mo. Business: $250/mo for 50k ([pricing](https://www.suprsend.com/pricing)). |
| Lock-in | High. |
| Postmark | Yes, with a server token ([Postmark](https://docs.suprsend.com/docs/postmark.md), undated). It has **no message-stream field and no custom headers**. Unsubscribe uses a `$hosted_preference_url` link in the body, which flips SuprSend's preferences. |
| Web push (v2) | Not researched in depth. |

### MagicBell

| Criterion | Finding |
| --- | --- |
| Batching and the "one email until next visit" rule | **No batch or digest step is documented.** Workflows have `broadcast`, `wait`, `pause` and `abort` commands and an `if` condition per step ([API reference](https://www.magicbell.com/docs/api/reference), [workflows](https://www.magicbell.com/workflows); both undated). A 15-minute digest would have to be built by us anyway. |
| Feed | The hosted inbox is the core product. The API has list notifications, count unread and mark read/unread/seen ([API reference](https://www.magicbell.com/docs/api/reference)). I didn't confirm whether a server-side, per-user list call can be made with the project key. |
| Data location and the transaction guarantee | Data lives in MagicBell's cloud. Retention was not found. The transaction guarantee is lost unless we add an outbox. |
| Price | Builder: free, 1,000 deliveries/mo. Startup: $249/mo for 50k, then $0.0025 per delivery. Each channel counts as a separate delivery ([pricing](https://www.magicbell.com/pricing), undated). |
| Lock-in | High for the feed. |
| Postmark | **Not in the API's integration list**, which covers Mailgun, Ping Email, SendGrid, SES and SMTP. A marketing page mentions Postmark, so the two pages disagree. Postmark could probably be reached through the SMTP integration, but that is unverified. |
| Web push (v2) | **Native VAPID web push channel** (`PUT /v2/integrations/web_push` with our key pair) ([web push channel](https://www.magicbell.com/docs/channels/web_push)). Safari and iOS are subject to the usual Home Screen rules. |

## Analysis against Cadence's constraints

1. **The transaction guarantee (#7).** #7 writes `notifications` rows in the same SQLite transaction as the event, so the event and its Notifications are saved together or not at all. A vendor trigger is a network call, which can't be atomic with a SQLite commit. Keeping the guarantee would need an outbox table drained by a timer, plus retries. That costs at least as much machinery as #7's own timer, and #7 explicitly chose to have no outbox.
2. **The "one nudge until next visit" rule.** No vendor models a "visit." Each workaround keeps part of the rule in our database (`lastVisitedAt`) and part in the vendor's (batch, conditions, cancel). That splits one rule across two systems and makes it harder to test.
3. **Feed at page load.** Our feed is a SQL query in the loader. With a vendor, every signed-in page load (for the badge) makes a network call to the vendor, subject to its per-user rate limits (Knock notes the rate limit on the feed endpoint). It also adds an outage mode the app doesn't have today.
4. **Unsubscribe.** #7 needs `List-Unsubscribe` to point at *our* endpoint and flip *our* switch. The vendors either offer their own preference or unsubscribe link (Knock, SuprSend) or don't document custom headers at all. We would either have to give up our switch in favour of theirs or keep two in sync.
5. **Scale and cost.** At small scale the free tiers would cover the volume. But the features we need sit behind $30–$250/mo tiers: SuprSend batching, Novu retention beyond 30 days, MagicBell beyond 1k deliveries. Building costs nothing extra to run.
6. **Self-hosted Novu** removes the vendor cloud but adds MongoDB, Redis and several services. That conflicts directly with the one process and one SQLite file in ADR 0006.

## Recommendation

**Build, as decided in #7.** No vendor shown here keeps our transactional guarantee, and none expresses the "one email until next visit" rule natively. Each moves the feed, kept forever, into someone else's database, and none confirms support for our own `List-Unsubscribe` header through Postmark. What they mainly offer is multi-channel orchestration, hosted UI and templating. At Cadence's scale, with one email type and a plain-text body, we don't need those.

**For v2 web push:** don't adopt a vendor by default. The earlier [web-push research](https://github.com/danielroachzapper/cohort-005-project/blob/research/web-push-reach/docs/research/web-push-reach.md) found that one Node process can send web push with the `web-push` library and VAPID keys. If we later want a hosted push sender, MagicBell (native VAPID) is the closest fit for a push-only role. Knock and Novu would route it through FCM or OneSignal. Revisit the question only if Cadence adds mobile apps, SMS or many more notification types.

## Not verified

- Whether any vendor's Postmark "payload override" can set Postmark's `Headers` field (for `List-Unsubscribe` / `List-Unsubscribe-Post`). None of them documents it.
- Knock's per-recipient batch windows: the docs contradict themselves (the FAQ says unsupported, but window rules use the recipient's timezone).
- Courier's log retention for Business (90 vs 30 days, in conflicting docs) and Courier's server-side inbox read state.
- SuprSend's default inbox retention and whether it has a server-side unread-count endpoint. Its batch page may be stale (about 2023).
- Whether MagicBell supports Postmark (the API reference and the marketing page disagree), whether it has a digest step, and how long it retains data.
- Which features the self-hosted Community edition of Novu lacks compared with Novu Cloud. The comparison page wasn't readable.
- Most pricing and doc pages are undated. Figures are as displayed on 2026-11-17.
