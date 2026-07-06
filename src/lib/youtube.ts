const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);

export function parseYouTubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!HOSTS.has(u.hostname)) return null;
  let candidate: string | null = null;
  if (u.hostname === "youtu.be") candidate = u.pathname.slice(1).split("/")[0] ?? null;
  else if (u.searchParams.get("v")) candidate = u.searchParams.get("v");
  else {
    const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
    candidate = m?.[1] ?? null;
  }
  return candidate && ID.test(candidate) ? candidate : null;
}
