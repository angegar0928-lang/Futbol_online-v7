const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let ball = { x: 1500, y: 850, vx: 0, vy: 0 };

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 800 + 400,
        y: Math.random() * 600 + 400,
        team: Object.keys(players).length % 2 === 0 ? 0 : 1
    };

    socket.emit('init', { id: socket.id, players, ball });

    socket.on('update_pos', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player_left', socket.id);
    });
});

setInterval(() => {
    io.emit('state', { players, ball });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
