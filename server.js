const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    socket.on('create', (data) => {
        let code = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[code] = { host: socket.id, players: [{ id: socket.id, name: 'Anfitrión' }] };
        socket.join(code);
        socket.emit('created', { id: socket.id, code });
    });

    socket.on('join', (data) => {
        let code = data.code ? data.code.toUpperCase() : '';
        if (rooms[code]) {
            socket.join(code);
            rooms[code].players.push({ id: socket.id, name: 'Jugador' });
            let hostId = rooms[code].host;
            socket.emit('joined', { id: socket.id, hostId });
            io.to(hostId).emit('peer_join', { id: socket.id });
        } else {
            socket.emit('error', { error: 'NOT_FOUND' });
        }
    });

    socket.on('relay', (data) => {
        if (data.to === 'host') {
            for (let code in rooms) {
                if (rooms[code].host === socket.id || rooms[code].players.some(p => p.id === socket.id)) {
                    io.to(rooms[code].host).emit('msg', { from: socket.id, data: data.data });
                    break;
                }
            }
        } else if (data.to === 'all') {
            for (let code in rooms) {
                if (rooms[code].host === socket.id || rooms[code].players.some(p => p.id === socket.id)) {
                    io.to(code).emit('msg', { from: socket.id, data: data.data });
                    break;
                }
            }
        } else {
            io.to(data.to).emit('msg', { from: socket.id, data: data.data });
        }
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
        for (let code in rooms) {
            if (rooms[code].host === socket.id) {
                io.to(code).emit('closed', { reason: 'HOST_LEFT' });
                delete rooms[code];
            } else {
                let idx = rooms[code].players.findIndex(p => p.id === socket.id);
                if (idx !== -1) {
                    rooms[code].players.splice(idx, 1);
                    io.to(rooms[code].host).emit('peer_leave', { id: socket.id });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
