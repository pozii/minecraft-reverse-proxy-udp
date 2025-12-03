/*
 * Copyright 2025 LogicByte Dev Services
 * Licensed under the Apache License, Version 2.0
 */

const net = require('net');
const dgram = require('dgram');

// CONFIGURATION
const BRIDGE_PORT = 5000;       // Internal TCP Tunnel Port
const VOICE_BRIDGE_PORT = 5001; // Internal Voice Tunnel Port
const PUBLIC_GAME_PORT = 25565; // Public Minecraft Port
const PUBLIC_VOICE_PORT = 24454;// Public Simple Voice Chat Port (UDP)

let controlSocket = null;
const pendingConnections = new Map();

function writeVarInt(value) {
    const bytes = [];
    while (true) {
        if ((value & ~0x7F) === 0) {
            bytes.push(value);
            return Buffer.from(bytes);
        }
        bytes.push((value & 0x7F) | 0x80);
        value >>>= 7;
    }
}

function writeString(val) {
    const buf = Buffer.from(val, 'utf8');
    return Buffer.concat([writeVarInt(buf.length), buf]);
}

function createPacket(id, data) {
    const idBuf = writeVarInt(id);
    const lenBuf = writeVarInt(idBuf.length + data.length);
    return Buffer.concat([lenBuf, idBuf, data]);
}

function readVarInt(buffer, offset) {
    let value = 0;
    let length = 0;
    let currentByte;

    while (true) {
        if (offset + length >= buffer.length) return null;
        currentByte = buffer[offset + length];
        value |= (currentByte & 0x7F) << (length * 7);
        length++;
        if ((currentByte & 0x80) === 0) break;
        if (length > 5) return null;
    }
    return { value, length };
}

function sendOfflineResponse(socket) {
    const motd = JSON.stringify({
        version: {
            name: "§4Offline",
            protocol: -1
        },
        players: {
            max: 0,
            online: 0
        },
        description: {
            text: "Server Is Offline",
            color: "red",
            bold: true,
            extra: [
                { text: "\n" },
                { text: "View YOUR_DOMAIN_HERE", color: "dark_purple", bold: true }
            ]
        }
    });

    const data = writeString(motd);
    const packet = createPacket(0x00, data);
    socket.write(packet);
}

const bridgeServer = net.createServer((socket) => {
    socket.once('data', (data) => {
        const msg = data.toString().trim();
        if (msg === 'AUTH_CONTROL') {
            console.log('[Game] Bridge connected.');
            controlSocket = socket;
            socket.on('close', () => { 
                console.log('[Game] Bridge disconnected! Switching to offline mode.');
                controlSocket = null; 
            });
            socket.on('error', (err) => console.error('[Game Error]', err.message));
        } else if (msg.startsWith('TUNNEL_FOR:')) {
            const connectionId = msg.split(':')[1];
            const playerSocket = pendingConnections.get(connectionId);
            if (playerSocket) {
                playerSocket.pipe(socket).pipe(playerSocket);
                pendingConnections.delete(connectionId);
            } else { socket.end(); }
        }
    });
});

const publicGameServer = net.createServer((playerSocket) => {
    if (!controlSocket) {
        let buffer = Buffer.alloc(0);
        let state = 0;

        playerSocket.on('data', (chunk) => {
            if (controlSocket) return;
            
            buffer = Buffer.concat([buffer, chunk]);

            while (true) {
                const lenResult = readVarInt(buffer, 0);
                if (!lenResult) return;

                const packetLen = lenResult.value;
                const headerLen = lenResult.length;

                if (buffer.length < headerLen + packetLen) return;

                const packetData = buffer.slice(headerLen, headerLen + packetLen);
                buffer = buffer.slice(headerLen + packetLen);

                const idResult = readVarInt(packetData, 0);
                if (!idResult) continue;
                const packetId = idResult.value;

                if (state === 0) {
                    if (packetId === 0x00) {
                        state = 1; 
                    }
                } else if (state === 1) {
                    if (packetId === 0x00) {
                        sendOfflineResponse(playerSocket);
                    } else if (packetId === 0x01) {
                        const payload = packetData.slice(idResult.length);
                        const pongPacket = createPacket(0x01, payload);
                        playerSocket.write(pongPacket);
                    }
                }
            }
        });

        playerSocket.on('error', () => {});
        return;
    }

    const connectionId = Date.now() + Math.random().toString(36).substr(2, 9);
    pendingConnections.set(connectionId, playerSocket);
    controlSocket.write(`CREATE_TUNNEL:${connectionId}`);
    
    playerSocket.on('close', () => pendingConnections.delete(connectionId));
    playerSocket.on('error', () => pendingConnections.delete(connectionId));
});

let voiceBridgeSocket = null;
const udpServer = dgram.createSocket('udp4');

const voiceBridgeServer = net.createServer((socket) => {
    console.log('[Voice] Bridge connected.');
    voiceBridgeSocket = socket;

    let buffer = '';
    socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                const packet = Buffer.from(msg.data, 'base64');
                udpServer.send(packet, msg.port, msg.ip, (err) => {
                    if (err) console.error('[Voice] Send error:', err);
                });
            } catch (e) { }
        }
    });

    socket.on('close', () => { 
        console.log('[Voice] Bridge disconnected.'); 
        voiceBridgeSocket = null; 
    });
    socket.on('error', () => {});
});

udpServer.on('message', (msg, rinfo) => {
    if (!voiceBridgeSocket) return;
    const payload = JSON.stringify({
        ip: rinfo.address,
        port: rinfo.port,
        data: msg.toString('base64')
    }) + '\n';
    voiceBridgeSocket.write(payload);
});

udpServer.on('listening', () => console.log(`[Info] Voice Server (UDP) listening on ${PUBLIC_VOICE_PORT}...`));

bridgeServer.listen(BRIDGE_PORT, () => console.log(`[Info] Game Bridge ready on ${BRIDGE_PORT}.`));
voiceBridgeServer.listen(VOICE_BRIDGE_PORT, () => console.log(`[Info] Voice Bridge ready on ${VOICE_BRIDGE_PORT}.`));
publicGameServer.listen(PUBLIC_GAME_PORT, () => console.log(`[Info] Minecraft Server ready on ${PUBLIC_GAME_PORT}.`));
udpServer.bind(PUBLIC_VOICE_PORT);
