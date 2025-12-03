# 🛡️ Minecraft Reverse Proxy UDP (Voice Chat Support)

![NodeJS](https://img.shields.io/badge/Node.js-v14%2B-green?style=for-the-badge&logo=node.js)
![Minecraft](https://img.shields.io/badge/Minecraft-Java%20Edition-lightgrey?style=for-the-badge&logo=minecraft)
![VoiceChat](https://img.shields.io/badge/Support-Simple%20Voice%20Chat-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-Apache%202.0-orange?style=for-the-badge)

**Securely expose your home Minecraft server to the world without port forwarding!**

This project is a lightweight Node.js reverse proxy designed to tunnel both **Minecraft (TCP)** and **Simple Voice Chat (UDP)** traffic from a public VPS to a local server (e.g., Raspberry Pi) behind NAT.

Unlike standard TCP tunnels, this solution encapsulates **UDP traffic**, ensuring full compatibility with proximity voice chat mods while keeping your home IP address hidden.

---

## 🌟 Key Features

- 🚀 **Full TCP Support:** Seamlessly forwards standard Minecraft game traffic (Port 25565).
- 🎙️ **UDP Voice Support:** Tunnels UDP traffic for **Simple Voice Chat** (Port 24454) using a custom "UDP-over-TCP" encapsulation method.
- 🛡️ **Privacy & Security:** Players connect to your VPS IP; your home IP remains hidden. No router port forwarding required.
- 🔌 **Offline MOTD:** Displays a custom, stylish **"Server Offline"** message in the multiplayer server list when your home backend is down, instead of a connection error.
- ⚡ **Lightweight:** Minimal resource usage, optimized for low-end VPS and Raspberry Pi.

---

## 🏗️ Architecture

The system consists of two main components: the **Server (VPS)** and the **Client (Home)**.

```
┌─────────┐                                    ┌──────────────┐
│  Player │ ─── TCP:25565 (Game) ────────────>│  VPS Server  │
│         │ ─── UDP:24454 (Voice) ───────────>│  (server.js) │
└─────────┘                                    └──────┬───────┘
                                                      │
                                          TCP Tunnel  │
                                       (Port 5000/5001)
                                                      │
                                                      v
                                               ┌──────────────┐
                                               │ Home Server  │
                                               │ (client.js)  │
                                               └──────┬───────┘
                                                      │
                                     ┌────────────────┼────────────────┐
                                     │                │                │
                                     v                v                v
                              TCP:25565        UDP:24454      Minecraft Server
```

**Server (server.js):** Runs on the public VPS. It accepts incoming connections, acts as the gateway, and bridges traffic to the tunnel.

**Client (client.js):** Runs on your local machine. It connects to the VPS, establishes the persistent tunnel, and forwards traffic to your local Minecraft server.

---

## ⚙️ Installation Guide

### 1. VPS Setup (Server Side)

Deploy this on your cloud server (Ubuntu/Debian recommended).

**Install Node.js & PM2:**

```bash
sudo apt update && sudo apt install nodejs npm -y
sudo npm install -g pm2
```

**Upload the Server File:**
Upload the `server.js` file to your VPS.

**Configure Firewall (Important):**
You must open the following ports on your VPS firewall (UFW, AWS Security Groups, etc.):

```bash
ufw allow 25565/tcp  # Game Port
ufw allow 24454/udp  # Voice Chat Port (Must be UDP)
ufw allow 5000/tcp   # Game Bridge Tunnel
ufw allow 5001/tcp   # Voice Bridge Tunnel
```

**Start the Server:**

```bash
pm2 start server.js --name "mc-proxy-server"
pm2 save
```

---

### 2. Home Server / Raspberry Pi (Client Side)

Deploy this on the machine running your Minecraft Server.

**Install Node.js & PM2:**
(Same commands as above if not already installed).

**Configure the Client:**
Open `client.js` in a text editor. Find the configuration section and replace `YOUR_VPS_PUBLIC_IP_HERE` with your actual VPS IP address.

```javascript
// client.js
const VPS_IP = '123.45.67.89'; // <-- Put your VPS IP here
```

**Start the Client:**

```bash
pm2 start client.js --name "mc-proxy-client"
pm2 save
```

---

## 🎙️ Simple Voice Chat Configuration

For the voice chat to work correctly through the tunnel, you must configure the mod on your Minecraft Server.

Edit `config/voicechat/voicechat-server.properties` on your Minecraft server:

```properties
port=24454
voice_host=your-vps-domain.com
```

**Note:** Replace `your-vps-domain.com` with your VPS IP or Domain. If you leave `voice_host` empty, players will connect to the game but will not be able to hear each other.

---

## 🎨 Customization (Offline MOTD)

You can change the "Server Offline" message that appears in the server list when your home server is disconnected.

Edit the `server.js` file around line 65:

```javascript
description: {
    text: "Server Is Offline",
    color: "red",
    bold: true,
    extra: [
        { text: "\n" },
        { text: "View YOUR_DOMAIN_HERE", color: "dark_purple", bold: true }
    ]
}
```

---

## 🛠️ Troubleshooting

| Issue | Possible Solution |
|-------|------------------|
| Connected to game, but Voice Chat icon is disconnected | Ensure port 24454 is open as **UDP** on your VPS firewall. TCP is not enough for voice. |
| Connection Refused | Check if `VPS_IP` in `client.js` is correct and `server.js` is running on the VPS. |
| "Server Offline" MOTD is shown, but server is running | The `client.js` on your home server might be stopped. Check with `pm2 status`. |

---

## 📄 License

Copyright © 2025 LogicByte Limited.  
Licensed under the Apache License 2.0.

---

<p align="center">
<sub>Made with ❤️ by LogicByte Dev Services</sub>
</p>
