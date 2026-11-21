#!/usr/bin/env python3
"""Street Racing 3D — Wi-Fi multiplayer server.

Runs on any computer on the same Wi-Fi (Python 3.8+, standard library only).
It serves the game itself AND relays multiplayer messages over WebSocket, so:

  * laptops / phone browsers just open  http://<this-computer-ip>:8080
  * the Android / iOS app enters        <this-computer-ip>:8080  in MULTIPLAYER

Usage:
    python3 server/mp_server.py            # port 8080
    python3 server/mp_server.py --port 9000
"""
import argparse
import asyncio
import base64
import hashlib
import json
import os
import random
import socket
import struct
import time
import urllib.parse

WWW = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www'))
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
}
MAX_PLAYERS = 8


# ----------------------------------------------------------------- WebSocket framing
async def ws_read(reader):
    """Read one complete message. Returns (opcode, payload bytes)."""
    message, first_opcode = b'', None
    while True:
        b1, b2 = await reader.readexactly(2)
        fin, opcode = b1 & 0x80, b1 & 0x0F
        masked, length = b2 & 0x80, b2 & 0x7F
        if length == 126:
            length = struct.unpack('>H', await reader.readexactly(2))[0]
        elif length == 127:
            length = struct.unpack('>Q', await reader.readexactly(8))[0]
        if length > 1 << 20:
            raise ConnectionError('frame too large')
        mask = await reader.readexactly(4) if masked else b'\0\0\0\0'
        data = bytearray(await reader.readexactly(length))
        for i in range(length):
            data[i] ^= mask[i & 3]
        if opcode >= 0x8:                      # control frames are never fragmented
            return opcode, bytes(data)
        if first_opcode is None:
            first_opcode = opcode
        message += data
        if fin:
            return first_opcode, message


def ws_frame(opcode, payload):
    n = len(payload)
    if n < 126:
        header = struct.pack('>BB', 0x80 | opcode, n)
    elif n < 65536:
        header = struct.pack('>BBH', 0x80 | opcode, 126, n)
    else:
        header = struct.pack('>BBQ', 0x80 | opcode, 127, n)
    return header + payload


# ----------------------------------------------------------------- game room
class Player:
    def __init__(self, pid, writer):
        self.id, self.writer = pid, writer
        self.name, self.car = 'Player', 0
        self.joined = False
        self.lock = asyncio.Lock()

    async def send(self, obj):
        data = ws_frame(0x1, json.dumps(obj, separators=(',', ':')).encode())
        try:
            async with self.lock:
                self.writer.write(data)
                await self.writer.drain()
        except (ConnectionError, RuntimeError):
            pass


class Room:
    def __init__(self):
        self.players = {}
        self.next_id = 1
        self.host_id = None
        self.phase = 'lobby'        # lobby | racing | driving
        self.mode = 'race'          # race | free
        self.distance = 3000
        self.finishers = []
        self.started_at = 0.0

    def lobby(self):
        return {
            't': 'lobby', 'hostId': self.host_id, 'phase': self.phase, 'mode': self.mode,
            'distance': self.distance,
            'players': [{'id': p.id, 'name': p.name, 'car': p.car} for p in self.players.values() if p.joined],
        }

    async def broadcast(self, obj, exclude=None):
        await asyncio.gather(*(p.send(obj) for p in list(self.players.values()) if p.joined and p is not exclude))

    def add(self, writer):
        p = Player(self.next_id, writer)
        self.next_id += 1
        self.players[p.id] = p
        return p

    async def remove(self, p):
        self.players.pop(p.id, None)
        if not p.joined:
            return
        print(f'  - {p.name} left')
        if self.host_id == p.id:
            joined = [q for q in self.players.values() if q.joined]
            self.host_id = joined[0].id if joined else None
        await self.broadcast({'t': 'left', 'id': p.id})
        if not any(q.joined for q in self.players.values()):
            self.phase = 'lobby'
        await self.check_race_done()
        await self.broadcast(self.lobby())

    def start_msg(self):
        return {'t': 'start', 'mode': self.mode, 'distance': self.distance, 'seed': random.randint(1, 2**31 - 1),
                'order': [q.id for q in self.players.values() if q.joined]}

    async def check_race_done(self):
        if self.phase != 'racing':
            return
        racers = [q for q in self.players.values() if q.joined]
        done = {f['id'] for f in self.finishers}
        if racers and all(q.id in done for q in racers):
            await self.end_race()

    async def end_race(self):
        self.phase = 'lobby'
        await self.broadcast({'t': 'results', 'mode': self.mode, 'list': self.finishers})
        await self.broadcast(self.lobby())

    async def on_message(self, p, m):
        t = m.get('t')
        if t == 'hello':
            if sum(1 for q in self.players.values() if q.joined) >= MAX_PLAYERS:
                await p.send({'t': 'error', 'message': 'Room is full'})
                return
            p.name = (str(m.get('name') or 'Player').strip() or 'Player')[:16]
            p.car = int(m.get('car') or 0)
            p.joined = True
            if self.host_id is None:
                self.host_id = p.id
            print(f'  + {p.name} joined (car {p.car})')
            await p.send({'t': 'welcome', 'id': p.id, 'hostId': self.host_id})
            await self.broadcast(self.lobby())
            if self.phase == 'driving':                 # free drive is open: hop straight in
                await p.send(self.start_msg())
        elif not p.joined:
            return
        elif t == 'car':
            p.car = int(m.get('car') or 0)
            await self.broadcast(self.lobby())
        elif t == 'config' and p.id == self.host_id and self.phase == 'lobby':
            if m.get('mode') in ('race', 'free'):
                self.mode = m['mode']
            if isinstance(m.get('distance'), (int, float)):
                self.distance = int(max(1000, min(20000, m['distance'])))
            await self.broadcast(self.lobby())
        elif t == 'start' and p.id == self.host_id and self.phase == 'lobby':
            self.finishers = []
            self.started_at = time.time()
            self.phase = 'racing' if self.mode == 'race' else 'driving'
            print(f'  > {"race of " + str(self.distance) + " m" if self.mode == "race" else "free drive"} started')
            await self.broadcast(self.start_msg())
            await self.broadcast(self.lobby())
        elif t == 'join' and self.phase == 'driving':
            await p.send(self.start_msg())
        elif t == 'state':
            m['id'] = p.id
            await self.broadcast(m, exclude=p)
        elif t == 'finish' and self.phase == 'racing':
            if all(f['id'] != p.id for f in self.finishers):
                entry = {'id': p.id, 'name': p.name, 'car': p.car, 'time': float(m.get('time') or 0),
                         'place': len(self.finishers) + 1}
                self.finishers.append(entry)
                await self.broadcast({'t': 'finished', **entry})
                await self.check_race_done()
        elif t == 'end' and p.id == self.host_id and self.phase != 'lobby':
            await self.end_race()


