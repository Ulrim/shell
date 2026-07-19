const { createClient } = require("redis");

// Lazily connect once per warm serverless instance and reuse the TCP
// connection across invocations, instead of reconnecting on every request.
let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => console.error("Redis Client Error", err));
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

module.exports = { getClient };
