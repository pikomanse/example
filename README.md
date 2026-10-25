# Pikoman example

![Live cursors with Pikoman](docs/screenshot.png)

Live cursors, reactions and who's online, on [Pikoman](https://pikoman.se) in one small
[Solid](https://solidjs.com) page and a 140-line backend.

- **Live cursors**: everyone's pointer, with their name and colour, as they move.
- **Emoji reactions**: click anywhere and everyone sees it float up.
- **Who's online**: a presence channel, `presence-lobby`, keeps the list. Joining needs a token
  signed by your backend; `server.mjs` is that backend, with no dependencies.
- **A banner from your backend**: one request to the public channel `main-channel` shows up on every
  open page at once.

## Setup

1. Create an app in the [dashboard](https://pikoman.se/dashboard/) and let it generate the keys.
   You get the app id, an API key and a private key; the private key is shown only once.
2. Put the app id in `.env.local`:

   ```bash
   cp .env.example .env.local   # VITE_PIKOMAN_APP=app-yourapp
   npm install
   ```

3. Start the token server with the private key (it never goes in the page), and the page:

   ```bash
   PIKOMAN_PRIVATE_KEY=... npm run server   # http://localhost:3001
   npm run dev                              # http://localhost:3000
   ```

   On Windows PowerShell: `$env:PIKOMAN_PRIVATE_KEY = "..."; npm run server`.

## Publish from your backend

Messages to a channel are sent over HTTP, signed with the app's API key. The key itself never goes
over the wire: each request carries a token signed for that one request, which `@pikoman/ws`
(1.0.0-rc.7 or later) makes for you. Keep the key on the server, never in the page:

```bash
export PIKOMAN_APP=app-yourapp PIKOMAN_API_KEY=sk_...
node --input-type=module -e '
  import { publish } from "@pikoman/ws/dist/server.js";
  await publish("main-channel", "announcement", { message: "Deploy finished: v2.4 is live" });'
```

Every open page shows the banner at once. From another language, sign the token yourself: an
EdDSA JWT with the key id as `kid`, and `iss` (the app id), `iat`, `exp` (`iat` + 60), `htm`
(`POST`), `htu` (`/main-channel/announcement`) and `bh` (SHA-256 of the exact body, base64url),
sent as `Authorization: Bearer <jwt>`. Make a new one for every request. The details are in the
[Protocol 2.0](https://pikoman.se/docs/v2/) docs.

## Join tokens

`server.mjs` signs a JWT with EdDSA (Ed25519) for one connection and one channel:
`connection`, `channel`, `access` (3: may send and sees the members; 0: listens only), `data`
(what the others see about you) and `exp` (at most 10 minutes ahead). It answers only a signed-in
user, only for the channels `accessFor` gives that user, and takes the member data from the login,
never from the request. Its login is a stand-in that lets anyone in by name: put your own where
the comment says. Messages between the members are client events, named `client-…`. More, with PHP and other
languages: the [quickstart](https://pikoman.se/docs/#token) and [Protocol 2.0](https://pikoman.se/docs/v2/).

While 2.0 runs next to 1.x, the client connects to `wss://next.pikoman.se` and publishing goes to
`https://next-api.pikoman.se`; they move to `ws.` and `api.pikoman.se` with `@pikoman/ws` 1.0.0.

## License

MIT
