import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const $ = selector => document.querySelector(selector);
const notice = message => { $('#notice').textContent = message || ''; };
const show = name => {
  ['setup-panel', 'auth-panel', 'pending-panel', 'community-app'].forEach(id => { $(`#${id}`).hidden = id !== name; });
};
const state = { client: null, user: null, membership: null, rooms: [], room: null, topics: [], topic: null, messages: [], channel: null, searchTimer: null };
const dateLabel = value => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const permissions = () => state.membership?.roles || {};

async function start() {
  try {
    const response = await fetch('/api/community-config', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || !config.configured) return show('setup-panel');
    state.client = createClient(config.url, config.anonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
    state.client.auth.onAuthStateChange((_event, session) => { setTimeout(() => refreshUser(session?.user || null), 0); });
    const { data: { session } } = await state.client.auth.getSession();
    await refreshUser(session?.user || null);
  } catch (error) {
    show('setup-panel');
    notice('연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

async function refreshUser(user) {
  state.user = user;
  if (!user) { await leaveChannel(); state.membership = null; show('auth-panel'); return; }
  const { data, error } = await state.client.from('memberships').select('id,user_id,display_name,status,role_id,roles(name,can_post,can_organize,can_manage_members)').eq('user_id', user.id).maybeSingle();
  if (error) { notice('멤버십 상태를 불러오지 못했습니다.'); show('pending-panel'); return; }
  state.membership = data;
  if (!data || data.status !== 'active') { await leaveChannel(); show('pending-panel'); return; }
  show('community-app');
  $('#member-label').textContent = `${data.display_name} · ${data.roles?.name || '멤버'}`;
  $('#organize-button').hidden = !permissions().can_organize;
  $('#admin-toggle').hidden = !permissions().can_manage_members;
  $('#message-input').disabled = !permissions().can_post;
  $('#message-form button').disabled = !permissions().can_post;
  await loadRooms();
}

async function loadRooms() {
  const { data, error } = await state.client.from('rooms').select('id,name,description').order('created_at');
  if (error) return notice('대화방을 불러오지 못했습니다.');
  state.rooms = data || [];
  $('#room-list').replaceChildren(...state.rooms.map(room => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'room-button'; button.textContent = room.name;
    button.addEventListener('click', () => selectRoom(room.id)); return button;
  }));
  if (state.rooms.length) await selectRoom(state.room && state.rooms.some(room => room.id === state.room.id) ? state.room.id : state.rooms[0].id);
}

async function leaveChannel() {
  if (state.channel && state.client) await state.client.removeChannel(state.channel);
  state.channel = null;
}

async function selectRoom(id) {
  await leaveChannel();
  state.room = state.rooms.find(room => room.id === id);
  state.topic = null;
  $('#room-heading').textContent = state.room.name;
  $('#room-description').textContent = state.room.description || '';
  $('#search-input').value = '';
  document.querySelectorAll('.room-button').forEach((button, index) => button.classList.toggle('selected', state.rooms[index].id === id));
  await Promise.all([loadTopics(), loadMessages()]);
  state.channel = state.client.channel(`room:${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${id}` }, () => loadMessages())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'topics', filter: `room_id=eq.${id}` }, () => loadTopics())
    .subscribe();
}

async function loadTopics() {
  const { data, error } = await state.client.from('topics').select('id,title,summary,created_at').eq('room_id', state.room.id).order('created_at', { ascending: false }).limit(30);
  if (error) return notice('주제를 불러오지 못했습니다.');
  state.topics = data || [];
  if (state.topic) state.topic = state.topics.find(topic => topic.id === state.topic.id) || null;
  $('#topic-list').replaceChildren(...state.topics.map(topic => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'topic-button';
    button.textContent = topic.title;
    const sub = document.createElement('small'); sub.textContent = topic.summary || '요약 없음'; button.append(sub);
    button.addEventListener('click', () => selectTopic(topic.id)); return button;
  }));
  renderTopic();
}

function selectTopic(id) {
  state.topic = state.topics.find(topic => topic.id === id) || null;
  renderTopic(); renderMessages();
}

function renderTopic() {
  const topic = state.topic;
  $('#topic-context').hidden = !topic;
  if (topic) { $('#topic-heading').textContent = topic.title; $('#topic-summary').textContent = topic.summary || '아직 요약이 없습니다.'; }
  $('#reply-context').textContent = topic ? `“${topic.title}” 주제에 보내기` : '전체 대화에 보내기';
  $('#all-topics').classList.toggle('selected', !topic);
  document.querySelectorAll('#topic-list .topic-button').forEach((button, index) => button.classList.toggle('selected', state.topics[index].id === topic?.id));
}

