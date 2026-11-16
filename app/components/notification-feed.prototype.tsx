// PROTOTYPE: throwaway. Answers "How should the Notification Feed look and behave?"
// (wayfinder ticket #4). Three structurally different variants, switchable via
// `?variant=A|B|C` on any page inside the app layout, plus `?empty=1` for the
// empty state. In-memory sample Notifications only: no DB, no real mutations.
// Lives on the `prototype/notification-feed` branch; never merge to main.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  MessageSquareReply,
  Receipt,
  UsersRound,
  X,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { UserRole } from "~/db/schema";

// ─── Sample data ───

type Kind =
  | "discussion_answer"
  | "discussion_question"
  | "refund_decided"
  | "refund_raised"
  | "seat_claimed";

type SampleNotification = {
  id: number;
  kind: Kind;
  text: string;
  target: string; // where clicking it would take you
  createdAt: string;
  read: boolean;
};

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const H = 60;
const D = 24 * H;

function sampleFor(
  role: UserRole | null,
  isTeamAdmin: boolean
): SampleNotification[] {
  let n = 0;
  const make = (
    kind: Kind,
    text: string,
    target: string,
    minutesAgo: number,
    read = false
  ): SampleNotification => ({
    id: ++n,
    kind,
    text,
    target,
    createdAt: ago(minutesAgo),
    read,
  });

  if (role === UserRole.Student) {
    const list = [
      make("discussion_answer", "Ana (Instructor) answered your question on Lesson 3 · Intro to SQL", "/courses/intro-to-sql/lessons/3#comment-41", 12),
      make("refund_decided", "Your refund request for Advanced TypeScript was declined", "/courses/advanced-typescript", 2 * H),
      make("discussion_answer", "Sam (Platform Admin) answered your question on Lesson 1 · React Basics", "/courses/react-basics/lessons/1#comment-12", 3 * D, true),
      make("discussion_answer", "Ana (Instructor) answered your question on Lesson 7 · Intro to SQL", "/courses/intro-to-sql/lessons/7#comment-9", 45 * D, true),
    ];
    if (isTeamAdmin) {
      list.push(
        make("seat_claimed", "Ben claimed a seat on Intro to SQL (3 of 10 claimed)", "/team", 1 * H),
        make("seat_claimed", "Priya claimed a seat on Intro to SQL (2 of 10 claimed)", "/team", 5 * H),
        make("seat_claimed", "Leo claimed a seat on Intro to SQL (1 of 10 claimed)", "/team", 8 * D, true),
        make("refund_decided", "Your refund request for the React Basics team licence was approved", "/team", 20 * D, true)
      );
    }
    return list;
  }

  if (role === UserRole.Instructor) {
    return [
      make("discussion_question", "New question on Lesson 3 · Intro to SQL from Ben", "/courses/intro-to-sql/lessons/3#comment-50", 4),
      make("discussion_question", "New question on Lesson 3 · Intro to SQL from Priya", "/courses/intro-to-sql/lessons/3#comment-49", 25),
      make("discussion_question", "New question on Lesson 5 · Intro to SQL from Leo", "/courses/intro-to-sql/lessons/5#comment-47", 50),
      make("discussion_question", "New question on Lesson 2 · Advanced SQL from Mia", "/courses/advanced-sql/lessons/2#comment-46", 3 * H),
      make("discussion_question", "New question on Lesson 1 · Intro to SQL from Tom", "/courses/intro-to-sql/lessons/1#comment-44", 6 * H),
      make("discussion_question", "New question on Lesson 4 · Advanced SQL from Zoe", "/courses/advanced-sql/lessons/4#comment-30", 2 * D, true),
      make("discussion_question", "New question on Lesson 8 · Intro to SQL from Raj", "/courses/intro-to-sql/lessons/8#comment-12", 40 * D, true),
    ];
  }

  if (role === UserRole.Admin) {
    return [
      make("refund_raised", "New refund request: Intro to SQL (£49) from Ben", "/admin/refunds", 30),
      make("refund_raised", "New refund request: React Basics team licence (£490) from Priya", "/admin/refunds", 4 * H),
      make("refund_raised", "New refund request: Advanced TypeScript (£79) from Leo", "/admin/refunds", 1 * D),
      make("refund_raised", "New refund request: Intro to SQL (£49) from Mia", "/admin/refunds", 6 * D, true),
      make("refund_raised", "New refund request: Advanced SQL (£59) from Tom", "/admin/refunds", 50 * D, true),
    ];
  }

  return [];
}

