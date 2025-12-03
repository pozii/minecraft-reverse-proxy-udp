/*
 * Copyright 2025 LogicByte Dev Services
 * Licensed under the Apache License, Version 2.0
 */

const net = require('net');
const dgram = require('dgram');

// --- CONFIGURATION ---
const VPS_IP = 'YOUR_VPS_PUBLIC_IP_HERE'; // CHANGE THIS to your VPS IP address
const VPS_BRIDGE_PORT = 5000;
const VPS_VOICE_BRIDGE_PORT = 5001;
const LOCAL_MC_HOST = '127.0.0.1';
const LOCAL_MC_PORT = 25565;
const LOCAL_VOICE_PORT = 24454;

function connectGameControl() {
    const controlClient = new net.Socket();
    
    controlClient.on('error', (err) => {
        console.error('[Game Error] Connection failed:', err.message);
    });

    controlClient.connect(VPS_BRIDGE_PORT, VPS_IP, () => {
        console.log('[Game] Connected to VPS control channel.');
        controlClient.write('AUTH_CONTROL');
    });

    controlClient.on('data', (data) => {
        const msg = data.toString();
        if (msg.startsWith('CREATE_TUNNEL:')) {
            createGameTunnel(msg.split(':')[1]);
        }
    });

    controlClient.on('close', () => {
        console.log('[Game] Disconnected. Retrying in 5s...');
        setTimeout(connectGameControl, 5000);
    });
}

function createGameTunnel(connectionId) {
    const localMc = new net.Socket();
    
    localMc.on('error', (err) => {});

    localMc.connect(LOCAL_MC_PORT, LOCAL_MC_HOST, () => {
        const tunnelClient = new net.Socket();
        
        tunnelClient.connect(VPS_BRIDGE_PORT, VPS_IP, () => {
            tunnelClient.write(`TUNNEL_FOR:${connectionId}`);
            tunnelClient.pipe(localMc).pipe(tunnelClient);
        });

        tunnelClient.on('error', () => localMc.destroy());
    });
}

const playerSockets = new Map();

function connectVoiceBridge() {
    const bridge = new net.Socket();
    console.log('[Voice] Connecting to VPS voice bridge...');

    bridge.connect(VPS_VOICE_BRIDGE_PORT, VPS_IP, () => {
        console.log('[Voice] Connected.');
    });

    let buffer = '';
    bridge.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                const playerId = `${msg.ip}:${msg.port}`;
                const packet = Buffer.from(msg.data, 'base64');

                handleVoicePacket(bridge, playerId, msg.ip, msg.port, packet);
            } catch (e) { console.error('[Voice] Packet error:', e.message); }
        }
    });

    bridge.on('close', () => {
        console.log('[Voice] Disconnected. Retrying in 5s...');
        setTimeout(connectVoiceBridge, 5000);
        playerSockets.forEach(s => s.close());
        playerSockets.clear();
    });

    bridge.on('error', (err) => console.error('[Voice Error]', err.message));
}

function handleVoicePacket(bridgeSocket, playerId, originalIp, originalPort, packet) {
    let udpSocket = playerSockets.get(playerId);

    if (!udpSocket) {
        udpSocket = dgram.createSocket('udp4');
        playerSockets.set(playerId, udpSocket);

        udpSocket.on('message', (msg) => {
            if (!bridgeSocket.writable) return;
            
            const payload = JSON.stringify({
                ip: originalIp,
                port: originalPort,
                data: msg.toString('base64')
            }) + '\n';
            
            bridgeSocket.write(payload);
        });

        udpSocket.on('error', () => playerSockets.delete(playerId));
        udpSocket.on('close', () => playerSockets.delete(playerId));
    }

    udpSocket.send(packet, LOCAL_VOICE_PORT, LOCAL_MC_HOST);
}

connectGameControl();
connectVoiceBridge();