async function loadMessages() {
  if (!state.room) return;
  let query = state.client.from('messages').select('id,user_id,body,created_at,topic_id,memberships(display_name),topics(title)').eq('room_id', state.room.id).order('created_at', { ascending: false }).limit(200);
  const term = $('#search-input').value.trim();
  if (term) query = query.ilike('body', `%${term.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
  const { data, error } = await query;
  if (error) return notice('대화를 불러오지 못했습니다.');
  state.messages = (data || []).reverse(); renderMessages();
}

function renderMessages() {
  const list = $('#message-list');
  const visible = state.topic ? state.messages.filter(message => message.topic_id === state.topic.id) : state.messages;
  if (!visible.length) { const empty = document.createElement('p'); empty.className = 'empty-messages'; empty.textContent = $('#search-input').value ? '검색 결과가 없습니다.' : '아직 대화가 없습니다. 첫 이야기를 남겨 주세요.'; list.replaceChildren(empty); return; }
  list.replaceChildren(...visible.map(message => {
    const article = document.createElement('article'); article.className = `message${message.user_id === state.user.id ? ' mine' : ''}`;
    const meta = document.createElement('div'); meta.className = 'message-meta';
    const author = document.createElement('strong'); author.textContent = message.memberships?.display_name || '멤버';
    const time = document.createElement('time'); time.dateTime = message.created_at; time.textContent = dateLabel(message.created_at);
    meta.append(author, time);
    const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = message.body;
    article.append(meta, bubble);
    if (message.topics?.title && !state.topic) { const tag = document.createElement('small'); tag.className = 'message-topic'; tag.textContent = `# ${message.topics.title}`; article.append(tag); }
    return article;
  }));
  list.scrollTop = list.scrollHeight;
}

$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.email.value.trim(); const password = form.elements.password.value;
  const { error } = await state.client.auth.signInWithPassword({ email, password });
  notice(error ? '로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.' : '');
});
$('#signup-button').addEventListener('click', async () => {
  const form = $('#auth-form');
  if (!form.reportValidity()) return;
  const { error } = await state.client.auth.signUp({ email: form.elements.email.value.trim(), password: form.elements.password.value });
  notice(error ? `가입 신청에 실패했습니다: ${error.message}` : '가입 신청을 받았습니다. 이메일 확인 후 운영자 승인을 기다려 주세요.');
});
async function logout() { await leaveChannel(); await state.client.auth.signOut(); notice('로그아웃했습니다.'); }
$('#logout-button').addEventListener('click', logout);
$('#pending-logout').addEventListener('click', logout);
$('#all-topics').addEventListener('click', () => selectTopic(null));
$('#clear-topic').addEventListener('click', () => selectTopic(null));
$('#search-input').addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(loadMessages, 250); });
$('#message-form').addEventListener('submit', async event => {
  event.preventDefault();
  const body = $('#message-input').value.trim();
  if (!body || !state.room || !permissions().can_post) return;
  const { error } = await state.client.from('messages').insert({ room_id: state.room.id, user_id: state.user.id, body, topic_id: state.topic?.id || null });
  if (error) return notice('메시지를 보내지 못했습니다. 다시 시도해 주세요.');
  $('#message-input').value = ''; notice(''); await loadMessages();
});
$('#message-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#message-form').requestSubmit(); } });
$('#organize-button').addEventListener('click', async () => {
  const button = $('#organize-button'); button.disabled = true; notice('최근 대화를 주제별로 정리하고 있습니다.');
  try {
    const { data: { session } } = await state.client.auth.getSession();
    const response = await fetch('/api/organize', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ roomId: state.room.id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '정리에 실패했습니다.');
    notice(`${result.count}개 주제로 정리했습니다.`); await Promise.all([loadTopics(), loadMessages()]);
  } catch (error) { notice(error.message); } finally { button.disabled = false; }
});
$('#admin-toggle').addEventListener('click', async () => { $('#admin-panel').hidden = false; await loadMembers(); $('#admin-panel').scrollIntoView({ behavior: 'smooth' }); });
$('#admin-close').addEventListener('click', () => { $('#admin-panel').hidden = true; });
async function loadMembers() {
  const [{ data: members, error }, { data: roles }] = await Promise.all([
    state.client.from('memberships').select('id,user_id,display_name,status,role_id,created_at').order('created_at', { ascending: false }),
    state.client.from('roles').select('id,name').order('rank')
  ]);
  if (error) return notice('멤버 목록을 불러오지 못했습니다.');
  $('#member-list').replaceChildren(...(members || []).map(member => {
    const row = document.createElement('div'); row.className = 'member-row';
    const name = document.createElement('span'); name.textContent = member.display_name; const date = document.createElement('small'); date.textContent = dateLabel(member.created_at); name.append(date);
    const status = document.createElement('select'); [['pending','승인 대기'],['active','활성'],['suspended','정지']].forEach(([value,label]) => status.add(new Option(label,value))); status.value = member.status;
    const role = document.createElement('select'); (roles || []).forEach(item => role.add(new Option(item.name,item.id))); role.value = member.role_id || '';
    const save = document.createElement('button'); save.type = 'button'; save.textContent = '저장';
    if (member.user_id === state.user.id) { status.disabled = true; role.disabled = true; save.disabled = true; }
    save.addEventListener('click', async () => {
      const { error: updateError } = await state.client.from('memberships').update({ status: status.value, role_id: role.value || null }).eq('id', member.id);
      notice(updateError ? `변경하지 못했습니다: ${updateError.message}` : '멤버십을 변경했습니다.');
      if (!updateError) await loadMembers();
    }); row.append(name,status,role,save); return row;
  }));
}
start();
