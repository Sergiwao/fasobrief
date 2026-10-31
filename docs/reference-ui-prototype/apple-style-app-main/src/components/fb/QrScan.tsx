import { Scanner } from "@yudiel/react-qr-scanner";

export default function QrScan({ onCode }: { onCode: (v: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl">
      <Scanner onScan={(r) => { const v = r?.[0]?.rawValue; if (v) onCode(v); }} constraints={{ facingMode: "environment" }} />
    </div>
  );
}