const KIND_ICON: Record<Kind, ReactNode> = {
  discussion_answer: <MessageSquareReply className="size-4" />,
  discussion_question: <MessageSquare className="size-4" />,
  refund_decided: <Receipt className="size-4" />,
  refund_raised: <Receipt className="size-4" />,
  seat_claimed: <UsersRound className="size-4" />,
};

const KIND_GROUP: Record<Kind, string> = {
  discussion_answer: "Discussions",
  discussion_question: "Discussions",
  refund_decided: "Refunds",
  refund_raised: "Refunds",
  seat_claimed: "Team",
};

// ─── Store ───

type Store = {
  items: SampleNotification[];
  unread: number;
  variant: Variant;
  open: boolean;
  setOpen: (open: boolean) => void;
  markRead: (id: number, read?: boolean) => void;
  markAllRead: () => void;
  reset: () => void;
};

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: "Bell + dropdown",
  B: "Slide-over panel",
  C: "Feed page",
};

const Ctx = createContext<Store | null>(null);
const useStore = () => useContext(Ctx);

export function NotificationFeedPrototypeProvider({
  role,
  isTeamAdmin,
  children,
}: {
  role: UserRole | null;
  isTeamAdmin: boolean;
  children: ReactNode;
}) {
  const [params] = useSearchParams();
  const variant = (VARIANTS as readonly string[]).includes(
    params.get("variant") ?? ""
  )
    ? (params.get("variant") as Variant)
    : "A";
  const empty = params.get("empty") === "1";

  const [items, setItems] = useState(() => sampleFor(role, isTeamAdmin));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setItems(sampleFor(role, isTeamAdmin));
  }, [role, isTeamAdmin]);
  useEffect(() => setOpen(false), [variant]);

  const visible = empty ? [] : items;
  const store: Store = {
    items: visible,
    unread: visible.filter((i) => !i.read).length,
    variant,
    open,
    setOpen,
    markRead: (id, read = true) =>
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read } : x))),
    markAllRead: () => setItems((xs) => xs.map((x) => ({ ...x, read: true }))),
    reset: () => setItems(sampleFor(role, isTeamAdmin)),
  };

  if (!import.meta.env.DEV) return <>{children}</>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// ─── Shared bits (rows only; each variant owns its layout) ───

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function wouldNavigate(target: string) {
  toast(`Would go to ${target}`, { duration: 2000 });
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("text-center text-muted-foreground", compact ? "p-6 text-sm" : "p-16")}>
      <Bell className={cn("mx-auto mb-2 opacity-40", compact ? "size-6" : "size-10")} />
      <div className="font-medium">You're all caught up</div>
      <div className="text-xs">
        Answers to your questions, refund decisions and team updates will show up here.
      </div>
    </div>
  );
}

// ─── Variant A: bell in the sidebar header + dropdown; read on click ───

