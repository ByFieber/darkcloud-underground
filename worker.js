const headers = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://api.xposedornot.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.nemesisplatform.online") {
      url.hostname = "nemesisplatform.online";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/api/breaches") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "POST") return json({ error: "Yalnızca POST istekleri kabul edilir." }, 405);
      let email;
      try { ({ email } = await request.json()); } catch { return json({ error: "Geçersiz istek." }, 400); }
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return json({ error: "Geçerli bir e-posta adresi girin." }, 400);
      const source = await fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(normalizedEmail)}`);
      if (source.status === 429) return json({ error: "Ücretsiz sorgu limiti aşıldı." }, 429);
      if (!source.ok) return json({ error: "İhlal kaynağı şu anda yanıt vermiyor." }, 502);
      const data = await source.json();
      const breaches = [...new Set((data.breaches ?? []).flat().filter(name => typeof name === "string"))];
      return json({ breached: breaches.length > 0, breaches });
    }
    return env.ASSETS.fetch(request);
  }
};