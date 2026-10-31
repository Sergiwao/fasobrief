import { useState } from "react";
import { useStore, groupCandidates } from "@/lib/store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function GroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { me, users, services, createGroup } = useStore();
  const cand = groupCandidates(me!, users);
  const [name, setName] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const svc = (id: string | null) => services.find((s) => s.id === id)?.name ?? "Administration";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau groupe</DialogTitle>
          <DialogDescription>{me!.role === "admin" ? "Réunissez des agents de plusieurs services ou des chefs de service." : "Groupe restreint aux agents de votre service."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="gn">Nom du groupe</Label><Input id="gn" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex. Cellule budget" /></div>
          {me!.role === "admin" && (
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setSel(cand.filter((u) => u.role === "chef").map((u) => u.id))}>Sélectionner tous les chefs de service</Button>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Membres</legend>
            {cand.map((u) => (
              <label key={u.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <Checkbox checked={sel.includes(u.id)} onCheckedChange={(c) => setSel((r) => (c ? [...r, u.id] : r.filter((x) => x !== u.id)))} />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{u.role === "chef" ? "Chef · " : ""}{svc(u.serviceId)}</span>
              </label>
            ))}
          </fieldset>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => { const e = createGroup(name, sel); if (e) setErr(e); else onCreated(); }}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
