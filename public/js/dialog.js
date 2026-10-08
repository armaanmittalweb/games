// Our own dialogs, in place of the browser's confirm() and prompt(): styled like the rest of the site, one at a time,
// and closed by Escape or a tap outside (which count as "no").
import { html, render, useState, useEffect, useRef } from './preact.js'

let open = null // { title, body, ok, cancel, danger, text, resolve }
const subs = new Set()
const changed = () => { for (const fn of subs) fn() }

let mounted = false
function mount() {
  if (mounted) return
  mounted = true
  const host = document.createElement('div')
  host.id = 'dialogs'
  document.body.append(host)
  render(html`<${Dialog} />`, host)
}

function show(d) {
  if (open) open.resolve(false)
  return new Promise(resolve => {
    open = { ...d, resolve }
    // The first dialog mounts the host, which renders it straight away; later ones reach it through changed().
    if (mounted) changed()
    else mount()
  })
}

/**
 * Asks a yes-or-no question. Resolves true for the main button, false for anything else. With `danger` the main
 * button is red and the safe answer has the focus, so Enter never does the risky thing.
 */
export const ask = ({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false }) => show({ title, body, ok, cancel, danger })

/** Shows text to copy by hand, for when the browser will not put it on the clipboard. */
export const showText = ({ title, body = '', text }) => show({ title, body, text, ok: 'Done', cancel: '' })

/** Whether a dialog is up (the room's back-button guard asks before stacking another). */
export const dialogOpen = () => !!open

/** Closes the dialog that is up, as if cancelled. */
export function dismiss() {
  if (!open) return
  const d = open
  open = null
  changed()
  d.resolve(false)
}

function Dialog() {
  const [, set] = useState(0)
  useEffect(() => { const fn = () => set(x => x + 1); subs.add(fn); return () => subs.delete(fn) }, [])
  const d = open
  const safe = useRef(), main = useRef(), field = useRef()
  const close = yes => {
    if (open !== d) return
    open = null
    changed()
    d.resolve(yes)
  }
  useEffect(() => {
    if (!d) return
    const back = document.activeElement
    ;(d.text !== undefined ? field : d.danger && safe.current ? safe : main).current?.focus()
    if (d.text !== undefined) field.current?.select()
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(false) } }
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); back?.focus?.({ preventScroll: true }) }
  }, [d])
  if (!d) return null
  return html`<div class="modal dialog" onClick=${e => e.target === e.currentTarget && close(false)}>
    <div class="card stack modal-card dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby=${d.body ? 'dlg-body' : undefined}>
      <h2 id="dlg-title" class="nomargin">${d.title}</h2>
      ${d.body ? html`<p id="dlg-body" class="nomargin dlg-body">${d.body}</p>` : ''}
      ${d.text !== undefined ? html`<input ref=${field} readonly value=${d.text} onFocus=${e => e.target.select()} aria-label="Text to copy" />` : ''}
      <div class="dialog-btns">
        ${d.cancel ? html`<button ref=${safe} class=${d.danger ? 'primary' : ''} onClick=${() => close(false)}>${d.cancel}</button>` : ''}
        <button ref=${main} class=${d.danger ? 'danger' : 'primary'} onClick=${() => close(true)}>${d.ok}</button>
      </div>
    </div>
  </div>`
}
