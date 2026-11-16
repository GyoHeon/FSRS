import {fresh, scheduler} from './schedule.js'

const screen = document.querySelector('#screen')
const status = document.querySelector('#status')
const phrase = ['Again','Hard','Good','Easy']
const endpoint = '/api/collection'
let state, revision, busy = false, view = 'review', deck = '', revealed = null, editId = null

function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag)
  for (const [key,value] of Object.entries(attrs)) {
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value)
    else if (value != null) element.setAttribute(key, value)
  }
  element.append(...children)
  return element
}
const p = (str, className) => node('p',{class:className},str)
const button = (label, action, className, ...children) => node('button',{type:'button',class:className,onclick:action,disabled:busy?'':null},label,...children)
const format = (time) => new Date(time).toLocaleString('ko-KR', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
const dueTime = (card) => +new Date(card.schedule.due)
const active = () => state.cards.filter(card => !card.paused && (!deck || card.deck === deck))
const due = () => active().filter(card => dueTime(card) <= Date.now()).sort((a,b)=>dueTime(a)-dueTime(b))
const signal = text => {status.textContent = text}

async function fetchCollection() {
  const res = await fetch(endpoint,{cache:'no-store'})
  if (res.status === 401) {
    signal('기기 간 동기화를 사용하려면 로그인해 주세요.')
    screen.replaceChildren(node('a',{href:'/signin-with-chatgpt?returnTo=%2F',target:'_top',class:'link'},'ChatGPT로 로그인'))
    return false
  }
  if (!res.ok) throw Error('컬렉션을 불러오지 못했어요.')
  const data = await res.json()
  if (revision !== undefined && revision !== data.revision) revealed = null
  revision = data.revision
  state = data.collection ?? {cards:[]}
  return true
}
async function refresh(quiet = false) {
  if (busy || (quiet && (!state || view !== 'review' || revealed))) return
  busy = true
  try {
    if (await fetchCollection()) {
      signal(quiet && status.textContent !== '동기화 중…' ? status.textContent : '동기화됨')
      busy = false
      render()
    }
  } catch (error) {
    if (!quiet) signal(error.message)
  } finally {busy = false}
}
async function save(change, message, closeEditor = false) {
  if (!state || busy) return
  busy = true
  signal('동기화 중…')
  try {
    const collection = structuredClone(state)
    await change(collection)
    const res = await fetch(endpoint, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,collection})})
    if (res.status === 409) {
      await fetchCollection()
      revealed = null
      throw Error('다른 기기의 변경을 불러왔어요. 작업을 다시 시도해 주세요.')
    }
    const result = await res.json()
    if (!res.ok) throw Error(result?.error || '변경 사항을 저장하지 못했어요.')
    revision = result.revision
    state = collection
    revealed = null
    if (closeEditor) editId = null
    signal(typeof message === 'function' ? message() : message)
    busy = false
    render()
  } catch (error) {
    signal(error.message)
    if (!revealed && view === 'review') {busy = false; render()}
  } finally {busy = false}
}

function deckNames() {
  return [...new Set(state.cards.map(card=>card.deck))].sort((a,b)=>a.localeCompare(b,'ko'))
}
function deckSelect() {
  const options = deckNames()
  const select = node('select',{'aria-label':'덱 선택',onchange:event=>{deck=event.target.value;revealed=null;render()}},
    node('option',{value:''},'모든 덱'),...options.map(option=>node('option',{value:option},option)))
  select.value = deck
  return select
}
function review() {
  const queue = due()
  const card = queue[0]
  const bar = node('div',{class:'bar'},p(queue.length+'장 복습 가능','tags'),deckSelect())
  screen.append(node('h1',{},'오늘의 복습'),bar)
  if (!card) {
    const next = active().sort((a,b)=>dueTime(a)-dueTime(b))[0]
    screen.append(node('div',{class:'card'},node('h2',{},next ? '지금 복습할 카드를 다 봤어요' : '이 덱에 복습할 카드가 없어요'),
      next ? p('다음 복습 '+format(next.schedule.due),'muted') : button('카드 추가하기',()=>navigate('cards'),'primary')))
    return
  }
  const shown = revealed === card.id
  const panel = node('div',{class:'card'},node('small',{},card.deck),p(card.front,'prompt'))
  screen.append(panel)
  if (!shown) {
    screen.append(button('정답 보기',()=>{revealed=card.id;render();screen.querySelector('.actions button')?.focus()},'primary reveal'))
    return
  }
  panel.append(p(card.back,'answer'))
  const engine = scheduler
  const now = new Date()
  const options = engine.repeat(card.schedule,now)
  const grades = phrase.map((label,index)=>{
    const result = options[index+1].card
    const minutes = Math.max(1, Math.round((+result.due - +now)/60000))
    const interval = result.scheduled_days ? result.scheduled_days+'일' : minutes >= 60 ? Math.round(minutes/60)+'시간' : minutes+'분'
    return button(label,()=>grade(card.id,index+1),index===2?'primary':'',node('small',{},interval))
  })
  screen.append(node('div',{class:'actions'},...grades))
}
function grade(id, rating) {
  return save(collection=>{
    const target = collection.cards.find(card=>card.id===id)
    const now = new Date()
    const {card} = scheduler.next(target.schedule,now,rating)
    target.schedule=card
    target.history.push({at:+now,grade:rating,interval:card.scheduled_days,due:card.due})
  },'복습 기록을 저장했어요.')
}

