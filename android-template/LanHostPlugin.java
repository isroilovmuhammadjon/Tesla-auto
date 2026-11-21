package com.streetracing3d.game;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Lets the phone host a Wi-Fi multiplayer room without a laptop.
 *
 * A small WebSocket server (same port/protocol as server/mp_server.py). The room logic itself
 * runs in JavaScript (www/js/lanroom.js): this plugin only accepts connections, forwards text
 * messages to JS ("open" / "message" / "close" events) and sends what JS asks it to.
 * It also answers GET /info so other phones scanning the Wi-Fi can list the room.
 */
@CapacitorPlugin(name = "LanHost")
public class LanHostPlugin extends Plugin {
    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    private volatile ServerSocket server;
    private ExecutorService pool;
    private final Map<Integer, Client> clients = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private volatile String info = "{\"game\":\"street-racing-3d\"}";

    private final class Client {
        final int id;
        final Socket socket;
        final OutputStream out;
        volatile boolean open = true;

        Client(int id, Socket socket) throws IOException {
            this.id = id;
            this.socket = socket;
            this.out = socket.getOutputStream();
        }

        synchronized void sendText(String text) {
            if (!open) return;
            try {
                byte[] payload = text.getBytes(StandardCharsets.UTF_8);
                writeFrame(out, 0x1, payload);
                out.flush();
            } catch (IOException e) {
                close();
            }
        }

        void close() {
            open = false;
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    // ------------------------------------------------------------------ JS API

    @PluginMethod
    public void start(PluginCall call) {
        int port = call.getInt("port", 8080);
        stopServer();
        try {
            ServerSocket s = new ServerSocket();
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(port));
            server = s;
        } catch (IOException e) {
            call.reject("Could not open port " + port + ": " + e.getMessage());
            return;
        }
        pool = Executors.newCachedThreadPool();
        pool.execute(this::acceptLoop);
        JSObject ret = new JSObject();
        ret.put("ip", localIp());
        ret.put("port", port);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopServer();
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        Integer id = call.getInt("id");
        String text = call.getString("text", "");
        Client c = id == null ? null : clients.get(id);
        if (c != null) {
            final Client target = c;
            pool.execute(() -> target.sendText(text));
        }
        call.resolve();
    }

