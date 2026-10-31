import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Role = "admin" | "chef" | "agent";
export type Service = { id: string; name: string };
export type User = {
  id: string; name: string; title: string; role: Role; serviceId: string | null;
  username: string; password: string; revoked: boolean; enrollToken: string | null;
};
export type Attachment = { name: string; type: string; size: number; dataUrl: string };
export type Message = { id: string; convId: string; authorId: string; text: string; at: number; attachment?: Attachment | undefined; readBy: Record<string, number> };
/** "service" conversations have dynamic membership = all active users of that service (+ admins). */
export type Conversation = { id: string; name: string; kind: "service" | "group"; serviceId?: string | undefined; members: string[]; createdBy: string };
export type AckStatus = "en_attente" | "recu" | "lu";
export type Instruction = {
  id: string; title: string; body: string; sourceMessageId?: string | undefined; convId?: string | undefined;
  authorId: string; recipients: Record<string, AckStatus>; ackAt: Record<string, number>; deadline?: string | undefined; createdAt: number; closed: boolean;
};
export type Notif = { id: string; userId: string; text: string; at: number; read: boolean; tab: "messages" | "instructions"; convId?: string | undefined };
export type AuditEntry = { at: number; actorId: string; action: string };

type State = {
  services: Service[]; users: User[]; conversations: Conversation[]; messages: Message[];
  instructions: Instruction[]; notifs: Notif[]; audit: AuditEntry[];
};

