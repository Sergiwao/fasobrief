import { useEffect, useState } from "react";
import { UserX, UserCheck, History, RotateCcw, UserPlus, QrCode, Pencil, Building2, Plus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useStore, encodeEnroll, type Role, type User } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { initials, date, time } from "./util";

const roles: Record<Role, string> = { admin: "Administrateur", chef: "Chef de service", agent: "Agent" };

function UserForm({ user, onClose }: { user?: User | undefined; onClose: (created?: string) => void }) {
  const { services, createUser, updateUser } = useStore();
  const [f, setF] = useState({ name: user?.name ?? "", title: user?.title ?? "", username: user?.username ?? "", password: "", role: user?.role ?? ("agent" as Role), serviceId: user?.serviceId ?? services[0]?.id ?? null });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    const data = { ...f, serviceId: f.role === "admin" ? null : f.serviceId };
    const e = user
      ? updateUser(user.id, { name: data.name, title: data.title, username: data.username, role: data.role, serviceId: data.serviceId, ...(f.password ? { password: f.password } : {}) })
      : createUser(data);
    if (e) return setErr(e);
    onClose(user ? undefined : f.username.trim().toLowerCase());
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Modifier l'agent" : "Enrôler un agent"}</DialogTitle>
          <DialogDescription>Utilisez uniquement des identités fictives pour la démonstration.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="f-n">Nom complet</Label><Input id="f-n" value={f.name} onChange={(e) => set("name")(e.target.value)} maxLength={80} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-t">Fonction</Label><Input id="f-t" value={f.title} onChange={(e) => set("title")(e.target.value)} maxLength={80} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="f-u">Identifiant</Label><Input id="f-u" autoCapitalize="none" value={f.username} onChange={(e) => set("username")(e.target.value.replace(/\s/g, ""))} maxLength={30} /></div>
            <div className="space-y-1.5"><Label htmlFor="f-p">{user ? "Nouveau mot de passe" : "Mot de passe"}</Label><Input id="f-p" type="password" autoComplete="new-password" placeholder={user ? "Inchangé" : "8 caractères min."} value={f.password} onChange={(e) => set("password")(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <Select value={f.role} onValueChange={set("role")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(roles) as Role[]).map((r) => <SelectItem key={r} value={r}>{roles[r]}</SelectItem>)}</SelectContent></Select>
            </div>
            {f.role !== "admin" && (
              <div className="space-y-1.5">
                <Label>Service</Label>
                <Select value={f.serviceId ?? ""} onValueChange={set("serviceId")}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
          </div>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={submit}>{user ? "Enregistrer" : "Enrôler"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { regenToken } = useStore();
  const url = user.enrollToken ? `${window.location.origin}/?enroll=${encodeEnroll(user)}` : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR code d'enrôlement</DialogTitle>
          <DialogDescription>{user.name} scanne ce code avec son téléphone pour se connecter automatiquement. Usage unique.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-2xl border bg-card p-5">
          {url ? <QRCodeSVG value={url} size={220} level="M" /> : <p className="py-16 text-center text-sm text-muted-foreground">Code déjà utilisé ou expiré.</p>}
        </div>
        <p className="text-center text-xs text-muted-foreground">Identifiant : <span className="font-medium text-foreground">{user.username}</span></p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => regenToken(user.id)}><RotateCcw className="h-4 w-4" /> Nouveau code</Button>
          <Button onClick={onClose}>Terminé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Admin() {
  const { me, users, services, audit, revoke, reinstate, reset, addService } = useStore();
  const [form, setForm] = useState<{ user?: User } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [svcName, setSvcName] = useState("");
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "Système";
  const groups = [...services.map((s) => ({ id: s.id as string | null, name: s.name })), { id: null, name: "Administration" }];
  const [pendingQr, setPendingQr] = useState<string | null>(null);
  // Open the QR right after enrolling a new agent.
  useEffect(() => {
    if (!pendingQr) return;
    const nu = users.find((u) => u.username === pendingQr);
    if (nu) { setQr(nu.id); setPendingQr(null); }
  }, [pendingQr, users]);
  const qrUser = users.find((u) => u.id === qr);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">Administration</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enrôlement, services, rôles et révocation</p>
          </div>
          <Button className="rounded-full" onClick={() => setForm({})}><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Enrôler un agent</span></Button>
        </div>

        <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); addService(svcName); setSvcName(""); }}>
          <Input value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="Nouveau service (ex. Direction financière)" aria-label="Nom du nouveau service" className="h-10 min-w-0 rounded-full" maxLength={60} />
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-full" disabled={!svcName.trim()}><Plus className="h-4 w-4" /> Service</Button>
        </form>

        {groups.map((g) => {
          const list = users.filter((u) => u.serviceId === g.id);
          if (g.id === null && list.length === 0) return null;
          return (
            <section key={g.id ?? "admin"} className="mt-6">
              <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-muted-foreground"><Building2 className="h-4 w-4" /> {g.name} <span className="font-normal">· {list.length}</span></h3>
              <ul className="divide-y rounded-2xl border bg-card">
                {list.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aucun agent dans ce service.</li>}
                {list.map((u) => (
                  <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${u.revoked ? "bg-secondary text-muted-foreground" : "bg-primary-soft text-accent-foreground"}`}>{initials(u.name)}</div>
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${u.revoked ? "text-muted-foreground line-through" : ""}`}>{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{roles[u.role]} · {u.title || "—"} · @{u.username}{u.revoked && " · Révoqué"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      {!u.revoked && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setForm({ user: u })}><Pencil className="h-4 w-4" /> Modifier</Button>}
                      {!u.revoked && u.id !== me!.id && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setQr(u.id)}><QrCode className="h-4 w-4" /> QR</Button>}
                      {u.id !== me!.id && (u.revoked ? (
                        <Button variant="outline" size="sm" className="rounded-full" onClick={() => reinstate(u.id)}><UserCheck className="h-4 w-4" /> Réactiver</Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive"><UserX className="h-4 w-4" /> Révoquer</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Révoquer {u.name} ?</AlertDialogTitle>
                              <AlertDialogDescription>Ses sessions seront fermées, la connexion refusée, son QR code annulé et l'agent retiré de toutes les conversations.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => revoke(u.id)}>Révoquer</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <div className="mt-10 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5 text-primary" /> Journal d'audit</h3>
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Réinitialiser la démo</span></Button>
        </div>
        <ul className="mt-3 divide-y rounded-2xl border bg-card text-sm">
          {audit.slice(0, 30).map((a, k) => (
            <li key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
              <span className="shrink-0 text-xs text-muted-foreground sm:w-32">{date(a.at)} {time(a.at)}</span>
              <span className="min-w-0 flex-1 break-words">{a.action}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{name(a.actorId)}</span>
            </li>
          ))}
        </ul>
      </div>
      {form && <UserForm user={form.user} onClose={(created) => { setForm(null); if (created) setPendingQr(created); }} />}
      {qrUser && <QrDialog user={qrUser} onClose={() => setQr(null)} />}
    </div>
  );
}

