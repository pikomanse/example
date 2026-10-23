import { type Component, createSignal, For, onCleanup, Show } from 'solid-js';
import Pikoman from '@pikoman/ws';

import styles from './App.module.css';

type Member = { name: string };
type Message = { from: string; text: string };

const pikoman = new Pikoman(import.meta.env.VITE_PIKOMAN_APP);

/** Asks our own backend (server.mjs) for a join token. */
const authenticator = (name: string) => ({
  async authenticate(clientId: string, channel: string): Promise<string> {
    const query = new URLSearchParams({ client: clientId, channel, name });
    const response = await fetch(`/pikoman/auth?${query}`);
    if (!response.ok) throw new Error(`No join token (${response.status})`);
    return (await response.json()).token;
  },
});

const App: Component = () => {
  // 1. A public channel: anyone with the app id may listen. Your backend publishes to it with the
  //    API key (see the curl in the README).
  const [lastMessage, setLastMessage] = createSignal('');
  const news = pikoman.listen('main-channel');
  news.on('latest-notification', (data: { message: string }) => setLastMessage(data.message));
  onCleanup(() => pikoman.leaveChannel('main-channel'));

  // 2. A presence channel: only with a token from your backend, and everyone sees who is in it.
  const [name, setName] = createSignal('');
  const [joined, setJoined] = createSignal(false);
  const [members, setMembers] = createSignal<[string, Member][]>([]);
  const [messages, setMessages] = createSignal<Message[]>([]);
  let room: ReturnType<typeof pikoman.listenPresence> | undefined;

  const join = (event: SubmitEvent) => {
    event.preventDefault();
    room = pikoman.listenPresence('presence-lobby', authenticator(name()));
    room.members((list: Map<string, Member>) => setMembers([...list]));
    room.on('message', (from: string, data: { text: string }) => {
      const sender = room?.getMember(from)?.name ?? 'Someone';
      setMessages((all) => [...all, { from: sender, text: data.text }]);
    });
    setJoined(true);
  };

  const send = (event: SubmitEvent) => {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).elements.namedItem('text') as HTMLInputElement;
    const text = input.value.trim();
    if (text) room?.send('message', { text }, true);
    input.value = '';
  };

  return (
    <main class={styles.App}>
      <h1>Pikoman example</h1>

      <section>
        <h2>Public channel</h2>
        <p>Last message on <code>main-channel</code>: {lastMessage() || '(none yet)'}</p>
      </section>

      <section>
        <h2>Presence channel</h2>
        <Show
          when={joined()}
          fallback={
            <form onSubmit={join}>
              <input placeholder="Your name" value={name()} onInput={(e) => setName(e.currentTarget.value)} required />
              <button>Join the lobby</button>
            </form>
          }
        >
          <p>Online: {members().map(([, member]) => member.name).join(', ') || '…'}</p>
          <ul>
            <For each={messages()}>{(message) => <li><b>{message.from}:</b> {message.text}</li>}</For>
          </ul>
          <form onSubmit={send}>
            <input name="text" placeholder="Say something" autocomplete="off" />
            <button>Send</button>
          </form>
        </Show>
      </section>
    </main>
  );
};

export default App;
