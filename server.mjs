// The backend half of the example: signs Pikoman join tokens. The private key stays here, never in
// the page. No dependencies, Node 20 or later:
//
//   PIKOMAN_PRIVATE_KEY=... node server.mjs
//
// POST /pikoman/login {"name": "Anna"}             -> a session cookie for 12 hours (a stand-in for your login)
// GET  /pikoman/auth?client={connection id}&channel={channel}
//   -> {"token": "<JWT>"}, for a signed-in user, into a channel that user may join
import { createServer } from "node:http";
import { createPrivateKey, randomBytes, sign } from "node:crypto";

const PORT = 3001;
/** Seconds a token is good for; Pikoman accepts at most 600. */
const LIFETIME = 300;

const keyText = process.env.PIKOMAN_PRIVATE_KEY?.trim();
if (!keyText) {
  console.error("Set PIKOMAN_PRIVATE_KEY to the app's private key from the dashboard.");
  process.exit(1);
}
// The dashboard shows the key as one line of base64 (PKCS#8); a PEM works too.
const signingKey = keyText.startsWith("-----")
  ? createPrivateKey(keyText)
  : createPrivateKey({ key: Buffer.from(keyText, "base64"), format: "der", type: "pkcs8" });

// ---- Your login goes here ---------------------------------------------------------------------
// This demo signs anyone in by name and keeps sessions in memory. In your app, find the user from
// your own session (cookie, framework, auth provider) instead, and never trust a name or a user id
// that the page sends along with the token request.
const sessions = new Map(); // session id -> { id, name, canWrite, expires }
/** A sign-in lasts 12 hours. */
const SESSION_SECONDS = 12 * 60 * 60;

/** The signed-in user, or undefined. */
function currentUser(request) {
  const sid = /(?:^|;\s*)sid=([\w-]+)/.exec(request.headers.cookie ?? "")?.[1];
  const session = sid ? sessions.get(sid) : undefined;
  return session && session.expires > Date.now() ? session : undefined;
}

function logIn(response, name) {
  // Sessions are kept in the order they began, so the ones that have run out come first.
  for (const [sid, session] of sessions) {
    if (session.expires > Date.now()) break;
    sessions.delete(sid);
  }
  const sid = randomBytes(32).toString("base64url");
  // canWrite: whether this user may send (cursors and reactions). The demo lets everyone; your app
  // decides per user, and a user who may not gets a token that only listens.
  const expires = Date.now() + SESSION_SECONDS * 1000;
  sessions.set(sid, { id: randomBytes(8).toString("hex"), name, canWrite: true, expires });
  // Secure here too: browsers keep a Secure cookie from http://localhost, which they count as secure.
  response.setHeader(
    "set-cookie",
    `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/pikoman; Max-Age=${SESSION_SECONDS}`,
  );
  answer(response, 200, { name });
}
// ------------------------------------------------------------------------------------------------

/**
 * Which channels a user may join, and with what access: 3 to send client events and see the
 * members, 0 to listen. undefined: not at all. Anything not listed here is refused.
 */
function accessFor(user, channel) {
  if (channel === "presence-lobby") return user.canWrite ? 3 : 0;
  if (channel === `private-user-${user.id}`) return 0; // each user's own channel, listen only
  return undefined;
}

/** Each visitor's cursor colour, picked here so everyone sees the same one. */
const COLORS = ["#ff7eb6", "#ffd84d", "#7ee787", "#79c0ff", "#d2a8ff", "#ffa657"];
const colorFor = (userId) => COLORS[parseInt(userId.slice(-6), 16) % COLORS.length];

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A JWT signed with EdDSA, for one connection and one channel. */
function pikomanToken({ connection, channel, access, data }) {
  const signed = `${base64url({ alg: "EdDSA", typ: "JWT" })}.${base64url({
    connection,
    channel,
    access,
    data,
    exp: Math.floor(Date.now() / 1000) + LIFETIME,
  })}`;
  return `${signed}.${sign(null, Buffer.from(signed), signingKey).toString("base64url")}`;
}

function answer(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1024) throw new Error("too large");
  }
  return JSON.parse(text);
}

createServer(async (request, response) => {
  let url;
  try {
    url = new URL(request.url, "http://localhost");
  } catch {
    // A target such as "//" is no URL. Thrown here, it would end the process.
    return answer(response, 400, { error: "Bad request" });
  }

  if (request.method === "POST" && url.pathname === "/pikoman/login") {
    const body = await readJson(request).catch(() => undefined);
    const name = String(body?.name ?? "").trim().slice(0, 32);
    return name ? logIn(response, name) : answer(response, 400, { error: "A name, please" });
  }

  if (request.method !== "GET" || url.pathname !== "/pikoman/auth") {
    return answer(response, 404, { error: "Not found" });
  }
  const user = currentUser(request);
  if (!user) {
    return answer(response, 401, { error: "Sign in first" });
  }
  const connection = url.searchParams.get("client") ?? "";
  const channel = url.searchParams.get("channel") ?? "";
  if (!/^c_[A-Za-z0-9_-]{1,64}$/.test(connection)) {
    return answer(response, 400, { error: "client must be the connection id" });
  }
  const access = accessFor(user, channel);
  if (access === undefined) {
    return answer(response, 403, { error: "Not allowed into that channel" });
  }
  // What the other members see: from the login, never from the request.
  const data = { name: user.name, color: colorFor(user.id) };
  answer(response, 200, { token: pikomanToken({ connection, channel, access, data }) });
}).listen(PORT, () => console.log(`Signing join tokens on http://localhost:${PORT}`));
