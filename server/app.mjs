import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { openStore } from './store.mjs';
import { planQuestion, planningInfo } from './planner.mjs';
import { buildBriefing, evidenceSuggestions } from './briefing.mjs';
import { hashPassword, verifyPassword, newToken, tokenHash, publicUser, sessionCookie, readSessionToken, createRateLimiter, equalSecret, SESSION_LIFETIME, INVITE_LIFETIME } from './auth.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD_TYPES = ['questions', 'requests', 'responses', 'decisions'];
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

function text(value, field, { required = true, max = 500 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, `${field} is required.`);
    return '';
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, `${field} must be text${required ? ' and cannot be empty' : ''} (maximum ${max} characters).`);
  return value.trim();
}
function identifier(value, field, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const id = text(value, field, { max: 36 });
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) fail(400, `${field} is invalid.`);
  return id;
}
function date(value, field, { dateOnly = false, optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const input = text(value, field, { max: 35 });
  if (dateOnly ? !/^\d{4}-\d{2}-\d{2}$/.test(input) : !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(input)) fail(400, `${field} must be an ISO ${dateOnly ? 'date' : 'date or timestamp'}.`);
  const timestamp = Date.parse(input);
  const calendarDate = Date.parse(`${input.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || !Number.isFinite(calendarDate) || new Date(calendarDate).toISOString().slice(0, 10) !== input.slice(0, 10) || /T(?:2[4-9]|[3-9]\d):/.test(input)) fail(400, `${field} is not a valid date.`);
  return dateOnly ? input : new Date(timestamp).toISOString();
}
function number(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) fail(400, `${field} must be a finite number within ±1 quadrillion.`);
  return value;
}
function email(value) {
  const normalized = text(value, 'Email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) fail(400, 'Enter a valid email address.');
  return normalized;
}
function password(value) {
  // Do not trim passwords: spaces are part of the user's chosen secret.
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) fail(400, 'Password must be between 12 and 256 characters.');
  return value;
}
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'A JSON object is required.');
  const unknown = Object.keys(body).find(key => !allowed.includes(key));
  if (unknown) fail(400, `Unsupported field: ${unknown.slice(0, 60)}.`);
}
async function bodyOf(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) fail(415, 'Use application/json.');
  const chunks = []; let bytes = 0;
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 64 * 1024) fail(413, 'Request is too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Request body must be valid JSON.'); }
}

export function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const secureCookies = options.secureCookies ?? production;
  const originValue = options.appOrigin ?? process.env.APP_ORIGIN;
  let appOrigin = null;
  if (originValue) {
    const parsed = new URL(originValue);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('APP_ORIGIN must be a bare HTTP(S) origin, such as https://your-service.up.railway.app.');
    appOrigin = parsed.origin;
    if (production && parsed.protocol !== 'https:') throw new Error('Production APP_ORIGIN must use HTTPS.');
  }
  if (production && !appOrigin) throw new Error('Set APP_ORIGIN to the public HTTPS origin before starting in production.');
  const now = options.now ?? Date.now;
  const plan = options.planQuestion ?? planQuestion;
  const trustProxyHops = Number(options.trustProxyHops ?? process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5. Only trust verified proxy infrastructure.');
  const store = openStore(options.databasePath ?? process.env.DATABASE_PATH ?? resolve(ROOT, 'local-data/quickview.sqlite'));
  const limiter = createRateLimiter({ limit: options.authRateLimit ?? 120 });
  const identityLimiter = createRateLimiter({ limit: options.identityRateLimit ?? 10 });
  const companyLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: options.companyWriteLimit ?? 200 });
  const planningActive = new Set();
  let dummyPasswordHash;
  function json(response, status, payload, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(payload)); }
  function guardOrigin(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site requests are not allowed.');
    const origin = request.headers.origin;
    if (origin) {
      const expected = appOrigin || `${secureCookies ? 'https' : 'http'}://${request.headers.host}`;
      if (origin !== expected) fail(403, 'Request origin does not match this application.');
    }
  }
  function rateLimit(request, identity = null) {
    // Forwarding headers are ignored unless an operator explicitly trusts a bounded proxy chain.
    let address = request.socket.remoteAddress || 'unknown';
    if (trustProxyHops > 0) {
      const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map(value => value.trim());
      if (forwarded.length >= trustProxyHops) {
        const candidate = forwarded[forwarded.length - trustProxyHops];
        if (isIP(candidate)) address = candidate;
      }
    }
    if (!limiter.allow(address, now()) || identity && !identityLimiter.allow(identity.toLowerCase(), now())) fail(429, 'Too many authentication attempts. Please try again in 15 minutes.');
  }
  function requireRecord(user, type, id) { const record = store.get(user.companyId, type, id); if (!record) fail(404, `${type.slice(0, -1)} not found.`); return record; }
  function currentSession(request) {
    const token = readSessionToken(request);
    if (!token) return null;
    const session = store.session(tokenHash(token), now());
    if (!session) return null;
    const user = store.user(session.userId);
    return user ? { ...session, token, user } : null;
  }
  function startSession(request, response, user, status = 200) {
    const previousToken = readSessionToken(request);
    if (previousToken) store.deleteSession(tokenHash(previousToken));
    store.pruneSessions(now());
    const token = newToken(), csrfToken = newToken();
    store.saveSession({ tokenHash: tokenHash(token), userId: user.id, csrfToken, expiresAt: now() + SESSION_LIFETIME });
    json(response, status, { user: publicUser(user), company: store.company(user.companyId), csrfToken }, { 'Set-Cookie': sessionCookie(token, secureCookies) });
  }
  function stateFor(user) {
    return Object.fromEntries(RECORD_TYPES.map(type => [type, store.all(user.companyId, type)
      ]));
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader('Cache-Control', 'no-store');
    if (production) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method;
      if (method === 'GET' && path === '/api/health') return json(response, 200, { status: 'ok', service: 'workwork-quickview', version: '0.1.0' });
      if (!path.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') fail(405, 'Method not allowed.');
        const asset = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] }[path];
        if (!asset) fail(404, 'Not found.');
        let content; try { content = await readFile(resolve(ROOT, 'public', asset[0])); } catch { fail(404, 'Application asset not found.'); }
        response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); return response.end(method === 'HEAD' ? undefined : content);
      }
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      if (unsafe) guardOrigin(request);
      const session = currentSession(request);
      if (method === 'GET' && path === '/api/session') return json(response, 200, session ? { user: publicUser(session.user), company: store.company(session.user.companyId), csrfToken: session.csrfToken } : { user: null });

      if (method === 'POST' && ['/api/signup', '/api/login', '/api/join'].includes(path)) {
        // Limit before parsing or hashing to bound expensive requests.
        rateLimit(request);
        const body = await bodyOf(request);
        if (path === '/api/signup') {
          fields(body, ['companyName', 'name', 'email', 'password']);
          const companyName = text(body.companyName, 'Company name', { max: 120 });
          const name = text(body.name, 'Name', { max: 120 }), address = email(body.email), secret = password(body.password);
          if (!identityLimiter.allow(address, now())) fail(429, 'Too many authentication attempts. Please try again in 15 minutes.');
          if (store.userByEmail(address)) fail(409, 'This email is already registered. Sign in instead.');
          const passwordHash = await hashPassword(secret);
          const user = store.transaction(() => {
            if (store.userByEmail(address)) fail(409, 'This email is already registered. Sign in instead.');
            const company = store.createCompany({ name: companyName, createdAt: new Date(now()).toISOString() });
            return store.createUser({ companyId: company.id, name, email: address, passwordHash, role: 'manager', createdAt: new Date(now()).toISOString() });
          });
          return startSession(request, response, user, 201);
        }
        if (path === '/api/login') {
          fields(body, ['email', 'password']);
          const address = email(body.email), secret = text(body.password, 'Password', { max: 256 });
          if (!identityLimiter.allow(address, now())) fail(429, 'Too many authentication attempts. Please try again in 15 minutes.');
          const user = store.userByEmail(address);
          dummyPasswordHash ??= hashPassword(newToken());
          const valid = await verifyPassword(typeof body.password === 'string' ? body.password : secret, user?.passwordHash || await dummyPasswordHash);
          if (!user || !valid) fail(401, 'Email or password is incorrect.');
          identityLimiter.clear(address);
          return startSession(request, response, user);
        }
        fields(body, ['token', 'name', 'password']);
        const token = text(body.token, 'Invitation token', { max: 100 });
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(400, 'Invitation is invalid or expired.');
        const name = text(body.name, 'Name', { max: 120 }), secret = password(body.password);
        const invitation = store.invitation(tokenHash(token), now());
        if (!invitation) fail(400, 'Invitation is invalid or expired.');
        if (store.userByEmail(invitation.email)) fail(409, 'This email is already registered. Sign in instead.');
        const passwordHash = await hashPassword(secret);
        const user = store.transaction(() => {
          const current = store.invitation(tokenHash(token), now());
          if (!current || !store.consumeInvite(tokenHash(token), now())) fail(400, 'Invitation is invalid or expired.');
          if (store.userByEmail(current.email)) fail(409, 'This email is already registered. Sign in instead.');
          return store.createUser({ companyId: current.companyId, name, email: current.email, passwordHash, role: 'member', createdAt: new Date(now()).toISOString() });
        });
        return startSession(request, response, user, 201);
      }
      if (!session) fail(401, 'Please sign in to continue.');
      const user = session.user;
      if (unsafe && !equalSecret(request.headers['x-csrf-token'], session.csrfToken)) fail(403, 'Your session token is missing or invalid. Refresh and try again.');
      if (method === 'POST' && path === '/api/logout') { store.deleteSession(tokenHash(session.token)); return json(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', secureCookies, true) }); }
      if (method === 'GET' && path === '/api/state') {
        const raw = stateFor(user);
        const questions = raw.questions.filter(q => user.role === 'manager' || q.status !== 'draft');
        const requests = raw.requests.filter(r => questions.some(q => q.id === r.questionId));
        const responses = raw.responses.filter(r => requests.some(q => q.id === r.requestId));
        const decisions = raw.decisions.filter(d => questions.some(q => q.id === d.questionId));
        return json(response, 200, { user: publicUser(user), company:store.company(user.companyId), csrfToken:session.csrfToken,
          members:store.members(user.companyId), questions, requests, responses, decisions, planning:planningInfo(),
          briefings:questions.map(q => buildBriefing(q, requests, responses, decisions)),
          suggestions:Object.fromEntries(requests.map(r => [r.id, evidenceSuggestions(r, responses, requests)])) });
      }
      if (!['POST','PATCH'].includes(method)) fail(404, 'API endpoint not found.');
      const body = await bodyOf(request);
      const stamp = new Date(now()).toISOString();
      const base = () => ({id:randomUUID(), createdAt:stamp, authorId:user.id, authorName:user.name});
      const manager = () => { if(user.role !== 'manager') fail(403,'Only company managers can perform this action.'); };
      const limited = () => { if(!companyLimiter.allow(user.companyId, now())) fail(429,'Your company has reached the hourly request limit. Try again later.'); };
      const memberId = value => { const id = identifier(value, 'Assignee', true); if(id && !store.members(user.companyId).some(m=>m.id===id)) fail(404,'Team member not found.'); return id; };
      const version = (expected, record) => { if(!Number.isSafeInteger(expected) || expected !== record.version) fail(409,'This item changed. Refresh to see the latest version before trying again.'); };
      if(method === 'POST' && path === '/api/invites') {
        manager(); fields(body,['email']); limited();
        const address = email(body.email);
        if(store.userByEmail(address)) fail(409,'This email already has an account. Each account belongs to one company in this MVP.');
        const token = newToken(), expiresAt=now()+INVITE_LIFETIME;
        store.invite({tokenHash:tokenHash(token),companyId:user.companyId,email:address,createdBy:user.id,expiresAt});
        return json(response,201,{invite:{email:address,token,expiresAt:new Date(expiresAt).toISOString()}});
      }
      if(method === 'POST' && path === '/api/questions') {
        manager(); fields(body,['text','context','dueDate']); limited();
        const question = {...base(), text:text(body.text,'Question',{max:1200}),context:text(body.context,'Context',{required:false,max:3000}),dueDate:date(body.dueDate,'Response due date',{dateOnly:true,optional:true}),status:'draft',version:1};
        if(planningActive.has(user.companyId)) fail(429,'A question is already being drafted for your company. Try again shortly.');
        planningActive.add(user.companyId);
        let draft; try { draft = await plan(question.text,question.context); } finally { planningActive.delete(user.companyId); }
        question.engine=draft.engine; question.planNote=draft.note;
        const requests=draft.requests.map(r=>({...base(),...r,questionId:question.id,assigneeId:null,version:1,followups:[]}));
        store.transaction(()=>{store.insert(user.companyId,'questions',question); for(const r of requests) store.insert(user.companyId,'requests',r);});
        return json(response,201,{question,requests});
      }
      const qmatch = path.match(/^\/api\/questions\/([^/]+)(?:\/(launch|close|reopen|decisions))?$/);
      if(qmatch) {
        manager(); const q=requireRecord(user,'questions',identifier(qmatch[1],'Question ID')); const action=qmatch[2];
        if(method==='PATCH' && !action) {
          fields(body,['expectedVersion','context','dueDate','requests']); version(body.expectedVersion,q);
          if(q.status!=='draft') fail(409,'Only drafts can be edited. Use a follow-up for a live question.');
          if(!Array.isArray(body.requests) || body.requests.length<1 || body.requests.length>8) fail(400,'Provide 1 to 8 response requests.');
          const requests=body.requests.map(r=>{fields(r,['title','role','prompt','assigneeId']); return {...base(),title:text(r.title,'Title',{max:120}),role:text(r.role,'Suggested role',{required:false,max:100}),prompt:text(r.prompt,'Question prompt',{max:1500}),assigneeId:memberId(r.assigneeId),questionId:q.id,version:1,followups:[]};});
          const updated={...q,context:text(body.context,'Context',{required:false,max:3000}),dueDate:date(body.dueDate,'Response due date',{dateOnly:true,optional:true}),version:q.version+1,updatedAt:stamp};
          store.transaction(()=>{store.db.prepare('DELETE FROM records WHERE company_id = ? AND type = ? AND json_extract(payload, ?) = ?').run(user.companyId,'requests','$.questionId',q.id); for(const r of requests) store.insert(user.companyId,'requests',r); store.replace(user.companyId,'questions',updated);});
          return json(response,200,{question:updated,requests});
        }
        if(method==='POST' && ['launch','close','reopen'].includes(action)) {
          fields(body,['expectedVersion']); version(body.expectedVersion,q);
          if(action==='launch') {
            if(q.status!=='draft') fail(409,'This question has already been launched.');
            const requests=store.all(user.companyId,'requests').filter(r=>r.questionId===q.id);
            if(!requests.length || requests.some(r=>!r.assigneeId)) fail(400,'Assign a responsible person to every request before launching. You may assign yourself.');
          } else if(action==='close' && q.status!=='live' || action==='reopen' && q.status!=='closed') fail(409,'This question cannot make that transition.');
          const updated={...q,status:action==='close'?'closed':'live',version:q.version+1,updatedAt:stamp,...(action==='launch'?{launchedAt:stamp}:{}),...(action==='close'?{closedAt:stamp}:{closedAt:null})};
          store.replace(user.companyId,'questions',updated); return json(response,200,{question:updated});
        }
        if(method==='POST' && action==='decisions') {
          fields(body,['text']); if(q.status==='draft') fail(409,'Launch the question first.'); limited();
          const decision={...base(),questionId:q.id,text:text(body.text,'Decision',{max:3000})};
          store.insert(user.companyId,'decisions',decision); return json(response,201,{decision});
        }
      }
      const rmatch=path.match(/^\/api\/requests\/([^/]+)(?:\/(responses))?$/);
      if(rmatch) {
        const r=requireRecord(user,'requests',identifier(rmatch[1],'Request ID'));
        const q=requireRecord(user,'questions',r.questionId);
        if(q.status==='draft' && user.role!=='manager') fail(404,'Request not found.');
        if(q.status!=='live') fail(409,'Responses and follow-ups require a live question.');
        if(method==='PATCH' && !rmatch[2]) {
          manager(); fields(body,['expectedVersion','assigneeId','followup']); version(body.expectedVersion,r); limited();
          const assigneeId=memberId(body.assigneeId); if(!assigneeId) fail(400,'Choose a responsible person.');
          const followup={...base(),text:text(body.followup,'Follow-up',{max:1500}),assigneeId};
          const updated={...r,assigneeId,version:r.version+1,followups:[...r.followups,followup],updatedAt:stamp};
          store.replace(user.companyId,'requests',updated); return json(response,200,{request:updated});
        }
        if(method==='POST' && rmatch[2]==='responses') {
          fields(body,['expectedVersion','expectedResponseId','text','status','source','observedAt','nextStep','decisionNeeded','reuseResponseId']);
          if(user.role!=='manager' && r.assigneeId!==user.id) fail(403,'Only the assigned person or a manager can respond.');
          version(body.expectedVersion,r); limited();
          const previous=store.all(user.companyId,'responses').filter(a=>a.requestId===r.id).at(-1);
          if((body.expectedResponseId || null)!==(previous?.id || null)) fail(409,'Another response was submitted. Refresh before updating it.');
          if(!['on_track','at_risk','blocked','unknown'].includes(body.status)) fail(400,'Choose a reported status.');
          const reuseId=identifier(body.reuseResponseId,'Source response',true);
          let reused=null;
          if(reuseId) {
            const source=requireRecord(user,'responses',reuseId);
            const sourceRequest=requireRecord(user,'requests',source.requestId);
            const sourceQuestion=requireRecord(user,'questions',sourceRequest.questionId);
            if(sourceQuestion.status==='draft') fail(404,'Source response not available.');
            reused={responseId:source.id,questionId:sourceRequest.questionId,authorName:source.authorName,createdAt:source.createdAt,text:source.text};
          }
          const answer={...base(),questionId:q.id,requestId:r.id,requestVersion:r.version,previousResponseId:previous?.id || null,
            text:text(body.text,'Response',{max:6000}),status:body.status,source:text(body.source,'Source reference',{required:false,max:1000}),
            observedAt:date(body.observedAt,'Observation time',{optional:true}),nextStep:text(body.nextStep,'Next step',{required:false,max:2000}),decisionNeeded:text(body.decisionNeeded,'Decision needed',{required:false,max:2000}),reused};
          store.insert(user.companyId,'responses',answer); return json(response,201,{response:answer});
        }
      }
      fail(404,'API endpoint not found.');
    } catch(error) {
      if(!response.headersSent) json(response,error.status || 500,{error:error.status?error.message:'The request could not be completed. Please try again.'});
      if(!error.status) console.error('Request failed:',error.name,error.code || 'internal error');
    }
  });
  server.requestTimeout=30000; server.headersTimeout=15000;
  return {server,store,
    listen(port=options.port ?? Number(process.env.PORT || 3150),host=options.host ?? process.env.HOST ?? '127.0.0.1') {
      return new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolveListen(server.address());});});
    },
    async close(){if(server.listening) await new Promise((resolveClose,reject)=>{server.close(e=>e?reject(e):resolveClose());server.closeIdleConnections();});store.close();}
  };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createApp(); const address=await app.listen(); console.log(`Quick View listening on ${address.address}:${address.port}`);
  let closing=false; const shutdown=async()=>{if(closing)return;closing=true;await app.close();process.exit(0);};
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
