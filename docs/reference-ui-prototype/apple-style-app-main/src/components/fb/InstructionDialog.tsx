import { useState } from "react";
import { useStore, type Message } from "@/lib/store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export function InstructionDialog({ source, convId, onClose }: { source?: Message; convId?: string; onClose: () => void }) {
  const { me, users, myConversations, createInstruction } = useStore();
  const conv = myConversations().find((c) => c.id === convId);
  const eligible = users.filter((u) => !u.revoked && u.id !== me!.id && (!conv || conv.memberIds.includes(u.id)));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(source?.text ?? "");
  const [deadline, setDeadline] = useState("");
  const [rec, setRec] = useState<string[]>(eligible.map((u) => u.id));

  const ok = title.trim() && body.trim() && rec.length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle instruction</DialogTitle>
          <DialogDescription>Les destinataires devront en accuser réception.</DialogDescription>
        </DialogHeader>
        <form id="ins" className="space-y-4" onSubmit={(e) => {
          e.preventDefault(); if (!ok) return;
          createInstruction({ title: title.trim(), body: body.trim(), deadline: deadline || undefined, sourceMessageId: source?.id, convId, recipientIds: rec });
          onClose();
        }}>
          <div className="space-y-2"><Label htmlFor="t">Objet</Label><Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Rapports d'activité mensuels" required /></div>
          <div className="space-y-2"><Label htmlFor="b">Contenu</Label><Textarea id="b" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="d">Échéance (facultatif)</Label><Input id="d" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Destinataires</legend>
            {eligible.map((u) => (
              <label key={u.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <Checkbox checked={rec.includes(u.id)} onCheckedChange={(c) => setRec((r) => (c ? [...r, u.id] : r.filter((x) => x !== u.id)))} />
                <span className="flex-1">{u.name}</span><span className="text-xs text-muted-foreground">{u.title}</span>
              </label>
            ))}
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="ins" disabled={!ok}>Émettre</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