const field = (name, input) => node('label',{},name,input)
function cards() {
  screen.append(node('h1',{},'카드'),node('div',{class:'bar'},p(state.cards.length+'장','tags'),deckSelect()))
  const editing = state.cards.find(card=>card.id===editId)
  const names = deckNames()
  if (!names.length) names.push('기본')
  const newDeckInput = node('input',{name:'newDeck',maxlength:120,disabled:''})
  const newDeckField = node('div',{hidden:''},field('새 덱 이름',newDeckInput))
  const deckPicker = node('select',{name:'deck',onchange:event=>{
    const creating = event.target.value === ''
    newDeckField.hidden = !creating
    newDeckInput.disabled = !creating
    newDeckInput.required = creating
    if (creating) newDeckInput.focus()
  }},...names.map(name=>node('option',{value:name},name)),node('option',{value:''},'새 덱 만들기'))
  deckPicker.value = editing?.deck || (names.includes(deck) ? deck : names.includes('기본') ? '기본' : names[0])
  const form = node('form',{class:'panel',onsubmit:event=>{
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const front = data.get('front').trim(), back = data.get('back').trim()
    const name = data.get('deck') || data.get('newDeck')?.trim()
    if (!front || !back || !name) {signal('앞면, 뒷면, 덱을 입력해 주세요.');return}
    save(collection=>{
      const card = collection.cards.find(item=>item.id===editId)
      if (card) Object.assign(card,{front,back,deck:name})
      else collection.cards.push({id:crypto.randomUUID(),front,back,deck:name,schedule:fresh(),history:[]})
    },editing?'카드를 수정했어요.':'카드를 추가했어요.',true)
  }},node('h2',{},editing?'카드 편집':'새 카드'),
  field('덱',deckPicker),newDeckField,
  field('앞면',node('textarea',{name:'front',required:'',maxlength:5000},editing?.front ?? '')),
  field('뒷면',node('textarea',{name:'back',required:'',maxlength:5000},editing?.back ?? '')),
  node('div',{class:'row'},node('button',{class:'primary',type:'submit'},editing?'변경 저장':'카드 추가'),
  ...(editing?[button('취소',()=>{editId=null;render()})]:[])))
  const list = node('ul',{class:'entries'})
  for (const card of state.cards.filter(item=>!deck || item.deck===deck)) {
    list.append(node('li',{class:'row'},node('div',{},node('strong',{},card.front),
      node('small',{},card.deck+' · '+(card.paused?'일시 중지':card.schedule.state===0?'새 카드':format(card.schedule.due))+' · 복습 '+card.history.length+'회')),
      node('div',{},button('편집',()=>{editId=card.id;render();screen.querySelector('form').scrollIntoView({block:'start'})}),
        ' ',button(card.paused?'재개':'중지',()=>save(c=>{c.cards.find(x=>x.id===card.id).paused=!card.paused},'카드 상태를 저장했어요.')))))
  }
  screen.append(form,node('div',{class:'panel'},node('h2',{},'카드 목록'),list))
}
function render() {
  if (!state) return
  screen.replaceChildren()
  document.querySelectorAll('nav button').forEach(item=>item.setAttribute('aria-current',String(item.dataset.view===view)))
  ;({review,cards})[view]()
  scheduleRefresh()
}
function navigate(next) {
  if (busy || !state) return
  view=next
  revealed=null
  render()
  if (next==='review') refresh(true)
}
document.querySelectorAll('nav button').forEach(item=>item.addEventListener('click',()=>navigate(item.dataset.view)))
document.addEventListener('visibilitychange',()=>{if (!document.hidden && view==='review') refresh(true)})
let nextReview
function scheduleRefresh() {
  clearTimeout(nextReview)
  if (!state || view !== 'review' || due().length) return
  const next = Math.min(...active().map(dueTime))
  if (Number.isFinite(next)) nextReview = setTimeout(render,Math.min(2147483647, Math.max(250,next-Date.now()+50)))
}
refresh()
