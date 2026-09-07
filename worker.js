const ALLOWED_ORIGINS = ["https://nemesisplatform.online","https://www.nemesisplatform.online","https://nemesis-platform.nemesis-platform.workers.dev"];
function corsHeaders(origin){
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : "https://nemesisplatform.online";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, PATCH, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-nemesis-user, x-nemesis-role",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}
const secHeadersBase = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.skypack.dev https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com https://unpkg.com; font-src https://fonts.gstatic.com https://cdn.tailwindcss.com https://cdn.skypack.dev; img-src 'self' data: https://api.telegram.org https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://unpkg.com https://threejs.org https://cdn.jsdelivr.net https://upload.wikimedia.org data: blob:; connect-src 'self' https://cdn.skypack.dev https://cdn.jsdelivr.net https://threejs.org https://unpkg.com https://upload.wikimedia.org https://api.xposedornot.com https://api.telegram.org https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
const secHeaders = secHeadersBase;
function json(body, status=200, request){
  let origin = '';
  try{ origin = request ? (request.headers.get('origin')||'') : ''; }catch(_){}
  if(!origin) origin = 'https://nemesisplatform.online';
  const cors = corsHeaders(origin);
  return new Response(JSON.stringify(body), {status, headers:{...secHeadersBase, ...cors,"Content-Type":"application/json; charset=utf-8"}});
}
function secWithCors(request){
  const origin = request ? (request.headers.get('origin')||'') : '';
  return {...secHeadersBase, ...corsHeaders(origin)};
}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
async function proxyToBackend(request, env, url){
  const base = String(env.BACKEND_URL || '').replace(/\/+$/,'');
  if(!base) return json({success:false, error:"Backend baglantisi yapilandirilmamis."},502);
  const target = base + url.pathname + url.search;
  const headers = new Headers();
  const fwd = ["content-type","authorization","accept","accept-language","user-agent","referer","origin","x-requested-with","cf-connecting-ip","x-forwarded-for","x-real-ip","cf-ipcountry","cf-ray"];
  for(const h of fwd){
    const v = request.headers.get(h);
    if(v) headers.set(h, v);
  }
  // ensure IP forwarded even if not in original headers (use cf-connecting-ip fallback)
  if(!headers.get("cf-connecting-ip")){
    const ip = request.headers.get('cf-connecting-ip') || request.cf?.ip || '';
    if(ip) headers.set("cf-connecting-ip", ip);
  }
  if(!headers.get("x-forwarded-for")){
    const ip = request.headers.get('cf-connecting-ip') || '';
    if(ip) headers.set("x-forwarded-for", ip);
  }
  const init = { method: request.method, headers, redirect: "manual" };
  if(request.method!=="GET" && request.method!=="HEAD"){
    init.body = request.body;
  }
  const resp = await fetch(target, init);
  const outHeaders = new Headers();
  const pass = ["content-type","content-disposition"];
  for(const h of pass){
    const v = resp.headers.get(h);
    if(v) outHeaders.set(h, v);
  }
  const ct = outHeaders.get('content-type') || 'application/json';
  if(ct.includes('json') && !/charset=/i.test(ct)) outHeaders.set('content-type', ct + '; charset=utf-8');
  for(const [k,v] of Object.entries(secHeaders)) outHeaders.set(k, v);
  return new Response(resp.body, {status: resp.status, headers: outHeaders});
}
async function sendLog(env, title, fields, request){
  try{
    const ip=request.headers.get('cf-connecting-ip')|| request.headers.get('x-forwarded-for')|| '-';
    const ua=request.headers.get('user-agent')|| '-';
    const cf=request.cf||{};
    const city=cf.city||'-', country=cf.country||'-', region=cf.region||'-', tz=cf.timezone||'-';
    const lat=cf.latitude, lon=cf.longitude;
    let text=`📋 <b>${escHtml(title)}</b>\n`;
    text+=`🕒 ${new Date().toLocaleString('tr-TR')}\n`;
    text+=`🌐 <b>IP:</b> ${escHtml(ip)} (${escHtml(city)}/${escHtml(region)}/${escHtml(country)})\n`;
    if(lat && lon) text+=`📍 <b>Koordinat:</b> ${lat}, ${lon}\n`;
    if(tz && tz!=='-') text+=`🕰️ <b>Zaman Dilimi:</b> ${escHtml(tz)}\n`;
    text+=`💻 <b>UA:</b> ${escHtml(ua.slice(0,120))}\n`;
    for(const [k,v] of Object.entries(fields)){
      text+=`${escHtml(k)}: ${escHtml(String(v).slice(0,300))}\n`;
    }
    if(lat && lon){
      const maps=`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      const osm=`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
      text+=`\n🛰️ <b>Uydu:</b> <a href="${maps}">Google Harita</a> | <a href="${osm}">OSM</a>`;
    }
    const logId=env.LOG_CHANNEL_ID || "-1004428932884";
    const botToken=env.BOT_TOKEN;
    const sent=await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({chat_id: logId, text, parse_mode:"HTML", disable_web_page_preview: true})});
    // Telegram harita: direkt konum gönder (uydu görünümü Telegram içinde açılır)
    if(lat && lon){
      try{
        await fetch(`https://api.telegram.org/bot${botToken}/sendLocation`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({chat_id: logId, latitude: parseFloat(lat), longitude: parseFloat(lon), horizontal_accuracy: cf.metroCode? undefined : undefined})});
      }catch{}
    }
  }catch(e){}
}

