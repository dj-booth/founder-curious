import { neon } from '@neondatabase/serverless';
import { extname, join, resolve } from 'node:path';

const DB_URL = process.env.DATABASE_URL;
const PASS = process.env.FC_PASS;
if (!DB_URL || !PASS) {
  console.error('missing DATABASE_URL or FC_PASS in env');
  process.exit(1);
}
const sql = neon(DB_URL);

const PORT = Number(process.env.PORT) || 8766;
const ROOT = resolve(import.meta.dir);
const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml',
  '.json':'application/json; charset=utf-8',
  '.ico':'image/x-icon',
};

const cors = {
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET, POST, OPTIONS',
  'access-control-allow-headers':'content-type, x-fc-pass',
};

const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), {status, headers:{'content-type':'application/json', ...cors}});

const auth = req => req.headers.get('x-fc-pass') === PASS;

Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req){
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});

    if (url.pathname.startsWith('/api/')){
      if (!auth(req)) return json({error:'unauthorized'}, 401);

      if (url.pathname === '/api/stars' && req.method === 'GET'){
        const event = url.searchParams.get('event');
        if (!event) return json({error:'event required'}, 400);
        const rows = await sql`SELECT from_id, to_id, extract(epoch from created_at)*1000 as created_at FROM stars WHERE event_id = ${event} ORDER BY created_at ASC`;
        return json({stars: rows});
      }

      if (url.pathname === '/api/stars' && req.method === 'POST'){
        let body;
        try { body = await req.json(); } catch { return json({error:'bad json'}, 400); }
        const {event, from, to, action} = body || {};
        if (!event || !from || !to || !action) return json({error:'missing fields'}, 400);
        if (from === to) return json({error:'cannot star self'}, 400);
        if (action === 'add'){
          await sql`INSERT INTO stars (event_id, from_id, to_id) VALUES (${event}, ${from}, ${to}) ON CONFLICT DO NOTHING`;
        } else if (action === 'remove'){
          await sql`DELETE FROM stars WHERE event_id = ${event} AND from_id = ${from} AND to_id = ${to}`;
        } else {
          return json({error:'bad action'}, 400);
        }
        return json({ok:true});
      }

      // Notes ---------------------------------------------------------
      if (url.pathname === '/api/notes' && req.method === 'GET'){
        const event = url.searchParams.get('event');
        const from = url.searchParams.get('from');
        if (!event || !from) return json({error:'event and from required'}, 400);
        const rows = await sql`SELECT to_id, body, extract(epoch from updated_at)*1000 as updated_at FROM notes WHERE event_id = ${event} AND from_id = ${from}`;
        return json({notes: rows});
      }

      if (url.pathname === '/api/notes' && req.method === 'POST'){
        let body;
        try { body = await req.json(); } catch { return json({error:'bad json'}, 400); }
        const {event, from, to, body: text} = body || {};
        if (!event || !from || !to) return json({error:'missing fields'}, 400);
        const trimmed = (text || '').trim();
        if (!trimmed){
          await sql`DELETE FROM notes WHERE event_id = ${event} AND from_id = ${from} AND to_id = ${to}`;
        } else {
          await sql`
            INSERT INTO notes (event_id, from_id, to_id, body, updated_at)
            VALUES (${event}, ${from}, ${to}, ${trimmed}, now())
            ON CONFLICT (event_id, from_id, to_id)
            DO UPDATE SET body = EXCLUDED.body, updated_at = now()
          `;
        }
        return json({ok:true});
      }

      return json({error:'not found'}, 404);
    }

    // Static files
    let path = url.pathname;
    if (path === '/') path = '/index.html';
    const filePath = join(ROOT, path);
    if (!filePath.startsWith(ROOT + '/') && filePath !== ROOT) {
      return new Response('forbidden', {status:403});
    }
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response('not found', {status:404});
    const ext = extname(filePath).toLowerCase();
    return new Response(file, {
      headers: {
        'content-type': MIME[ext] || file.type || 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=600',
        ...cors,
      },
    });
  },
});

console.log(`server running on http://localhost:${PORT}`);
