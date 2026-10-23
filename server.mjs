// The backend half of the example: signs Pikoman join tokens. The private key stays here, never in
// the page. No dependencies, Node 20 or later:
//
//   PIKOMAN_PRIVATE_KEY=... node server.mjs
//
// GET /pikoman/auth?client={connection id}&channel={channel}&name={display name}
//   -> {"token": "<JWT>"}
//
// A real backend takes the name (and whether to let someone in at all) from its own login.
import { createServer } from "node:http";
import { createPrivateKey, sign } from "node:crypto";

const PORT = 3001;
/** The channels this backend lets people into. */
const ALLOWED_CHANNELS = ["presence-lobby"];
/** Seconds a token is good for; Pikoman accepts at most 600. */
const LIFETIME = 300;
/** 3 = a full member: may send to the channel and sees who else is in it. */
const ACCESS = 3;

const keyText = process.env.PIKOMAN_PRIVATE_KEY?.trim();
if (!keyText) {
  console.error("Set PIKOMAN_PRIVATE_KEY to the app's private key from the dashboard.");
  process.exit(1);
}
// The dashboard shows the key as one line of base64 (PKCS#8); a PEM works too.
const signingKey = keyText.startsWith("-----")
  ? createPrivateKey(keyText)
  : createPrivateKey({ key: Buffer.from(keyText, "base64"), format: "der", type: "pkcs8" });

/** Each visitor's cursor colour, picked here so everyone sees the same one. */
const COLORS = ["#ff7eb6", "#ffd84d", "#7ee787", "#79c0ff", "#d2a8ff", "#ffa657"];
const colorFor = (connection) => COLORS[parseInt(connection.slice(-6), 36) % COLORS.length];

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A JWT signed with EdDSA, for one connection and one channel. */
function pikomanToken({ connection, channel, data }) {
  const signed = `${base64url({ alg: "EdDSA", typ: "JWT" })}.${base64url({
    connection,
    channel,
    access: ACCESS,
    data,
    exp: Math.floor(Date.now() / 1000) + LIFETIME,
  })}`;
  return `${signed}.${sign(null, Buffer.from(signed), signingKey).toString("base64url")}`;
}

function answer(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (request.method !== "GET" || url.pathname !== "/pikoman/auth") {
    return answer(response, 404, { error: "Not found" });
  }
  const connection = url.searchParams.get("client") ?? "";
  const channel = url.searchParams.get("channel") ?? "";
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 32) || "Guest";
  if (!/^c_[A-Za-z0-9_-]{1,64}$/.test(connection)) {
    return answer(response, 400, { error: "client must be the connection id" });
  }
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return answer(response, 403, { error: "Not allowed into that channel" });
  }
  answer(response, 200, { token: pikomanToken({ connection, channel, data: { name, color: colorFor(connection) } }) });
}).listen(PORT, () => console.log(`Signing join tokens on http://localhost:${PORT}`));
