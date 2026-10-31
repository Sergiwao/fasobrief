export const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
export const time = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const date = (t: number | string) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
