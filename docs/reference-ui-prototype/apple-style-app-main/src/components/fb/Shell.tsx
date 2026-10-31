import { useEffect, useRef, useState } from "react";
import { MessagesSquare, ClipboardCheck, Users, LogOut, ShieldCheck, ScrollText, Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toaster } from "@/components/ui/sonner";
import { Chat } from "./Chat";
import { Instructions } from "./Instructions";
import { Admin } from "./Admin";
import { initials, time } from "./util";

type Tab = "messages" | "instructions" | "admin";
const roleLabel = { admin: "Administrateur", chef: "Chef de service", agent: "Agent" };

export function Shell() {
  const { me, logout, instructions, notifs, readNotifs, services } = useStore();
  const [tab, setTab] = useState<Tab>("messages");
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>("default");
  const pending = instructions.filter((i) => !i.closed && i.recipients[me!.id] === "en_attente").length;
  const myNotifs = notifs.filter((n) => n.userId === me!.id);
  const unread = myNotifs.filter((n) => !n.read);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { if ("Notification" in window) setPerm(Notification.permission); }, []);
  // Live alerts for notifications that arrive while the app is open.
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(myNotifs.map((n) => n.id)); return; }
    for (const n of unread) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      toast(n.text);
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("FasoBrief", { body: n.text });
    }
  }, [unread, myNotifs]);

  const items = [
    { id: "messages" as const, label: "Messages", icon: MessagesSquare },
    { id: "instructions" as const, label: "Instructions", icon: ClipboardCheck, badge: pending },
    ...(me!.role === "admin" ? [{ id: "admin" as const, label: "Administration", icon: Users }] : []),
  ];
  const service = services.find((s) => s.id === me!.serviceId)?.name;

  const bell = (
    <Popover onOpenChange={(o) => { if (!o && unread.length) readNotifs(); }}>
      <PopoverTrigger asChild>
        <button aria-label={`Notifications (${unread.length} non lues)`} className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Bell className="h-5 w-5" strokeWidth={1.75} />
          {unread.length > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-destructive-foreground">{unread.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {perm !== "granted" && "Notification" in globalThis && (
            <button className="flex items-center gap-1 text-xs text-primary" onClick={async () => setPerm(await Notification.requestPermission())}><BellRing className="h-3.5 w-3.5" /> Activer les alertes</button>
          )}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {myNotifs.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune notification</li>}
          {myNotifs.slice(0, 30).map((n) => (
            <li key={n.id}>
              <button onClick={() => { setTab(n.tab); if (n.convId) setOpenConv(n.convId); }} className={`flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-secondary ${n.read ? "text-muted-foreground" : ""}`}>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                <span className="min-w-0 flex-1 break-words">{n.text}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{time(n.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-background md:flex-row">
      <Toaster position="top-center" />
      {/* Mobile top bar */}
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="h-4 w-4" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{me!.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{roleLabel[me!.role]}{service && ` · ${service}`}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {bell}
          <button onClick={logout} aria-label="Se déconnecter" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"><LogOut className="h-5 w-5" strokeWidth={1.75} /></button>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="h-4 w-4" /></div>
            <span className="text-lg font-semibold tracking-tight">FasoBrief</span>
          </div>
          {bell}
        </div>
        <nav className="flex flex-col gap-1" aria-label="Navigation principale">
          {items.map((it) => (
            <button key={it.id} onClick={() => setTab(it.id)} aria-current={tab === it.id ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === it.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              <it.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {it.label}
              {!!it.badge && <span className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{it.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground">{initials(me!.name)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{me!.name}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel[me!.role]}{service && ` · ${service}`}</p>
            </div>
            <button onClick={logout} aria-label="Se déconnecter" className="text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><ScrollText className="h-3 w-3" /> Prototype — données fictives</p>
        </div>
      </aside>

      <main className="min-h-0 flex-1">
        {tab === "messages" && <Chat openConv={openConv} onOpened={() => setOpenConv(null)} />}
        {tab === "instructions" && <Instructions />}
        {tab === "admin" && <Admin />}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigation principale">
        {items.map((it) => (
          <button key={it.id} onClick={() => setTab(it.id)} aria-current={tab === it.id ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === it.id ? "text-primary" : "text-muted-foreground"}`}>
            <it.icon className="h-6 w-6" strokeWidth={1.75} />
            {it.label}
            {!!it.badge && <span className="absolute left-1/2 top-1 ml-2 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{it.badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