async function handleChat(request, env, url){
  try{
    const auth = request.headers.get('authorization') || '';
    let username = request.headers.get('x-nemesis-user') || 'misafir';
    let role = request.headers.get('x-nemesis-role') || 'user';
    if(/^Bearer\s+.+/.test(auth)){
      try{
        const parts = auth.split('.');
        let b64 = parts[0].replace(/-/g,'+').replace(/_/g,'/');
        while(b64.length%4) b64+='=';
        const p=JSON.parse(atob(b64));
        if(typeof p==='object'&&p){
          if(p.u) username=String(p.u);
          if(p.r) role=String(p.r);
        }
      }catch(_){}
    }
    const room = (url.searchParams.get('room') || 'genel').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40) || 'genel';
    const key = `chat:${room}`;

    if(url.pathname==="/api/chat/messages" && request.method==="GET"){
      const raw = await env.PENDING.get(key);
      let msgs = [];
      if(raw){ try{ msgs=JSON.parse(raw); }catch(_){ msgs=[]; } }
      return json({ok:true, room, messages: Array.isArray(msgs)?msgs:[]},200,request);
    }

    if(url.pathname==="/api/chat/send" && request.method==="POST"){
      let data; try{ data=await request.json(); }catch{ data={}; }
      // admin-only room clear
      if(data.clear===1 && (role==='root'||role==='admin')){
        await env.PENDING.delete(key);
        return json({ok:true, messages:[]},200,request);
      }
      let msg = String(data.msg||data.message||'').slice(0,2000).trim();
      if(!msg) return json({ok:false, error:"Mesaj boş"},400,request);
      // sanitize: strip control chars, zero-width, bidi overrides, limit length
      msg = msg.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u202A-\u202E]/g,'').slice(0,2000).trim();
      if(!msg) return json({ok:false, error:"Mesaj boş"},400,request);
      if(msg.length < 1 || msg.length > 2000) return json({ok:false, error:"Mesaj uzunluğu hatalı"},400,request);
      // rate limit: 1 msg / 1.2s per user
      const rlKey = `chat_rl:${username}:${room}`;
      const last = await env.PENDING.get(rlKey);
      if(last && Date.now() - Number(last) < 1200) return json({ok:false, error:"Çok hızlısın, biraz bekle"},429,request);
      await env.PENDING.put(rlKey, String(Date.now()), {expirationTtl: 10});
      const raw = await env.PENDING.get(key);
      let msgs=[];
      if(raw){ try{ msgs=JSON.parse(raw); }catch(_){ msgs=[]; } }
      if(!Array.isArray(msgs)) msgs=[];
      if(msgs.length>500) msgs=msgs.slice(msgs.length-450);
      msgs.push({ u: username.slice(0,32), m: msg, t: Date.now() });
      await env.PENDING.put(key, JSON.stringify(msgs), {expirationTtl: 60*60*24*30});
      return json({ok:true, messages: msgs},200,request);
    }
    return json({ok:false, error:"Bilinmeyen chat isteği"},404);
  }catch(e){
    return json({ok:false, error:"Sohbet hatası"},500);
  }
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    if(url.hostname==="www.nemesisplatform.online"){ url.hostname="nemesisplatform.online"; return Response.redirect(url.toString(),301); }
    // ban kontrol (unban/ban hariç)
    if(url.pathname!=="/api/unban"){
      try{
        const ipCheck=request.headers.get('cf-connecting-ip');
        if(ipCheck){
          const banRaw=await env.PENDING.get(`ban:${ipCheck}`);
          if(banRaw){
            const b=JSON.parse(banRaw);
            if(b.count>=3){
              return new Response(`<!doctype html><meta charset="utf-8"><title>Banlandı</title><body style="background:#070707;color:#fff;display:grid;place-items:center;min-height:100vh;font-family:JetBrains Mono,monospace;text-align:center"><div><div style="font-size:64px;color:#dc2626">⛔</div><h1>ERİŞİM ENGELLENDİ</h1><p>IP ve MAC adresiniz banlandı.<br>3 kez kural ihlali.</p><p style="margin-top:12px"><a href="/?unban=1" style="color:#3b82f6">Banı Kaldır (test)</a></p></div></body>`, {status:403, headers:{...secWithCors(request), "Content-Type":"text/html; charset=utf-8"}});
            }
          }
        }
      }catch{}
    }
    if(request.method==="OPTIONS") return new Response(null,{status:204, headers:secWithCors(request)});

    if(url.pathname==="/api/register" && request.method==="POST"){
      let data; try{ data=await request.json(); }catch{ return json({error:"Geçersiz istek"},400); }
      const u=String(data.u || data.username || "").trim().toLowerCase();
      const e=String(data.e || data.email || "").trim().toLowerCase();
      const phone=String(data.phone||"").trim();
      const telegram=String(data.telegram||"").trim();
      const pass=String(data.password||"");
      if(!/^[a-z0-9_]{3,16}$/.test(u)) return json({error:"Kullanıcı adı 3-16 karakter a-z 0-9 _"},400);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length>254) return json({error:"Geçerli e-posta girin"},400);
      if(!/^@?[a-zA-Z0-9_]{5,32}$/.test(telegram)) return json({error:"Telegram kullanıcı adı @ ile 5-32 karakter olmalı"},400);
      const tgNorm=telegram.startsWith('@')?telegram:'@'+telegram;
      if(!/^\+?[\d\s]+$/.test(phone) || phone.replace(/\D/g,'').length<10) return json({error:"Geçerli telefon girin"},400);
      if(pass.length<8 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/[0-9]/.test(pass)) return json({error:"Şifre zayıf: min 8, büyük/küçük + rakam"},400);
      const existing=await env.PENDING.get(`user:${u}`);
      if(existing) return json({error:"Bu kullanıcı adı zaten başvuruda"},400);
      const existingMail=await env.PENDING.get(`email:${e}`);
      if(existingMail) return json({error:"Bu e-posta zaten başvuruda"},400);
      const code=Math.floor(100000+Math.random()*900000).toString();
      const ip=request.headers.get('cf-connecting-ip')||'';
      const hashBuf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
      const h=[...new Uint8Array(hashBuf)].map(b=>b.toString(16).padStart(2,'0')).join('');
      const payload={u,e,phone,telegram:tgNorm, at:Date.now(), code, teminat:true, ip, h};
      await env.PENDING.put(`pending:${u}`, JSON.stringify(payload), {expirationTtl: 86400});
      await env.PENDING.put(`user:${u}`, "1", {expirationTtl: 86400});
      await env.PENDING.put(`email:${e}`, "1", {expirationTtl: 86400});
      // log to channel
      await sendLog(env, "YENİ KAYIT BAŞVURUSU", {"Kullanıcı":u, "E-posta":e, "Telefon":phone, "Telegram":tgNorm, "Şifre (hash)":h.slice(0,16)+"…", "IP":ip}, request);
      const groupId=env.GROUP_ID || "-1004365163753";
      const botToken=env.BOT_TOKEN;
      const text=`🔐 <b>Yeni Üyelik Başvurusu</b>\n\n👤 <b>Kullanıcı:</b> ${escHtml(u)}\n📧 <b>E-posta:</b> ${escHtml(e)}\n📱 <b>Telefon:</b> ${escHtml(phone)}\n✈️ <b>Telegram:</b> ${escHtml(tgNorm)}\n🕒 ${new Date().toLocaleString('tr-TR')}\n🌐 <b>IP:</b> ${escHtml(ip)}\n\n💰 <b>Teminat:</b> Beklemede — üye ile iletişime geçin.\n✅ Onay için butona basın.`;
      const tgBody={chat_id: groupId, text, parse_mode:"HTML", reply_markup:{inline_keyboard:[[{text:"✅ Onayla & Kodu Gönder", callback_data:`approve:${u}:${code}`}],[{text:"❌ Reddet", callback_data:`reject:${u}`}, {text:"💬 İletişime Geç", url:`https://t.me/${tgNorm.replace('@','')}`}]]}};
      let tgOk=false, tgErr=null;
      try{ const tgRes=await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(tgBody)}); const tgData=await tgRes.json(); tgOk=tgData.ok; if(!tgOk) tgErr=tgData.description; }catch(ex){ tgErr=String(ex); }
      if(!tgOk) return json({ok:true, warning:"Başvuru alındı ancak Telegram grubuna düşmedi.", code, telegram:tgNorm, tgError:tgErr});
      return json({ok:true, message:"Başvuru Telegram grubuna iletildi. Yönetici teminatı teyit edip onaylayacak.", telegram:tgNorm, code});
    }

    // /api/login dahil tüm diğer /api/* istekleri arka uca (Flask) proxy'lenir.

    if(url.pathname==="/api/profile/update" && request.method==="POST"){
      let data; try{ data=await request.json(); }catch{ return json({error:"Geçersiz istek"},400); }
      const u=String(data.u||'').trim();
      const fields={};
      if(data.e) fields["Yeni E-posta"]=data.e;
      if(data.phone) fields["Yeni Telefon"]=data.phone;
      if(data.telegram) fields["Yeni Telegram"]=data.telegram;
      fields["Kullanıcı"]=u;
      await sendLog(env, "PROFİL GÜNCELLEMESİ", fields, request);
      return json({ok:true});
    }

    if(url.pathname==="/api/password/change" && request.method==="POST"){
      let data; try{ data=await request.json(); }catch{ return json({error:"Geçersiz istek"},400); }
      await sendLog(env, "ŞİFRE DEĞİŞİMİ", {"Kullanıcı":data.u || data.username ||'-', "IP":request.headers.get('cf-connecting-ip')||''}, request);
      return json({ok:true});
    }

    if(url.pathname==="/api/ban" && request.method==="POST"){
      let data; try{ data=await request.json(); }catch{ data={}; }
      const ip=request.headers.get('cf-connecting-ip')|| request.headers.get('x-forwarded-for')||'-';
      const ua=request.headers.get('user-agent')||'-';
      const cf=request.cf||{};
      await env.PENDING.put(`ban:${ip}`, JSON.stringify({ip, ua, reason:data.reason||'F12', count:data.count||1, at:Date.now(), city:cf.city||''}), {expirationTtl: 86400*30});
      await sendLog(env, data.count>=3 ? "⛔ IP/MAC BANLANDI" : "⚠️ BAN UYARISI", {"IP":ip, "MAC":"(fingerprint)", "Sebep":data.reason||'F12', "Deneme":String(data.count||1), "Şehir":cf.city||'-'}, request);
      return json({ok:true, banned: data.count>=3});
    }

    if(url.pathname==="/api/unban" && request.method==="POST"){
      const ip=request.headers.get('cf-connecting-ip')||'';
      if(ip) await env.PENDING.delete(`ban:${ip}`);
      const fwd=request.headers.get('x-forwarded-for');
      if(fwd) await env.PENDING.delete(`ban:${fwd.split(',')[0].trim()}`);
      return json({ok:true, unbanned:true});
    }

    if(url.pathname==="/api/verify" && request.method==="POST"){
      let data; try{ data=await request.json(); }catch{ return json({error:"Geçersiz istek"},400); }
      const u=String(data.u || data.username || "").trim().toLowerCase();
      const code=String(data.code||"").trim();
      const raw=await env.PENDING.get(`pending:${u}`);
      if(!raw) return json({error:"Başvuru bulunamadı veya süresi doldu"},404);
      const payload=JSON.parse(raw);
      if(payload.code!==code) return json({error:"Kod hatalı"},400);
      await sendLog(env, "DOĞRULAMA BAŞARILI", {"Kullanıcı":u, "Kod":code}, request);
      return json({ok:true});
    }

    if(url.pathname==="/api/breaches"){
      if(request.method!=="POST") return json({error:"Yalnızca POST"},405);
      let email; try{({email}=await request.json())}catch{return json({error:"Geçersiz istek"},400)}
      const normalized=String(email??"").trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254) return json({error:"Geçerli e-posta girin"},400);
      const source=await fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(normalized)}`);
      if(source.status===429) return json({error:"Limit aşıldı"},429);
      if(!source.ok) return json({error:"Kaynak yanıt vermiyor"},502);
      const data=await source.json();
      const breaches=[...new Set((data.breaches??[]).flat().filter(n=>typeof n==="string"))];
      return json({breached:breaches.length>0, breaches});
    }

    if(url.pathname.startsWith("/api/chat")){
      return await handleChat(request, env, url);
    }

    if(url.pathname==="/api/geocode" && request.method==="GET"){
      const q = (url.searchParams.get('q')||'').trim().slice(0,300);
      if(!q) return json({error:"q gerekli"},400,request);
      const cacheKey='geo:'+q.toLowerCase();
      try{
        const cached=await env.PENDING.get(cacheKey);
        if(cached){ const p=JSON.parse(cached); if(Date.now()-p.ts<86400000 && Array.isArray(p.data) && p.data.length) return json(p.data,200,request); }
      }catch(_){}
      try{
        const nomUrl='https://nominatim.openstreetmap.org/search?'+ new URLSearchParams({q, format:'jsonv2', addressdetails:'1', limit:'1', countrycodes:'tr'}).toString();
        const resp=await fetch(nomUrl, {headers:{'User-Agent':'X-Team-Address-Geocoder/3.2 (+https://nemesisplatform.online)', 'Accept':'application/json', 'Accept-Language':'tr-TR,tr;q=0.9'}});
        if(!resp.ok) return json([],200,request);
        const arr=await resp.json();
        if(Array.isArray(arr) && arr.length){
          try{ await env.PENDING.put(cacheKey, JSON.stringify({ts:Date.now(), data:arr}), {expirationTtl:86400}); }catch(_){}
        }
        return json(Array.isArray(arr)?arr:[],200,request);
      }catch(_){ return json([],200,request); }
    }

    if(url.pathname==="/api/ip_premium" && request.method==="GET"){
      const ip=(url.searchParams.get('ip')||'').trim();
      if(!ip) return json({error:"ip gerekli"},400,request);
      const cacheKey='ipremium:'+ip;
      try{
        const cached=await env.PENDING.get(cacheKey);
        if(cached){ const p=JSON.parse(cached); if(Date.now()-p.ts<3600 && p.data) return json(p.data,200,request); }
      }catch(_){}
      const sources={};
      const fetches=[];
      fetches.push(fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,zip,lat,lon,isp,org,as,proxy,hosting,query`).then(r=>r.json()).then(j=>{sources.ipapi=j;}).catch(()=>{}));
      fetches.push(fetch(`https://ipwho.is/${encodeURIComponent(ip)}`).then(r=>r.json()).then(j=>{sources.ipwho=j;}).catch(()=>{}));
      fetches.push(fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`).then(r=>r.json()).then(j=>{sources.ipapi_co=j;}).catch(()=>{}));
      await Promise.allSettled(fetches);
      const merged={
        ip,
        geo: sources.ipapi && sources.ipapi.status==='success' ? {country: sources.ipapi.country, region: sources.ipapi.regionName, city: sources.ipapi.city, zip: sources.ipapi.zip, lat: sources.ipapi.lat, lon: sources.ipapi.lon, isp: sources.ipapi.isp, org: sources.ipapi.org, as: sources.ipapi.as, proxy: sources.ipapi.proxy, hosting: sources.ipapi.hosting} : {},
        ipwho: sources.ipwho && sources.ipwho.success!==false ? {country: sources.ipwho.country, region: sources.ipwho.region, city: sources.ipwho.city, lat: sources.ipwho.latitude, lon: sources.ipwho.longitude, isp: sources.ipwho.connection && sources.ipwho.connection.isp, asn: sources.ipwho.connection && sources.ipwho.connection.asn, org: sources.ipwho.connection && sources.ipwho.connection.org} : {},
        ipapi_co: sources.ipapi_co && !sources.ipapi_co.error ? {country: sources.ipapi_co.country_name, region: sources.ipapi_co.region, city: sources.ipapi_co.city, lat: sources.ipapi_co.latitude, lon: sources.ipapi_co.longitude, asn: sources.ipapi_co.asn, org: sources.ipapi_co.org} : {},
        sources: Object.keys(sources).filter(k=>sources[k] && Object.keys(sources[k]).length),
        fetched_at: new Date().toISOString()
      };
      try{ await env.PENDING.put(cacheKey, JSON.stringify({ts:Date.now(), data:merged}), {expirationTtl:3600}); }catch(_){}
      return json(merged,200,request);
    }

    if(url.pathname==="/api/pwned_range" && request.method==="GET"){
      const prefix=(url.searchParams.get('prefix')||'').trim().toUpperCase();
      if(!/^[0-9A-F]{5}$/.test(prefix)) return json({error:"prefix 5 hex gerekli"},400,request);
      const cacheKey='pwned:'+prefix;
      try{ const cached=await env.PENDING.get(cacheKey); if(cached) return new Response(cached, {status:200, headers:{...secWithCors(request), 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'public, max-age=86400'}}); }catch(_){}
      try{
        const resp=await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {headers:{'User-Agent':'Nemesis-Pwned-Check','Add-Padding':'true'}});
        const txt=await resp.text();
        if(resp.ok){
          try{ await env.PENDING.put(cacheKey, txt, {expirationTtl:86400}); }catch(_){}
          return new Response(txt, {status:200, headers:{...secWithCors(request), 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'public, max-age=86400'}});
        }
        return json({error:"pwned fetch failed"},502,request);
      }catch(_){ return json({error:"pwned error"},502,request); }
    }

    // Yerel handler'lar tarafından ele alınmayan tüm /api/* istekleri arka uca yönlendirilir (sorgula, sorgu_jobs, query_history, auth/me, admin, login vb.)
    if(url.pathname.startsWith("/api/")){
      return await proxyToBackend(request, env, url);
    }

    const res=await env.ASSETS.fetch(request);
    const headers=new Headers(res.headers);
    for(const [k,v] of Object.entries(secWithCors(request))) headers.set(k,v);
    const ct = headers.get('Content-Type') || 'text/html';
    if(!/charset=/i.test(ct)) headers.set('Content-Type', ct + '; charset=utf-8');
    // No-cache for HTML to ensure premium updates are immediately visible
    if(ct.includes('text/html')){
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
        headers.set('X-NEMESIS-VERSION', 'v2.3-premium-all');
    }
    return new Response(res.body, {status:res.status, headers});
  }
};
