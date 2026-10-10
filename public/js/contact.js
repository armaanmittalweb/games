// The contact page: a report or a message goes to /api/report and shows up in the Switchboard's Game Night page.
import { VID, pageView } from './track.js'

pageView()
const form = document.getElementById('contact-form'), err = document.getElementById('cf-err')
// From a room's menu (/contact?room=K7M2P&game=trivia): the room and game go along, so a report says where.
const q = new URLSearchParams(location.search)
const room = (q.get('room') ?? '').replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase(), game = (q.get('game') ?? '').replace(/[^a-z0-9]/g, '').slice(0, 20)
form.room.value = [room, game].filter(Boolean).join(' ')
if (q.get('topic') === 'behaviour') form.topic.value = "Someone's behaviour"
const say = msg => { err.textContent = msg; err.hidden = !msg }
form.text.addEventListener('input', () => say(''))
form.addEventListener('submit', async e => {
  e.preventDefault()
  const text = form.text.value.trim()
  if (text.length < 10) { say('Tell us a little more: at least a sentence.'); form.text.focus(); return }
  const btn = form.querySelector('button[type=submit]')
  btn.disabled = true
  try {
    const r = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vid: VID, topic: form.topic.value, text, reply: form.reply.value.trim(), room: form.room.value }) })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not send')
    form.hidden = true
    document.getElementById('cf-done').hidden = false
  } catch (x) {
    say(`${x.message}. Check your connection and try again.`)
    btn.disabled = false
  }
})