function VariantAHeaderAction() {
  const s = useStore()!;
  const [seeAll, setSeeAll] = useState(false);
  const latest = s.items.slice(0, 5);

  return (
    <>
      <button
        onClick={() => s.setOpen(!s.open)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
      >
        <Bell className="size-5" />
        <UnreadBadge count={s.unread} className="absolute -right-1 -top-1" />
      </button>

      {s.open && (
        <div className="fixed left-52 top-3 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="font-semibold">Notifications</div>
            {s.unread > 0 && (
              <button onClick={s.markAllRead} className="text-xs text-primary hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          {latest.length === 0 ? (
            <EmptyState compact />
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {latest.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      s.markRead(n.id);
                      s.setOpen(false);
                      wouldNavigate(n.target);
                    }}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-accent",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <span className="mt-0.5 text-muted-foreground">{KIND_ICON[n.kind]}</span>
                    <span className="flex-1">
                      <span className={cn(!n.read && "font-semibold")}>{n.text}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {s.items.length > latest.length && (
            <button
              onClick={() => {
                s.setOpen(false);
                setSeeAll(true);
              }}
              className="w-full border-t py-2 text-sm text-primary hover:bg-accent"
            >
              See all {s.items.length}
            </button>
          )}
        </div>
      )}

      {seeAll && (
        <div className="fixed inset-y-0 left-56 right-0 z-40 overflow-y-auto bg-background p-8">
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">All notifications</h1>
              <button onClick={() => setSeeAll(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-5" />
              </button>
            </div>
            <ul className="divide-y rounded-lg border">
              {s.items.map((n) => (
                <li key={n.id} className={cn("flex gap-3 p-4 text-sm", !n.read && "bg-primary/5")}>
                  <span className="text-muted-foreground">{KIND_ICON[n.kind]}</span>
                  <button
                    className={cn("flex-1 text-left hover:underline", !n.read && "font-semibold")}
                    onClick={() => {
                      s.markRead(n.id);
                      wouldNavigate(n.target);
                    }}
                  >
                    {n.text}
                  </button>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Variant B: nav item + right slide-over, grouped by day; opening reads all ───

function dayBucket(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / (D * 60_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "This week";
  return "Older";
}

function VariantBNavItem() {
  const s = useStore()!;
  const [newIds, setNewIds] = useState<Set<number>>(new Set());

  function openPanel() {
    // Opening the Feed is what reads everything; remember which were new so
    // they're still highlighted while the panel stays open.
    setNewIds(new Set(s.items.filter((i) => !i.read).map((i) => i.id)));
    s.markAllRead();
    s.setOpen(true);
  }

  const groups = useMemo(() => {
    const g = new Map<string, SampleNotification[]>();
    for (const n of s.items) {
      const k = dayBucket(n.createdAt);
      g.set(k, [...(g.get(k) ?? []), n]);
    }
    return [...g.entries()];
  }, [s.items]);

  return (
    <>
      <button
        onClick={openPanel}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        <UnreadBadge count={s.unread} className="ml-auto" />
      </button>

      {s.open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => s.setOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l bg-background shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b px-5">
              <div className="font-semibold">Notifications</div>
              <button onClick={() => s.setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-5" />
              </button>
            </div>
            {s.items.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex-1 overflow-y-auto">
                {groups.map(([label, list]) => (
                  <section key={label}>
                    <div className="sticky top-0 bg-muted px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </div>
                    {list.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => wouldNavigate(n.target)}
                        className="flex w-full gap-3 border-b px-5 py-4 text-left text-sm hover:bg-accent"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          {KIND_ICON[n.kind]}
                        </span>
                        <span className="flex-1">
                          {newIds.has(n.id) && (
                            <span className="mr-1.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                              New
                            </span>
                          )}
                          {n.text}
                          <span className="block text-xs text-muted-foreground">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}

// ─── Variant C: nav item + full Feed page with filters; read on visiting the target ───

function VariantCNavItem() {
  const s = useStore()!;
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [group, setGroup] = useState<string | null>(null);

  const groupsPresent = [...new Set(s.items.map((i) => KIND_GROUP[i.kind]))];
  const shown = s.items.filter(
    (i) => (tab === "all" || !i.read) && (!group || KIND_GROUP[i.kind] === group)
  );

  return (
    <>
      <button
        onClick={() => s.setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          s.open ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70"
        )}
      >
        <Bell className="size-4" />
        Notifications
        {s.unread > 0 && (
          <span className="ml-auto text-xs font-semibold text-primary">{s.unread} new</span>
        )}
      </button>

      {s.open && (
        <div className="fixed inset-y-0 left-56 right-0 z-40 overflow-y-auto bg-background">
          <div className="mx-auto max-w-3xl p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Notifications</h1>
                <p className="text-sm text-muted-foreground">
                  Marked read when you open the thing it's about.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={s.markAllRead}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <CheckCheck className="size-4" /> Mark all as read
                </button>
                <button onClick={() => s.setOpen(false)} className="rounded p-1 hover:bg-accent">
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              {(["all", "unread"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-3 py-1 capitalize",
                    tab === t ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  {t}
                  {t === "unread" && s.unread > 0 ? ` (${s.unread})` : ""}
                </button>
              ))}
              <span className="mx-2 h-5 w-px bg-border" />
              {groupsPresent.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(group === g ? null : g)}
                  className={cn(
                    "rounded-full border px-3 py-1",
                    group === g && "border-primary text-primary"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <EmptyState />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {shown.map((n) => (
                    <tr key={n.id} className="border-b align-top">
                      <td className="w-6 py-3">
                        {!n.read && <span className="mt-1.5 block size-2 rounded-full bg-blue-600" />}
                      </td>
                      <td className="w-8 py-3 text-muted-foreground">{KIND_ICON[n.kind]}</td>
                      <td className={cn("py-3 pr-4", !n.read && "font-semibold")}>{n.text}</td>
                      <td className="w-24 whitespace-nowrap py-3 text-xs text-muted-foreground">
                        {formatRelativeTime(n.createdAt)}
                      </td>
                      <td className="w-40 whitespace-nowrap py-3 text-right">
                        <button
                          onClick={() => {
                            s.markRead(n.id);
                            wouldNavigate(n.target);
                          }}
                          className="mr-3 text-primary hover:underline"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => s.markRead(n.id, !n.read)}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Mark {n.read ? "unread" : "read"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Showing everything from the last 90 days (placeholder; retention is its own ticket).
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Mount points the layout/sidebar use ───

export function FeedHeaderAction() {
  const s = useStore();
  return s?.variant === "A" ? <VariantAHeaderAction /> : null;
}

export function FeedNavItem() {
  const s = useStore();
  if (s?.variant === "B") return <VariantBNavItem />;
  if (s?.variant === "C") return <VariantCNavItem />;
  return null;
}

// ─── Floating switcher (dev only) ───

export function PrototypeSwitcher() {
  const s = useStore();
  const [params, setParams] = useSearchParams();
  const [showState, setShowState] = useState(false);

  const current = s?.variant ?? "A";
  const go = (delta: number) => {
    const i = VARIANTS.indexOf(current);
    const next = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length];
    const p = new URLSearchParams(params);
    p.set("variant", next);
    setParams(p, { replace: true, preventScrollReset: true });
  };
  const toggleEmpty = () => {
    const p = new URLSearchParams(params);
    if (p.get("empty") === "1") p.delete("empty");
    else p.set("empty", "1");
    setParams(p, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV || !s) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2">
      {showState && (
        <pre className="mb-2 max-h-64 w-[520px] overflow-auto rounded-lg bg-zinc-900 p-3 text-[11px] text-zinc-100 shadow-xl">
          {JSON.stringify(
            {
              variant: `${current} (${VARIANT_NAMES[current]})`,
              open: s.open,
              unread: s.unread,
              items: s.items.map((i) => `${i.read ? "  read" : "UNREAD"}  #${i.id} ${i.kind}`),
            },
            null,
            2
          )}
        </pre>
      )}
      <div className="flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
        <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">Prototype</span>
        <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-44 text-center font-medium">
          {current} ({VARIANT_NAMES[current]})
        </span>
        <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10">
          <ChevronRight className="size-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-white/20" />
        <button onClick={toggleEmpty} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/10">
          {params.get("empty") === "1" ? "Show sample" : "Empty"}
        </button>
        <button onClick={s.reset} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/10">
          Reset
        </button>
        <button onClick={() => setShowState(!showState)} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/10">
          State
        </button>
      </div>
    </div>
  );
}
