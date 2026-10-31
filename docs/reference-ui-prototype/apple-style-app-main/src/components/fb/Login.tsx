import { lazy, Suspense, useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Smartphone, QrCode, X } from "lucide-react";
import { useStore, DEMO_OTP } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const QrScan = lazy(() => import("./QrScan"));

export function Login() {
  const { checkPassword, login, loginWithQr } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState("");
  const [scan, setScan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // QR scanned with the phone camera opens ?enroll=... → automatic sign-in.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("enroll");
    if (!p) return;
    window.history.replaceState(null, "", window.location.pathname);
    const err = loginWithQr(p);
    if (err) setError(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === 1) {
      const err = checkPassword(username, password);
      return err ? setError(err) : setStep(2);
    }
    const err = login(username, password, otp.trim());
    if (err) setError(err);
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-muted px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">FasoBrief</h1>
          <p className="mt-1 text-sm text-muted-foreground">Messagerie des agents de l'administration</p>
        </div>

        {scan ? (
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Scannez votre QR code d'enrôlement</p>
              <button onClick={() => setScan(false)} aria-label="Fermer"><X className="h-4 w-4" /></button>
            </div>
            <Suspense fallback={<div className="aspect-square rounded-xl bg-muted" />}>
              <QrScan onCode={(v) => { setScan(false); const err = loginWithQr(v); if (err) setError(err); }} />
            </Suspense>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="un">Identifiant</Label>
                  <Input id="un" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw">Mot de passe</Label>
                  <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="otp" className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> Code de vérification</Label>
                <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" className="text-center text-lg tracking-[0.4em]" autoFocus required />
                <p className="text-xs text-muted-foreground">Second facteur. Code de démonstration : <span className="font-medium text-foreground">{DEMO_OTP}</span></p>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full rounded-xl">
              <KeyRound className="h-4 w-4" /> {step === 1 ? "Continuer" : "Se connecter"}
            </Button>
            {step === 1 ? (
              <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={() => { setError(null); setScan(true); }}>
                <QrCode className="h-4 w-4" /> Scanner un QR code
              </Button>
            ) : (
              <button type="button" onClick={() => setStep(1)} className="w-full text-sm text-muted-foreground hover:text-foreground">Retour</button>
            )}
          </form>
        )}
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Comptes fictifs : <span className="font-medium">admin</span>, <span className="font-medium">issa</span>, <span className="font-medium">fatou</span>, <span className="font-medium">paul</span>, <span className="font-medium">mariam</span> — mot de passe demo2026
        </p>
      </div>
    </main>
  );
}
