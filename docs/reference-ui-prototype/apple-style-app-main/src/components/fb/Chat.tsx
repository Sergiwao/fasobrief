import { useEffect, useRef, useState } from "react";
import { Send, Lock, ClipboardPlus, Users, Paperclip, FileText, Download, ChevronLeft, Plus, Check, CheckCheck, X, Building2 } from "lucide-react";
import { useStore, canIssue, MAX_FILE, type Message, type Attachment } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InstructionDialog } from "./InstructionDialog";
import { GroupDialog } from "./GroupDialog";
import { initials, time } from "./util";

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`);

export function Chat({ openConv, onOpened }: { openConv: string | null; onOpened: () => void }) {
  const { me, messages, users, send, markRead, myConversations } = useStore();
  const mine = myConversations();
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<Attachment | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [source, setSource] = useState<Message | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const conv = mine.find((c) => c.id === active) ?? null;
  const list = messages.filter((m) => m.convId === conv?.id);
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "Agent retiré";
  const unreadIn = (cid: string) => messages.filter((m) => m.convId === cid && m.authorId !== me!.id && !m.readBy[me!.id]).length;

  useEffect(() => { if (openConv) { setActive(openConv); onOpened(); } }, [openConv, onOpened]);
  // Desktop: open first conversation by default.
  useEffect(() => { if (!active && mine[0] && window.matchMedia("(min-width: 1024px)").matches) setActive(mine[0].id); }, [active, mine]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [list.length, conv?.id]);
  useEffect(() => { if (conv) markRead(conv.id); }, [conv?.id, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f: File | undefined) => {
    setFileErr(null);
    if (!f) return;
    if (f.size > MAX_FILE) { setFileErr(`Fichier trop lourd (max ${size(MAX_FILE)}).`); return; }
    const r = new FileReader();
    r.onload = () => setFile({ name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl: String(r.result) });
    r.readAsDataURL(f);
  };

  const listPane = (
    <section className={`${conv ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r lg:w-80`} aria-label="Conversations">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h2 className="text-2xl font-semibold tracking-tight">Messages</h2>
        {(me!.role === "chef" || me!.role === "admin") && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setNewGroup(true)}><Plus className="h-4 w-4" /> Groupe</Button>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {mine.length === 0 && <li className="px-3 py-6 text-sm text-muted-foreground">Aucune conversation.</li>}
        {mine.map((c) => {
          const last = messages.filter((m) => m.convId === c.id).at(-1);
          const n = unreadIn(c.id);
          return (
            <li key={c.id}>
              <button onClick={() => setActive(c.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${c.id === conv?.id ? "bg-primary-soft" : "hover:bg-secondary"}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  {c.kind === "service" ? <Building2 className="h-5 w-5" strokeWidth={1.75} /> : <Users className="h-5 w-5" strokeWidth={1.75} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${n ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    {last && <span className="shrink-0 text-xs text-muted-foreground">{time(last.at)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{last ? (last.text || `Fichier : ${last.attachment?.name}`) : "Aucun message"}</p>
                    {n > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{n}</span>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="flex h-full min-h-0">
      {listPane}
      {conv ? (
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="glass flex items-center gap-2 border-b px-3 py-3 sm:px-6">
            <button className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary lg:hidden" onClick={() => setActive(null)} aria-label="Retour aux conversations"><ChevronLeft className="h-6 w-6" /></button>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold">{conv.name}</h3>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Users className="h-3 w-3 shrink-0" /> {conv.memberIds.length} membres · {conv.kind === "service" ? "Service" : "Groupe"}</p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-accent-foreground sm:flex"><Lock className="h-3 w-3" /> Accès restreint</span>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-6">
            {list.map((m) => {
              const own = m.authorId === me!.id;
              const readers = Object.keys(m.readBy).filter((id) => conv.memberIds.includes(id));
              const others = conv.memberIds.filter((id) => id !== m.authorId).length;
              return (
                <div key={m.id} className={`group flex gap-2 ${own ? "flex-row-reverse" : ""}`}>
                  {!own && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials(name(m.authorId))}</div>}
                  <div className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%] ${own ? "items-end" : "items-start"}`}>
                    {!own && <span className="mb-1 text-xs text-muted-foreground">{name(m.authorId)}</span>}
                    <div className={`break-words rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${own ? "bg-primary text-primary-foreground" : "bg-bubble-in"}`}>
                      {m.attachment && (
                        m.attachment.type.startsWith("image/") ? (
                          <a href={m.attachment.dataUrl} download={m.attachment.name}><img src={m.attachment.dataUrl} alt={m.attachment.name} className="mb-1 max-h-60 rounded-lg" /></a>
                        ) : (
                          <a href={m.attachment.dataUrl} download={m.attachment.name} className="mb-1 flex items-center gap-2 rounded-lg bg-background/20 py-1">
                            <FileText className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate text-sm underline">{m.attachment.name}</span>
                            <span className="shrink-0 text-xs opacity-80">{size(m.attachment.size)}</span><Download className="h-4 w-4 shrink-0" />
                          </a>
                        )
                      )}
                      {m.text}
                    </div>
                    <div className={`mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground ${own ? "flex-row-reverse" : ""}`}>
                      {time(m.at)}
                      {own && (readers.length > 0 ? (
                        <span className="flex items-center gap-1 text-primary" title={readers.map(name).join(", ")}><CheckCheck className="h-3.5 w-3.5" /> Lu{others > 1 ? ` par ${readers.length}/${others}` : ""}</span>
                      ) : <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Envoyé</span>)}
                      {canIssue(me) && (
                        <button onClick={() => setSource(m)} className="flex items-center gap-1 hover:text-primary lg:opacity-0 lg:focus:opacity-100 lg:group-hover:opacity-100">
                          <ClipboardPlus className="h-3.5 w-3.5" /> Instruction
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="border-t px-3 py-3 sm:px-6">
            {(file || fileErr) && (
              <div className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${fileErr ? "text-destructive" : "bg-muted"}`}>
                {file && <><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{size(file.size)}</span></>}
                {fileErr && <span className="flex-1">{fileErr}</span>}
                <button onClick={() => { setFile(null); setFileErr(null); }} aria-label="Retirer le fichier"><X className="h-4 w-4" /></button>
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim() || file) { send(conv.id, text.trim(), file ?? undefined); setText(""); setFile(null); } }} className="flex items-center gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label="Joindre un fichier" onClick={() => fileRef.current?.click()}><Paperclip className="h-5 w-5" /></Button>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire un message" aria-label="Message" className="h-11 min-w-0 rounded-full bg-muted px-5" />
              <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label="Envoyer" disabled={!text.trim() && !file}><Send className="h-4 w-4" /></Button>
            </form>
          </div>
        </section>
      ) : (
        <div className="hidden flex-1 items-center justify-center text-sm text-muted-foreground lg:flex">Sélectionnez une conversation</div>
      )}
      {source && conv && <InstructionDialog source={source} convId={conv.id} onClose={() => setSource(null)} />}
      {newGroup && <GroupDialog onClose={() => setNewGroup(false)} onCreated={() => setNewGroup(false)} />}
    </div>
  );
}