    @PluginMethod
    public void broadcast(PluginCall call) {
        int exclude = call.getInt("exclude", -1);
        String text = call.getString("text", "");
        if (pool != null) {
            for (Client c : clients.values()) {
                if (c.id != exclude && c.open) pool.execute(() -> c.sendText(text));
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setInfo(PluginCall call) {
        info = call.getString("json", info);
        call.resolve();
    }

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ip", localIp());
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        stopServer();
        super.handleOnDestroy();
    }

    // ------------------------------------------------------------------ server

    private void stopServer() {
        ServerSocket s = server;
        server = null;
        if (s != null) {
            try { s.close(); } catch (IOException ignored) { }
        }
        for (Client c : clients.values()) c.close();
        clients.clear();
        if (pool != null) {
            pool.shutdownNow();
            pool = null;
        }
    }

    private void acceptLoop() {
        ServerSocket s = server;
        while (s != null && !s.isClosed()) {
            try {
                Socket socket = s.accept();
                socket.setTcpNoDelay(true);
                ExecutorService p = pool;
                if (p != null) p.execute(() -> handle(socket));
            } catch (IOException e) {
                break;
            }
        }
    }

    private void handle(Socket socket) {
        Client client = null;
        try {
            socket.setSoTimeout(15000);
            InputStream in = socket.getInputStream();
            String head = readHead(in);
            if (head == null) { socket.close(); return; }
            String[] lines = head.split("\r\n");
            String[] first = lines[0].split(" ");
            String method = first.length > 0 ? first[0] : "";
            String path = first.length > 1 ? first[1] : "/";
            String upgrade = "", key = "";
            for (String line : lines) {
                int i = line.indexOf(':');
                if (i <= 0) continue;
                String name = line.substring(0, i).trim().toLowerCase(Locale.ROOT);
                String value = line.substring(i + 1).trim();
                if (name.equals("upgrade")) upgrade = value;
                if (name.equals("sec-websocket-key")) key = value;
            }
            OutputStream out = socket.getOutputStream();

            if (!upgrade.equalsIgnoreCase("websocket")) {
                // plain HTTP: discovery endpoint for room lists
                if (method.equals("OPTIONS")) {
                    writeHttp(out, "204 No Content", "text/plain", new byte[0]);
                } else if (path.startsWith("/info")) {
                    writeHttp(out, "200 OK", "application/json", info.getBytes(StandardCharsets.UTF_8));
                } else {
                    writeHttp(out, "404 Not Found", "text/plain", "Not found".getBytes(StandardCharsets.UTF_8));
                }
                socket.close();
                return;
            }

            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            String accept = Base64.encodeToString(sha1.digest((key + WS_GUID).getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
            socket.setSoTimeout(0);

            client = new Client(nextId.getAndIncrement(), socket);
            clients.put(client.id, client);
            JSObject opened = new JSObject();
            opened.put("id", client.id);
            notifyListeners("open", opened);

            readFrames(client, in);
        } catch (Exception ignored) {
            // connection dropped
        } finally {
            if (client != null) {
                client.close();
                clients.remove(client.id);
                JSObject closed = new JSObject();
                closed.put("id", client.id);
                notifyListeners("close", closed);
            } else {
                try { socket.close(); } catch (IOException ignored) { }
            }
        }
    }

    private void readFrames(Client client, InputStream in) throws IOException {
        ByteArrayOutputStream message = new ByteArrayOutputStream();
        int messageOpcode = -1;
        while (client.open) {
            int b1 = in.read();
            int b2 = in.read();
            if (b1 < 0 || b2 < 0) return;
            boolean fin = (b1 & 0x80) != 0;
            int opcode = b1 & 0x0F;
            boolean masked = (b2 & 0x80) != 0;
            long len = b2 & 0x7F;
            if (len == 126) {
                len = ((long) readByte(in) << 8) | readByte(in);
            } else if (len == 127) {
                len = 0;
                for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in);
            }
            if (len > (1 << 20)) return;              // 1 MB safety limit
            byte[] mask = new byte[4];
            if (masked) readFully(in, mask);
            byte[] data = new byte[(int) len];
            readFully(in, data);
            if (masked) for (int i = 0; i < data.length; i++) data[i] ^= mask[i & 3];

            if (opcode == 0x8) return;                // close
            if (opcode == 0x9) {                      // ping -> pong
                synchronized (client) { writeFrame(client.out, 0xA, data); client.out.flush(); }
                continue;
            }
            if (opcode == 0xA) continue;              // pong
            if (opcode != 0x0) messageOpcode = opcode;
            message.write(data);
            if (fin) {
                if (messageOpcode == 0x1) {
                    JSObject msg = new JSObject();
                    msg.put("id", client.id);
                    msg.put("text", new String(message.toByteArray(), StandardCharsets.UTF_8));
                    notifyListeners("message", msg);
                }
                message.reset();
                messageOpcode = -1;
            }
        }
    }

    // ------------------------------------------------------------------ helpers

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int last4 = 0;                                   // last four bytes, packed
        while (buf.size() < 16384) {
            int c = in.read();
            if (c < 0) return null;
            buf.write(c);
            last4 = (last4 << 8) | c;
            if (last4 == 0x0D0A0D0A) return new String(buf.toByteArray(), StandardCharsets.ISO_8859_1); // \r\n\r\n
        }
        return null;
    }

    private static int readByte(InputStream in) throws IOException {
        int b = in.read();
        if (b < 0) throw new IOException("eof");
        return b;
    }

    private static void readFully(InputStream in, byte[] dst) throws IOException {
        int off = 0;
        while (off < dst.length) {
            int n = in.read(dst, off, dst.length - off);
            if (n < 0) throw new IOException("eof");
            off += n;
        }
    }

    private static void writeFrame(OutputStream out, int opcode, byte[] payload) throws IOException {
        int n = payload.length;
        out.write(0x80 | opcode);
        if (n < 126) {
            out.write(n);
        } else if (n < 65536) {
            out.write(126);
            out.write((n >>> 8) & 0xFF);
            out.write(n & 0xFF);
        } else {
            out.write(127);
            for (int i = 7; i >= 0; i--) out.write((int) (((long) n >>> (8 * i)) & 0xFF));
        }
        out.write(payload);
    }

    private static void writeHttp(OutputStream out, String status, String type, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: *\r\n"
                + "Access-Control-Allow-Private-Network: true\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    /** IPv4 address of the Wi-Fi (or hotspot) interface, e.g. 192.168.1.23 */
    private static String localIp() {
        String fallback = "";
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                String name = nif.getName().toLowerCase(Locale.ROOT);
                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;
                    String ip = addr.getHostAddress();
                    if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("eth")) return ip;
                    if (fallback.isEmpty() && addr.isSiteLocalAddress()) fallback = ip;
                }
            }
        } catch (Exception ignored) { }
        return fallback;
    }
}
