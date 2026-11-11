
// Servidor de salas para el Modo Carrera.
// Uso: npm i ws && node server.js

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const MAX = 8;
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const PUBLIC_DIR = path.join(__dirname, "public");

// ========================================
// SERVIDOR WEB: HTML, IMÁGENES, CSS Y JS
// ========================================

const server = http.createServer((req, res) => {
  let requestedPath;

  try {
    requestedPath = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname
    );
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }

  if (requestedPath === "/") {
    requestedPath = "/index.html";
  }

  const filePath = path.resolve(
    PUBLIC_DIR,
    "." + requestedPath
  );

  // Evitar acceder a archivos fuera de public
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon"
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Archivo no encontrado");
    }

    const ext = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      "Content-Type":
        mimeTypes[ext] || "application/octet-stream"
    });

    res.end(data);
  });
});

// ========================================
// SISTEMA MULTIJUGADOR WEBSOCKET
// ========================================

const wss = new WebSocketServer({
  server,
  path: "/ws"
});

const rooms = new Map();
let nid = 1;

const send = (ws, o) => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(o));
  }
};

wss.on("connection", ws => {
  ws.id = "P" + nid++;
  ws.alive = true;

  ws.on("pong", () => {
    ws.alive = true;
  });

  ws.on("message", raw => {
    let m;

    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    // CREAR SALA
    if (m.type === "create") {
      let c;

      do {
        c = Array.from(
          { length: 6 },
          () => CH[Math.random() * CH.length | 0]
        ).join("");
      } while (rooms.has(c));

      rooms.set(c, {
        host: ws,
        peers: new Map([[ws.id, ws]])
      });

      ws.room = c;

      send(ws, {
        type: "created",
        code: c,
        id: ws.id
      });

    // UNIRSE A UNA SALA
    } else if (m.type === "join") {
      const code = String(m.code || "").toUpperCase();
      const r = rooms.get(code);

      if (!r) {
        return send(ws, {
          type: "error",
          error: "NOT_FOUND"
        });
      }

      if (r.peers.size >= MAX) {
        return send(ws, {
          type: "error",
          error: "FULL"
        });
      }

      r.peers.set(ws.id, ws);
      ws.room = code;

      send(ws, {
        type: "joined",
        id: ws.id,
        hostId: r.host.id
      });

      send(r.host, {
        type: "peer_join",
        id: ws.id
      });

    // TRANSMITIR MENSAJES
    } else if (m.type === "relay") {
      const r = rooms.get(ws.room);

      if (!r) return;

      const out = {
        type: "msg",
        from: ws.id,
        data: m.data
      };

      if (m.to === "host") {
        if (ws !== r.host) {
          send(r.host, out);
        }

      } else if (m.to === "all") {
        r.peers.forEach(p => {
          if (p !== ws) {
            send(p, out);
          }
        });

      } else {
        send(r.peers.get(m.to), out);
      }
    }
  });

  // DESCONECTAR JUGADORES
  ws.on("close", () => {
    const r = rooms.get(ws.room);

    if (!r) return;

    if (r.host === ws) {
      r.peers.forEach(p => {
        if (p !== ws) {
          send(p, {
            type: "closed",
            reason: "HOST_LEFT"
          });
        }
      });

      rooms.delete(ws.room);

    } else {
      r.peers.delete(ws.id);

      send(r.host, {
        type: "peer_leave",
        id: ws.id
      });
    }
  });
});

// ========================================
// COMPROBACIÓN DE CONEXIONES
// ========================================

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.alive) {
      return ws.terminate();
    }

    ws.alive = false;
    ws.ping();
  });
}, 30000);

// ========================================
// INICIAR SERVIDOR
// ========================================

server.listen(PORT, () => {
  console.log("Servidor iniciado en el puerto " + PORT);
});