/** Fictitious demo accounts only — never real people (sprint rule). */
export const DEMO_OTP = "226000";
export const MAX_FILE = 1.5 * 1024 * 1024;
const uid = () => Math.random().toString(36).slice(2, 10);
export const newToken = () => {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

const seed = (): State => {
  const now = Date.now();
  const u = (id: string, name: string, title: string, role: Role, serviceId: string | null, username: string): User =>
    ({ id, name, title, role, serviceId, username, password: "demo2026", revoked: false, enrollToken: null });
  return {
    services: [{ id: "s1", name: "Cabinet" }, { id: "s2", name: "Direction des études" }],
    users: [
      u("u1", "Awa Compaoré", "Administratrice système", "admin", null, "admin"),
      u("u2", "Issa Ouédraogo", "Directeur de cabinet", "chef", "s1", "issa"),
      u("u4", "Paul Kaboré", "Agent de liaison", "agent", "s1", "paul"),
      u("u5", "Fatou Zongo", "Cheffe des études", "chef", "s2", "fatou"),
      u("u3", "Mariam Sawadogo", "Chargée d'études", "agent", "s2", "mariam"),
    ],
    conversations: [
      { id: "c-s1", name: "Cabinet", kind: "service", serviceId: "s1", members: [], createdBy: "u1" },
      { id: "c-s2", name: "Direction des études", kind: "service", serviceId: "s2", members: [], createdBy: "u1" },
      { id: "c-g1", name: "Comité des chefs de service", kind: "group", members: ["u1", "u2", "u5"], createdBy: "u1" },
    ],
    messages: [
      { id: "m1", convId: "c-s1", authorId: "u2", text: "Bonjour à tous. Réunion de coordination lundi à 9h, salle B.", at: now - 3600e3 * 5, readBy: { u4: now - 3600e3 * 4 } },
      { id: "m3", convId: "c-s1", authorId: "u2", text: "Merci de transmettre vos rapports d'activité mensuels avant vendredi 17h.", at: now - 3600e3 * 2, readBy: {} },
      { id: "m4", convId: "c-s2", authorId: "u5", text: "Mariam, peux-tu préparer la synthèse du dossier numérique ?", at: now - 3600e3, readBy: {} },
      { id: "m5", convId: "c-g1", authorId: "u1", text: "Point mensuel des chefs de service jeudi à 10h.", at: now - 1800e3, readBy: {} },
    ],
    instructions: [], notifs: [],
    audit: [{ at: now, actorId: "u1", action: "Initialisation de l'espace de démonstration" }],
  };
};

const KEY = "fasobrief-state-v2";
const SESSION = "fasobrief-session";

/** Pure membership rule, exported for tests. */
export function membersOf(c: Conversation, users: User[]): string[] {
  const active = users.filter((u) => !u.revoked);
  if (c.kind === "service") return active.filter((u) => u.serviceId === c.serviceId).map((u) => u.id);
  return c.members.filter((id) => active.some((u) => u.id === id));
}
export function canIssue(u: User | null) {
  return !!u && !u.revoked && (u.role === "chef" || u.role === "admin");
}
/** Who a user may add to a new group: chef → own service only; admin → anyone. */
export function groupCandidates(me: User, users: User[]) {
  return users.filter((u) => !u.revoked && u.id !== me.id && (me.role === "admin" || (me.role === "chef" && u.serviceId === me.serviceId)));
}
export const encodeEnroll = (u: User) => btoa(unescape(encodeURIComponent(JSON.stringify({ t: u.enrollToken, id: u.id, n: u.name, ti: u.title, r: u.role, s: u.serviceId, un: u.username }))));
export function decodeEnroll(v: string): { t: string; id: string; n: string; ti: string; r: Role; s: string | null; un: string } | null {
  try {
    const raw = v.includes("enroll=") ? new URL(v).searchParams.get("enroll") ?? "" : v;
    const o = JSON.parse(decodeURIComponent(escape(atob(raw))));
    return typeof o?.t === "string" && typeof o?.id === "string" ? o : null;
  } catch { return null; }
}

type NewUser = { name: string; title: string; role: Role; serviceId: string | null; username: string; password: string };
type Api = State & {
  ready: boolean; me: User | null;
  checkPassword: (username: string, password: string) => string | null;
  login: (username: string, password: string, otp: string) => string | null;
  loginWithQr: (payload: string) => string | null;
  logout: () => void;
  myConversations: () => (Conversation & { memberIds: string[] })[];
  send: (convId: string, text: string, attachment?: Attachment) => void;
  markRead: (convId: string) => void;
  createGroup: (name: string, memberIds: string[]) => string | null;
  createInstruction: (i: Omit<Instruction, "id" | "authorId" | "createdAt" | "closed" | "recipients" | "ackAt"> & { recipientIds: string[] }) => void;
  acknowledge: (id: string, status: AckStatus) => void;
  closeInstruction: (id: string) => void;
  readNotifs: () => void;
  addService: (name: string) => void;
  createUser: (u: NewUser) => string | null;
  updateUser: (id: string, patch: Partial<NewUser>) => string | null;
  regenToken: (id: string) => void;
  revoke: (userId: string) => void;
  reinstate: (userId: string) => void;
  reset: () => void;
};

const Ctx = createContext<Api | null>(null);

function pushNotif(st: State, userIds: string[], text: string, tab: Notif["tab"], convId?: string): Notif[] {
  const add = userIds.map((userId) => ({ id: uid(), userId, text, at: Date.now(), read: false, tab, convId }));
  return [...add, ...st.notifs].slice(0, 300);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(seed);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const fromStorage = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS(JSON.parse(raw));
      setSessionId(sessionStorage.getItem(SESSION));
    } catch { /* ignore */ }
    setReady(true);
    // Cross-tab sync so two agents in two tabs see messages/notifications live.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) { fromStorage.current = true; setS(JSON.parse(e.newValue)); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (fromStorage.current) { fromStorage.current = false; return; }
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
  }, [s, ready]);
  useEffect(() => {
    if (!ready) return;
    if (sessionId) sessionStorage.setItem(SESSION, sessionId); else sessionStorage.removeItem(SESSION);
  }, [sessionId, ready]);

  // Revocation is immediate: a revoked user's session resolves to null.
  const me = s.users.find((u) => u.id === sessionId && !u.revoked) ?? null;
  const log = (st: State, action: string): AuditEntry[] => [{ at: Date.now(), actorId: sessionId ?? "-", action }, ...st.audit].slice(0, 200);
  const findByUsername = (n: string) => s.users.find((x) => x.username.toLowerCase() === n.trim().toLowerCase());
  const mine = () => s.conversations
    .map((c) => ({ ...c, memberIds: membersOf(c, s.users) }))
    .filter((c) => me && (c.memberIds.includes(me.id) || (me.role === "admin" && c.kind === "service")));

  const api: Api = {
    ...s, ready, me,
    checkPassword(username, password) {
      const u = findByUsername(username);
      if (!u || u.password !== password) return "Identifiants incorrects.";
      if (u.revoked) return "Ce compte a été révoqué. Contactez l'administrateur.";
      return null;
    },
    login(username, password, otp) {
      const err = api.checkPassword(username, password);
      if (err) return err;
      if (otp !== DEMO_OTP) return "Code de vérification invalide.";
      const u = findByUsername(username)!;
      setSessionId(u.id);
      setS((st) => ({ ...st, audit: [{ at: Date.now(), actorId: u.id, action: "Connexion (2 facteurs)" }, ...st.audit] }));
      return null;
    },
    loginWithQr(payload) {
      const p = decodeEnroll(payload);
      if (!p) return "QR code non reconnu.";
      let u = s.users.find((x) => x.id === p.id);
      if (u && u.revoked) return "Ce compte a été révoqué.";
      if (u && u.enrollToken !== p.t) return "QR code expiré ou déjà utilisé.";
      if (!u) {
        // Another device: enrol the account locally from the signed-by-admin payload.
        u = { id: p.id, name: p.n, title: p.ti, role: p.r, serviceId: p.s, username: p.un, password: newToken(), revoked: false, enrollToken: null };
        const nu = u;
        setS((st) => ({ ...st, users: [...st.users, nu] }));
      }
      const id = u.id;
      setSessionId(id);
      // One-time token: consumed on use.
      setS((st) => ({ ...st, users: st.users.map((x) => (x.id === id ? { ...x, enrollToken: null } : x)),
        audit: [{ at: Date.now(), actorId: id, action: "Connexion par QR code d'enrôlement" }, ...st.audit] }));
      return null;
    },
    logout() { setSessionId(null); },
    myConversations: mine,
    send(convId, text, attachment) {
      if (!me) return;
      const conv = mine().find((c) => c.id === convId);
      if (!conv) return;
      if (attachment && attachment.size > MAX_FILE) return;
      const others = conv.memberIds.filter((id) => id !== me.id);
      setS((st) => ({
        ...st,
        messages: [...st.messages, { id: uid(), convId, authorId: me.id, text, at: Date.now(), attachment, readBy: {} }],
        notifs: pushNotif(st, others, `${me.name} · ${conv.name} : ${attachment && !text ? `Fichier « ${attachment.name} »` : text.slice(0, 80)}`, "messages", convId),
      }));
    },
    markRead(convId) {
      if (!me) return;
      const now = Date.now();
      const need = s.messages.some((m) => m.convId === convId && m.authorId !== me.id && !m.readBy[me.id]);
      const needN = s.notifs.some((n) => n.userId === me.id && n.convId === convId && !n.read);
      if (!need && !needN) return;
      setS((st) => ({
        ...st,
        messages: st.messages.map((m) => (m.convId === convId && m.authorId !== me.id && !m.readBy[me.id] ? { ...m, readBy: { ...m.readBy, [me.id]: now } } : m)),
        notifs: st.notifs.map((n) => (n.userId === me.id && n.convId === convId ? { ...n, read: true } : n)),
      }));
    },
    createGroup(name, memberIds) {
      if (!me || (me.role !== "chef" && me.role !== "admin")) return "Seuls les chefs de service et l'administrateur peuvent créer un groupe.";
      const allowed = new Set(groupCandidates(me, s.users).map((u) => u.id));
      const ids = memberIds.filter((id) => allowed.has(id));
      if (!name.trim()) return "Donnez un nom au groupe.";
      if (ids.length === 0) return "Choisissez au moins un membre.";
      const id = uid();
      setS((st) => ({
        ...st,
        conversations: [...st.conversations, { id, name: name.trim(), kind: "group", members: [me.id, ...ids], createdBy: me.id, serviceId: me.role === "chef" ? me.serviceId ?? undefined : undefined }],
        notifs: pushNotif(st, ids, `${me.name} vous a ajouté au groupe « ${name.trim()} »`, "messages", id),
        audit: log(st, `Groupe créé : « ${name.trim()} »`),
      }));
      return null;
    },
    createInstruction({ recipientIds, ...rest }) {
      if (!canIssue(me)) return;
      const valid = recipientIds.filter((id) => s.users.find((u) => u.id === id && !u.revoked));
      setS((st) => ({
        ...st,
        instructions: [{ ...rest, id: uid(), authorId: me!.id, createdAt: Date.now(), closed: false, ackAt: {},
          recipients: Object.fromEntries(valid.map((id) => [id, "en_attente" as AckStatus])) }, ...st.instructions],
        notifs: pushNotif(st, valid, `Nouvelle instruction de ${me!.name} : « ${rest.title} »`, "instructions"),
        audit: log(st, `Instruction émise : « ${rest.title} »`),
      }));
    },
    acknowledge(id, status) {
      if (!me) return;
      const ins = s.instructions.find((i) => i.id === id);
      if (!ins || !(me.id in ins.recipients) || ins.closed) return;
      setS((st) => ({
        ...st,
        instructions: st.instructions.map((i) => (i.id === id ? { ...i, recipients: { ...i.recipients, [me.id]: status }, ackAt: { ...i.ackAt, [me.id]: Date.now() } } : i)),
        notifs: pushNotif(st, [ins.authorId], `${me.name} : ${status === "lu" ? "a pris connaissance de" : "a reçu"} « ${ins.title} »`, "instructions"),
        audit: log(st, `Accusé « ${status === "lu" ? "pris connaissance" : "reçu"} » — ${ins.title}`),
      }));
    },
    closeInstruction(id) {
      setS((st) => ({ ...st, instructions: st.instructions.map((i) => (i.id === id && i.authorId === me?.id ? { ...i, closed: true } : i)), audit: log(st, "Instruction clôturée") }));
    },
    readNotifs() {
      if (!me) return;
      setS((st) => ({ ...st, notifs: st.notifs.map((n) => (n.userId === me.id ? { ...n, read: true } : n)) }));
    },
    addService(name) {
      if (me?.role !== "admin" || !name.trim()) return;
      const id = uid();
      setS((st) => ({ ...st, services: [...st.services, { id, name: name.trim() }],
        conversations: [...st.conversations, { id: `c-${id}`, name: name.trim(), kind: "service", serviceId: id, members: [], createdBy: me.id }],
        audit: log(st, `Service créé : ${name.trim()}`) }));
    },
    createUser(nu) {
      if (me?.role !== "admin") return "Action réservée à l'administrateur.";
      if (!nu.name.trim() || !nu.username.trim()) return "Nom et identifiant requis.";
      if (nu.password.length < 8) return "Mot de passe : 8 caractères minimum.";
      if (nu.role !== "admin" && !nu.serviceId) return "Choisissez un service.";
      if (findByUsername(nu.username)) return "Cet identifiant existe déjà.";
      const id = uid();
      setS((st) => ({ ...st, users: [...st.users, { ...nu, name: nu.name.trim(), username: nu.username.trim().toLowerCase(), id, revoked: false, enrollToken: newToken() }],
        audit: log(st, `Agent enrôlé : ${nu.name.trim()}`) }));
      return null;
    },
    updateUser(id, patch) {
      if (me?.role !== "admin") return "Action réservée à l'administrateur.";
      if (patch.password !== undefined && patch.password.length < 8) return "Mot de passe : 8 caractères minimum.";
      if (patch.username) { const o = findByUsername(patch.username); if (o && o.id !== id) return "Cet identifiant existe déjà."; }
      if (id === me.id && patch.role && patch.role !== "admin") return "Vous ne pouvez pas retirer votre propre rôle d'administrateur.";
      setS((st) => ({ ...st, users: st.users.map((u) => (u.id === id ? { ...u, ...patch, username: (patch.username ?? u.username).toLowerCase() } : u)),
        audit: log(st, `Compte modifié : ${s.users.find((u) => u.id === id)?.name}`) }));
      return null;
    },
    regenToken(id) {
      if (me?.role !== "admin") return;
      setS((st) => ({ ...st, users: st.users.map((u) => (u.id === id ? { ...u, enrollToken: newToken() } : u)), audit: log(st, "QR code d'enrôlement régénéré") }));
    },
    revoke(userId) {
      if (me?.role !== "admin" || userId === me.id) return;
      const name = s.users.find((u) => u.id === userId)?.name;
      setS((st) => ({
        ...st,
        users: st.users.map((u) => (u.id === userId ? { ...u, revoked: true, enrollToken: null } : u)),
        conversations: st.conversations.map((c) => ({ ...c, members: c.members.filter((m) => m !== userId) })),
        instructions: st.instructions.map((i) => { const r = { ...i.recipients }; delete r[userId]; return { ...i, recipients: r }; }),
        audit: log(st, `Révocation de ${name} : sessions fermées, retrait de toutes les conversations`),
      }));
    },
    reinstate(userId) {
      if (me?.role !== "admin") return;
      setS((st) => ({ ...st, users: st.users.map((u) => (u.id === userId ? { ...u, revoked: false } : u)), audit: log(st, "Réactivation d'un compte") }));
    },
    reset() { setS(seed()); setSessionId(null); },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
