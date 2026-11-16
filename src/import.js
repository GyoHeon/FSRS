import {unzipSync} from 'fflate'
import {decompress} from 'fzstd'
import {day, fresh, scheduler} from './schedule.js'

const maxBytes = 30 * 1024 * 1024
const first = (db, sql) => db.exec(sql)[0]?.values ?? []
function plain(html) {
  const document = new DOMParser().parseFromString(html.replace(/<br\s*\/?\s*>|<\/(?:div|p|li)>/gi, '\n'), 'text/html')
  document.querySelectorAll('script,style').forEach(element => element.remove())
  return document.body.textContent.replace(/\[sound:[^\]]+\]/g, '').trim()
}

export async function readAnki(file, settings) {
  if (file.size > maxBytes) throw Error('30MB 이하의 Anki 파일을 선택해 주세요.')
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: ({name, originalSize}) => /^collection\.anki(?:2|21|21b)$/.test(name) && originalSize <= maxBytes
  })
  const bytes = entries['collection.anki21b'] ? decompress(entries['collection.anki21b']) : entries['collection.anki21'] ?? entries['collection.anki2']
  if (!bytes || bytes.length > maxBytes) throw Error('지원하는 Anki 컬렉션 파일을 찾지 못했어요.')
  const {default: init} = await import('sql.js/dist/sql-wasm-inline.js')
  const sql = await init()
  const db = new sql.Database(bytes)
  try {return extract(db, settings)} finally {db.close()}
}

export function extract(db, settings) {
  const [[crt, models, decks]] = first(db, 'select crt, models, decks from col')
  const modern = !models || models === '{}'
  const names = modern
    ? new Map(first(db,'select id, name from decks'))
    : new Map(Object.values(JSON.parse(decks || '{}')).map(d => [d.id, d.name]))
  const histories = new Map()
  for (const [id, cid, ease, ivl, lastIvl, factor, time, type] of first(db, 'select id,cid,ease,ivl,lastIvl,factor,time,type from revlog order by id')) {
    if (!histories.has(cid)) histories.set(cid, [])
    histories.get(cid).push({at:id, grade:ease, interval:ivl, lastInterval:lastIvl, factor, ms:time, type})
  }
  const engine = scheduler(settings)
  const cards = []
  let skipped = 0
  for (const [id, guid, values, deck, ord, type, queue, due, ivl, reps, lapses, left, originalDue, originalDeck, data] of first(db, 'select c.id,n.guid,n.flds,c.did,c.ord,c.type,c.queue,c.due,c.ivl,c.reps,c.lapses,c.left,c.odue,c.odid,c.data from cards c join notes n on n.id=c.nid')) {
    const content = values.split('\x1f')
    const cloze = new RegExp('\\{\\{c'+(ord+1)+'::([\\s\\S]*?)\\}\\}', 'gi')
    const textIndex = content.findIndex(field=>field.search(cloze) >= 0)
    const isCloze = textIndex >= 0
    const removeCloze = text => text.replace(/\{\{c\d+::([\s\S]*?)\}\}/gi, (_,value)=>value.split('::')[0])
    let front, back
    if (isCloze) {
      front = removeCloze(content[textIndex].replace(cloze, (_,value)=>'['+(value.split('::')[1] || '…')+']'))
      back = removeCloze(content[textIndex])
    } else {
      front = content[ord === 1 ? 1 : 0] ?? ''
      back = content[ord === 1 ? 0 : 1] ?? ''
    }
    front = plain(front)
    back = plain(back)
    if (!front || !back) {skipped++; continue}
    const history = histories.get(id) ?? []
    let memory = fresh()
    for (const entry of history) {
      if (entry.grade >= 1 && entry.grade <= 4 && entry.type !== 4) memory = engine.next(memory, new Date(entry.at), entry.grade).card
    }
    if (type !== 0) {
      let saved = {}
      try {saved = JSON.parse(data || '{}')} catch {}
      const effectiveDue = originalDeck && originalDue ? originalDue : due
      const last = history.findLast(item => item.grade >= 1 && item.grade <= 4 && item.type !== 4)?.at
      const dueAt = effectiveDue > 365000 ? effectiveDue * 1000 : crt * 1000 + effectiveDue * day
      const state = ({1:1, 2:2, 3:3})[type] ?? 2
      memory = {...memory, state, due: new Date(dueAt), stability: saved.s > 0 ? saved.s : (memory.stability || Math.max(0.1,ivl)),
        difficulty: saved.d >= 1 && saved.d <= 10 ? saved.d : (memory.difficulty || 5),
        last_review: new Date(last ?? Math.min(Date.now(), dueAt - Math.max(1, ivl) * day)),
        scheduled_days: Math.max(0, ivl), reps, lapses,
        learning_steps: state === 1 || state === 3 ? Math.max(0, (state === 1 ? settings.learn : settings.relearn).trim().split(/\s+/).filter(Boolean).length - left % 1000) : 0}
    } else memory = fresh()
    cards.push({id:'anki:'+guid+':'+ord, front, back, deck:(names.get(originalDeck || deck) ?? 'Anki').replaceAll('\x1f','::'),
      schedule:memory, paused:queue === -1, history})
  }
  if (!cards.length) throw Error('가져올 수 있는 텍스트 카드를 찾지 못했어요.')
  return {cards, skipped}
}
