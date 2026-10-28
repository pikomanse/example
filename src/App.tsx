import { type Component, createSignal, For, onCleanup, Show } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import Pikoman from '@pikoman/ws';

import styles from './App.module.css';

/** What server.mjs puts in the token: everyone in the channel sees it. */
type Member = { name: string; color: string };
type Cursor = { x: number; y: number };
type Reaction = { id: number; x: number; y: number; emoji: string };

const EMOJI = ['👋', '🎉', '❤️', '🔥', '👀', '🚀'];
/** Pikoman lets a connection send 10 client events a second; leave room for reactions. */
const MOVE_EVERY_MS = 125;

// auth_url: our own backend (server.mjs) signs join tokens; it knows who you are from your session.
const pikoman = new Pikoman(import.meta.env.VITE_PIKOMAN_APP, {
  auth_url: '/pikoman/auth',
  ...(import.meta.env.VITE_PIKOMAN_WS ? { ws_address: import.meta.env.VITE_PIKOMAN_WS } : {}),
});

const App: Component = () => {
  // A public channel: anyone with the app id may listen. Your backend publishes to it, signed with
  // its API key ("Publish from your backend" in the README), and the message shows up as a banner.
  const [announcement, setAnnouncement] = createSignal('');
  let hideAnnouncement: number | undefined;
  pikoman.listen('main-channel').on('announcement', (data: { message: string }) => {
    setAnnouncement(data.message);
    clearTimeout(hideAnnouncement);
    hideAnnouncement = window.setTimeout(() => setAnnouncement(''), 6000);
  });

  // A presence channel: a token from your backend gets you in, and everyone sees who is here.
  const [name, setName] = createSignal(localStorage.getItem('name') ?? '');
  const [members, setMembers] = createSignal<[string, Member][]>([]);
  const [cursors, setCursors] = createStore<Record<string, Cursor>>({});
  const [reactions, setReactions] = createSignal<Reaction[]>([]);
  const [emoji, setEmoji] = createSignal(EMOJI[0]);
  const [joined, setJoined] = createSignal(false);
  const [joining, setJoining] = createSignal(false);
  let room: ReturnType<typeof pikoman.listenPresence> | undefined;

  const react = (reaction: Omit<Reaction, 'id'>) => {
    const id = Math.random();
    setReactions((all) => [...all, { ...reaction, id }]);
    setTimeout(() => setReactions((all) => all.filter((r) => r.id !== id)), 1600);
  };

  const join = async (event: SubmitEvent) => {
    event.preventDefault();
    // A second submit while the login is on its way would add every handler below twice.
    if (joining() || joined()) return;
    setJoining(true);
    try {
      localStorage.setItem('name', name());
      // Stands in for your own login: server.mjs remembers the name in a session cookie.
      const login = await fetch('/pikoman/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name() }),
      });
      if (!login.ok) return;
      room = pikoman.listenPresence('presence-lobby');
      room.members((list: Map<string, Member>) => {
        setMembers([...list]);
        // Someone left: drop their cursor.
        setCursors(produce((all) => Object.keys(all).forEach((id) => list.has(id) || delete all[id])));
      });
      // Client events are named client-…, and come with the sender's connection id first.
      room.on('client-move', (from: string, cursor: Cursor) => setCursors(from, cursor));
      room.on('client-react', (_from: string, reaction: Omit<Reaction, 'id'>) => react(reaction));
      setJoined(true);
    } finally {
      setJoining(false);
    }
  };

  // Positions go out as fractions of the window, so they land right on any screen size.
  let lastMove = 0;
  const onPointerMove = (event: PointerEvent) => {
    const now = performance.now();
    if (!room || now - lastMove < MOVE_EVERY_MS) return;
    lastMove = now;
    room.send('client-move', { x: event.clientX / innerWidth, y: event.clientY / innerHeight });
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!room || (event.target as HTMLElement).closest('button, form')) return;
    const reaction = { x: event.clientX / innerWidth, y: event.clientY / innerHeight, emoji: emoji() };
    react(reaction); // ours shows at once; the others get it from Pikoman
    room.send('client-react', reaction);
  };
  onCleanup(() => pikoman.leaveChannel('presence-lobby'));

  const member = (id: string) => members().find(([memberId]) => memberId === id)?.[1];

  return (
    <main class={styles.stage} onPointerMove={onPointerMove} onPointerDown={onPointerDown}>
      <header class={styles.bar}>
        <strong>Pikoman lobby</strong>
        <div class={styles.people}>
          <For each={members()}>
            {([, m]) => <span class={styles.avatar} style={{ background: m.color }} title={m.name}>{m.name[0]}</span>}
          </For>
          <Show when={members().length}><span>{members().length} online</span></Show>
        </div>
      </header>

      <Show when={announcement()}>
        <div class={styles.announcement}>📣 {announcement()}</div>
      </Show>

      <Show
        when={joined()}
        fallback={
          <form class={styles.join} onSubmit={join}>
            <h1>Live cursors, in 160 lines</h1>
            <p>Join, then open this page in another window.</p>
            <input placeholder="Your name" value={name()} onInput={(e) => setName(e.currentTarget.value)} maxlength="32" required />
            <button disabled={joining()}>Join the lobby</button>
          </form>
        }
      >
        <p class={styles.hint}>Move your mouse. Click to react.</p>
        <nav class={styles.picker}>
          <For each={EMOJI}>
            {(e) => <button classList={{ [styles.picked]: e === emoji() }} onClick={() => setEmoji(e)}>{e}</button>}
          </For>
        </nav>
      </Show>

      <For each={Object.entries(cursors)}>
        {([id, cursor]) => (
          <Show when={member(id)}>
            {(m) => (
              <div class={styles.cursor} style={{ transform: `translate(${cursor.x * innerWidth}px, ${cursor.y * innerHeight}px)` }}>
                <svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l18 8-8 2.5L10 21z" fill={m().color} stroke="#0b1020" stroke-width="1.5" /></svg>
                <span style={{ background: m().color }}>{m().name}</span>
              </div>
            )}
          </Show>
        )}
      </For>

      <For each={reactions()}>
        {(r) => <span class={styles.reaction} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}>{r.emoji}</span>}
      </For>
    </main>
  );
};

export default App;
