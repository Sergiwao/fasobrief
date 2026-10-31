import { useState } from "react";
import { Plus, CalendarClock, CheckCircle2, Circle, Eye, Inbox, Lock } from "lucide-react";
import { useStore, canIssue, type AckStatus } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InstructionDialog } from "./InstructionDialog";
import { date } from "./util";

const label: Record<AckStatus, string> = { en_attente: "En attente", recu: "Reçu", lu: "Pris connaissance" };
const Icon = ({ s }: { s: AckStatus }) =>
  s === "lu" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : s === "recu" ? <Eye className="h-4 w-4 text-warning" /> : <Circle className="h-4 w-4 text-muted-foreground" />;

export function Instructions() {
  const { me, users, instructions, acknowledge, closeInstruction } = useStore();
  const [open, setOpen] = useState(false);
  const visible = instructions.filter((i) => i.authorId === me!.id || me!.id in i.recipients || me!.role === "admin");
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Instructions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Suivi des consignes et des accusés de réception</p>
          </div>
          {canIssue(me) && <Button onClick={() => setOpen(true)} className="rounded-full"><Plus className="h-4 w-4" /> Nouvelle</Button>}
        </div>

        {visible.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
            <Inbox className="mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="font-medium">Aucune instruction</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Depuis une conversation, survolez un message puis choisissez « Transformer en instruction ».</p>
          </div>
        )}

        <ul className="space-y-4">
          {visible.map((i) => {
            const entries = Object.entries(i.recipients);
            const done = entries.filter(([, s]) => s === "lu").length;
            const myStatus = i.recipients[me!.id];
            const late = i.deadline && !i.closed && new Date(i.deadline + "T23:59") < new Date();
            return (
              <li key={i.id} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{i.title}</h3>
                      {i.closed && <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Clôturée</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Émise par {name(i.authorId)} · {date(i.createdAt)}</p>
                  </div>
                  {i.deadline && (
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${late ? "text-destructive" : "text-muted-foreground"}`}>
                      <CalendarClock className="h-4 w-4" /> {late ? "Échue le " : "Avant le "}{date(i.deadline)}
                    </span>
                  )}
                </div>
                <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">{i.body}</p>

                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Prise de connaissance</span><span>{done}/{entries.length}</span></div>
                  <Progress value={entries.length ? (done / entries.length) * 100 : 0} className="h-1.5" />
                </div>

                {(i.authorId === me!.id || me!.role === "admin") && (
                  <table className="mt-5 w-full text-sm">
                    <caption className="sr-only">Statut par destinataire</caption>
                    <tbody className="divide-y">
                      {entries.map(([uid, s]) => (
                        <tr key={uid}><td className="py-2">{name(uid)}</td><td className="py-2 text-right"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Icon s={s} /> {label[s]}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  {myStatus && !i.closed && myStatus !== "lu" && (
                    <>
                      {myStatus === "en_attente" && <Button variant="outline" size="sm" className="rounded-full" onClick={() => acknowledge(i.id, "recu")}>Accuser réception</Button>}
                      <Button size="sm" className="rounded-full" onClick={() => acknowledge(i.id, "lu")}><CheckCircle2 className="h-4 w-4" /> J'ai pris connaissance</Button>
                    </>
                  )}
                  {myStatus === "lu" && <span className="flex items-center gap-1.5 text-sm text-primary"><CheckCircle2 className="h-4 w-4" /> Vous avez pris connaissance</span>}
                  {i.authorId === me!.id && !i.closed && <Button variant="ghost" size="sm" className="ml-auto rounded-full" onClick={() => closeInstruction(i.id)}>Clôturer</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {open && <InstructionDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
