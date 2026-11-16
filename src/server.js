const noStore = {'Cache-Control': 'no-store'}
const json = (body, status = 200) => Response.json(body, {status, headers: noStore})

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/') {
      return new Response(html, {headers: {...noStore, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'none'; object-src 'none'; base-uri 'none'"}})
    }
    if (Object.hasOwn(assets, url.pathname)) {
      return new Response(assets[url.pathname], {headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'private, max-age=31536000, immutable'
      }})
    }
    if (url.pathname !== '/api/collection') return new Response(null, {status: 404})
    const user = request.headers.get('oai-authenticated-user-id')
    if (!user) return json({error: '로그인이 필요해요.'}, 401)
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT revision, payload FROM collections WHERE user_id = ?').bind(user).first()
      return json(row ? {revision: row.revision, collection: JSON.parse(row.payload)} : {revision: 0, collection: null})
    }
    if (request.method !== 'PUT') return json(null, 405)
    if (request.headers.get('origin') !== url.origin) return json(null, 403)
    const body = await request.text()
    if (new TextEncoder().encode(body).length > 1800000) return json({error:'저장 용량을 초과했어요.'}, 413)
    let data
    try {data = JSON.parse(body)} catch {return json(null, 400)}
    const {revision, collection} = data ?? {}
    if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(collection?.cards)) return json(null, 400)
    const payload = JSON.stringify(collection)
    const result = revision === 0
      ? await env.DB.prepare('INSERT INTO collections (user_id, revision, payload) VALUES (?, 1, ?) ON CONFLICT DO NOTHING').bind(user, payload).run()
      : await env.DB.prepare('UPDATE collections SET revision = revision + 1, payload = ? WHERE user_id = ? AND revision = ?').bind(payload, user, revision).run()
    return result.meta.changes ? json({revision: revision + 1}) : json({error: '다른 기기에서 변경했어요. 최신 상태를 다시 불러왔어요.'}, 409)
  }
}
