// HMAC verification and owner-only commands. Publication requires a version-bound postback.
export async function verifyLine(body, signature, secret) {
  if (!secret || !signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), c=>c.charCodeAt(0)), new TextEncoder().encode(body));
  } catch { return false; }
}
export function ownerCommand(event, owner) {
  if (!/^U[0-9a-f]{32}$/i.test(owner || '') || event.source?.type !== 'user' || event.source.userId !== owner || event.type !== 'message' || event.message?.type !== 'text') return null;
  const text=event.message.text.trim().toLowerCase();
  if(text==='連線測試') return 'test';
  if(text==='ok'||text==='可以') return 'not_ready';
  return null;
}

export function reviewDecision(event,owner){if(!/^U[0-9a-f]{32}$/i.test(owner||'')||event.source?.type!=='user'||event.source.userId!==owner||event.type!=='postback')return null;const match=/^social:(approve|skip):([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/.exec(event.postback?.data||'');return match?{decision:match[1],token:match[2]}:null;}