room = Room()


# ----------------------------------------------------------------- HTTP + upgrade
async def serve_file(writer, raw_path):
    path = urllib.parse.unquote(raw_path.split('?', 1)[0].split('#', 1)[0])
    if path.endswith('/'):
        path += 'index.html'
    full = os.path.realpath(os.path.join(WWW, path.lstrip('/')))
    if not (full == WWW or full.startswith(WWW + os.sep)) or not os.path.isfile(full):
        body = b'Not found'
        writer.write(b'HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % len(body) + body)
    else:
        with open(full, 'rb') as f:
            body = f.read()
        ctype = CONTENT_TYPES.get(os.path.splitext(full)[1].lower(), 'application/octet-stream')
        writer.write((f'HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n'
                      f'Cache-Control: no-cache\r\nConnection: close\r\n\r\n').encode() + body)
    await writer.drain()


async def handle(reader, writer):
    player = None
    try:
        head = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), timeout=15)
        lines = head.decode('latin-1').split('\r\n')
        method, path = lines[0].split(' ')[:2]
        headers = {}
        for line in lines[1:]:
            if ':' in line:
                k, v = line.split(':', 1)
                headers[k.strip().lower()] = v.strip()
        if headers.get('upgrade', '').lower() != 'websocket':
            if method in ('GET', 'HEAD'):
                await serve_file(writer, path)
            return
        key = headers.get('sec-websocket-key', '')
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        writer.write(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                      f'Sec-WebSocket-Accept: {accept}\r\n\r\n').encode())
        await writer.drain()
        player = room.add(writer)
        while True:
            opcode, payload = await ws_read(reader)
            if opcode == 0x8:                     # close
                break
            if opcode == 0x9:                     # ping -> pong
                async with player.lock:
                    writer.write(ws_frame(0xA, payload))
                continue
            if opcode == 0x1:
                try:
                    msg = json.loads(payload.decode('utf-8'))
                except (ValueError, UnicodeDecodeError):
                    continue
                if isinstance(msg, dict):
                    await room.on_message(player, msg)
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, asyncio.LimitOverrunError,
            ConnectionError, ValueError, IndexError):
        pass
    finally:
        if player is not None:
            await room.remove(player)
        try:
            writer.close()
        except Exception:
            pass


def lan_addresses():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))          # no packet is sent; picks the Wi-Fi interface
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.'))


async def main(port):
    server = await asyncio.start_server(handle, '0.0.0.0', port)
    print('\n  STREET RACING 3D — Wi-Fi multiplayer server')
    print(f'  Serving the game from {WWW}\n')
    print(f'  On this computer:      http://localhost:{port}')
    for ip in lan_addresses():
        print(f'  Phones / laptops:      http://{ip}:{port}')
        print(f'  In the Android/iOS app enter:  {ip}:{port}')
    print('\n  All devices must be on the same Wi-Fi. Press Ctrl+C to stop.\n')
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Street Racing 3D Wi-Fi multiplayer server')
    ap.add_argument('--port', type=int, default=8080)
    args = ap.parse_args()
    try:
        asyncio.run(main(args.port))
    except KeyboardInterrupt:
        print('\n  Server stopped.')
