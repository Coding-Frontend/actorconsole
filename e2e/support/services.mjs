import { createServer as createHttpServer } from "node:http";
import { createServer as createSmtpServer } from "node:net";

/** Local-only upstream substitutes. Authentication and application APIs stay real. */
export async function startTestServices() {
  const messages = [];
  const requests = [];
  const sockets = new Set();
  const smtp = createSmtpServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP test inbox\r\n");
    let buffer = "";
    let data = null;
    let recipient = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data !== null) {
          if (line !== ".") {
            data.push(line.replace(/^\.\./, "."));
            continue;
          }
          const raw = data
            .join("\n")
            .replace(/=\n/g, "")
            .replace(/=([\dA-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          // Match the rendered OTP element, rather than six-digit CSS colors.
          const code = raw.match(/>\s*(\d{6})\s*<\/span>/)?.[1];
          messages.push({ recipient, code, subject: raw.match(/^Subject: (.+)$/m)?.[1] ?? "" });
          data = null;
          socket.write("250 2.0.0 queued\r\n");
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write("250-localhost\r\n250 8BITMIME\r\n");
        else if (/^RCPT TO:/i.test(line)) {
          recipient = line.match(/<([^>]+)>/)?.[1] ?? "";
          socket.write("250 OK\r\n");
        } else if (/^DATA$/i.test(line)) {
          data = [];
          socket.write("354 End data with <CRLF>.<CRLF>\r\n");
        } else if (/^QUIT$/i.test(line)) socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  const http = createHttpServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "no-store");
    if (url.pathname === "/messages") {
      response.end(
        JSON.stringify(
          messages.filter((message) => message.recipient === url.searchParams.get("email")),
        ),
      );
      return;
    }
    requests.push({ method: request.method, path: url.pathname });
    if (url.pathname === "/v2/users/me") {
      if (request.headers.authorization !== "Bearer apify_api_e2e_local_only_1234567890") {
        response.statusCode = 401;
        response.end(
          JSON.stringify({ error: { type: "invalid-token", message: "Invalid fixture token" } }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          data: {
            id: "e2eApifyUser12345",
            username: "e2e-builder",
            name: "E2E Builder",
            profile: { name: "E2E Builder" },
          },
        }),
      );
      return;
    }
    if (url.pathname === "/v2/actors") {
      response.end(
        JSON.stringify({
          data: { items: [], total: 0, count: 0, offset: 0, limit: 1000, desc: false },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(
      JSON.stringify({
        error: { type: "not-found", message: "Unconfigured test upstream request" },
      }),
    );
  });
  await Promise.all([
    new Promise((resolve, reject) => {
      smtp.once("error", reject);
      smtp.listen(0, "127.0.0.1", resolve);
    }),
    new Promise((resolve, reject) => {
      http.once("error", reject);
      http.listen(0, "127.0.0.1", resolve);
    }),
  ]);
  return {
    smtpPort: smtp.address().port,
    httpUrl: `http://127.0.0.1:${http.address().port}`,
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      http.closeAllConnections();
      await Promise.all([
        new Promise((resolve) => smtp.close(resolve)),
        new Promise((resolve) => http.close(resolve)),
      ]);
    },
  };
}
