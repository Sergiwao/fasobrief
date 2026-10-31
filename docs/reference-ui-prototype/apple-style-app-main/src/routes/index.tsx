import { createFileRoute } from "@tanstack/react-router";
import { StoreProvider, useStore } from "@/lib/store";
import { Login } from "@/components/fb/Login";
import { Shell } from "@/components/fb/Shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FasoBrief — Messagerie administrative sécurisée" },
      { name: "description", content: "Messagerie des agents publics avec instructions structurées et suivi des accusés de réception." },
      { property: "og:title", content: "FasoBrief — Messagerie administrative sécurisée" },
      { property: "og:description", content: "Transformez les messages en instructions et suivez leur prise de connaissance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  );
}

function Gate() {
  const { ready, me } = useStore();
  if (!ready) return <div className="min-h-screen bg-background" />;
  return me ? <Shell /> : <Login />;
}
