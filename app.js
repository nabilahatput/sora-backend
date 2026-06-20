require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);

// ── AUTO-CREATE UPLOADS FOLDER ────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Folder uploads dibuat');
}

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

require('./config/db');

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });
const pins = {};

wss.on('connection', (ws, req) => {
    console.log('Pin terhubung');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'register' && data.siswaId) {
                pins[data.siswaId] = ws;
                console.log(`Pin siswa ${data.siswaId} terdaftar`);
            }
        } catch (e) {
            console.error('Pesan tidak valid:', e);
        }
    });
    ws.on('close', () => {
        for (const id in pins) {
            if (pins[id] === ws) {
                delete pins[id];
                console.log(`Pin siswa ${id} terputus`);
            }
        }
    });
});

app.set('wss', wss);
app.set('pins', pins);

// ── ROUTES ────────────────────────────────────────────────────────────────────
const authRoutes     = require('./routes/authRoutes');
const guruRoutes     = require('./routes/guruRoutes');
const adminRoutes    = require('./routes/adminRoutes');
const orangTuaRoutes = require('./routes/orangtuaRoutes');

app.use('/api/auth',      authRoutes);
app.use('/api/guru',      guruRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/orangtua',  orangTuaRoutes);
app.use('/uploads',       express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => res.send('Backend berjalan'));

// ── DEBUG SEMENTARA: cek isi folder uploads lewat browser ─────────────────────
// Buka https://sora-backend-production-a4de.up.railway.app/debug-uploads
// PENTING: hapus endpoint ini setelah selesai debugging, jangan dibiarkan
// permanen di production (membocorkan daftar nama file ke publik).
app.get('/debug-uploads', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: err.message, path: uploadsDir });
    }
    res.json({ path: uploadsDir, count: files.length, files });
  });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});