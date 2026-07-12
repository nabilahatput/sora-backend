const db = require('../config/db');
const multer = require('multer');
const path = require('path');

// ── MULTER CONFIG ─────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `guru_${Date.now()}${ext}`);
  }
});

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpeg', '.jpg', '.png', '.webp'];

exports.upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const extOk = ALLOWED_EXT.includes(ext);
    const mimeOk = ALLOWED_MIME.includes(mime);
    console.log(`[uploadFoto] originalname="${file.originalname}" ext="${ext}" mimetype="${mime}" extOk=${extOk} mimeOk=${mimeOk}`);
    if (extOk || mimeOk) {
      return cb(null, true);
    }
    return cb(new Error('Hanya file gambar yang diizinkan (jpg, jpeg, png, webp)'));
  }
});

// ── HELPER TANGGAL/WAKTU (FIX FINAL) ───────────────────────────────────────────
// PENTING: jangan pernah pakai CURDATE()/CURTIME() MySQL atau opsi driver
// (dateStrings/timezone) untuk ini lagi — keduanya sudah terbukti bermasalah
// (CURDATE/CURTIME server = UTC salah hari saat dini hari WIB; opsi driver
// custom malah bikin kolom jadi NULL saat dicampur literal SQL di query yang
// sama). Solusi paling aman & predictable: hitung tanggal & jam WIB manual
// di JavaScript, lalu kirim sebagai VALUE biasa ke query (bukan literal SQL).

function getTanggalWIB(req) {
  // 1) Prioritas: tanggal yang dikirim Flutter (format 'yyyy-MM-dd')
  const tanggal = req.body.tanggal;
  if (tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return tanggal;
  }
  // 2) Fallback: hitung sendiri dari waktu server + offset WIB (UTC+7),
  //    BUKAN dari CURDATE() MySQL yang ikut timezone server (UTC).
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // geser ke WIB
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getWaktuWIB() {
  // Jam saat ini dalam WIB (UTC+7), dihitung manual, format 'HH:mm:ss'
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mi}:${ss}`;
}

// ── UPLOAD FOTO GURU ──────────────────────────────────────────────────────────

exports.uploadFoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Tidak ada file yang diupload' });
    }
    const guruId = req.user.id;
    const fotoUrl = `uploads/${req.file.filename}`;
    await db.query('UPDATE guru SET foto = ? WHERE id = ?', [fotoUrl, guruId]);
    res.json({ message: 'Foto berhasil diupload', foto: fotoUrl });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET SISWA ─────────────────────────────────────────────────────────────────

exports.getSiswa = async (req, res) => {
  const kelas = req.query.kelas;
  try {
    const [results] = await db.query(
      `SELECT siswa.*, devices.ip_address AS esp_ip
       FROM siswa
       LEFT JOIN devices ON siswa.device_id = devices.id
       WHERE siswa.kelas = ?`,
      [kelas]
    );
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET LAPORAN ───────────────────────────────────────────────────────────────

exports.getLaporan = async (req, res) => {
  const { mapel, tanggal, kelas } = req.query;
  const tgl = (tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)) ? tanggal : getTanggalWIB({ body: {} });

  let sql = `
    SELECT siswa.id, siswa.nama, siswa.nis, siswa.kelas,
           aktivitas.mapel, aktivitas.tipe, aktivitas.tanggal
    FROM aktivitas
    JOIN siswa ON aktivitas.siswa_id = siswa.id
    WHERE aktivitas.tanggal = ?
  `;
  const params = [tgl];
  if (mapel) { sql += ' AND aktivitas.mapel = ?'; params.push(mapel); }
  if (kelas) { sql += ' AND siswa.kelas = ?'; params.push(kelas); }

  try {
    const [results] = await db.query(sql, params);
    const grouped = {};
    results.forEach(row => {
      const key = `${row.kelas}_${row.mapel}`;
      if (!grouped[key]) {
        grouped[key] = {
          namaKelas: `Kelas ${row.kelas}`,
          mapel: row.mapel,
          siswaMap: {}
        };
      }
      if (!grouped[key].siswaMap[row.id]) {
        grouped[key].siswaMap[row.id] = {
          id: row.id,
          nama: row.nama,
          nis: row.nis,
          presensi: 'Belum',
          tegurCount: 0,
          panggilCount: 0
        };
      }
      if (row.tipe === 'presensi') grouped[key].siswaMap[row.id].presensi = 'Hadir';
      if (row.tipe === 'tegur')    grouped[key].siswaMap[row.id].tegurCount++;
      if (row.tipe === 'panggil')  grouped[key].siswaMap[row.id].panggilCount++;
    });

    const data = Object.values(grouped).map(g => ({
      namaKelas: g.namaKelas,
      mapel: g.mapel,
      records: Object.values(g.siswaMap)
    }));
    res.json(data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET CHART ─────────────────────────────────────────────────────────────────

exports.getChart = async (req, res) => {
  const { mapel } = req.query;
  try {
    const [results] = await db.query(
      `SELECT tipe, COUNT(*) as total FROM aktivitas WHERE mapel = ? GROUP BY tipe`,
      [mapel]
    );
    const data = { tegur: 0, panggil: 0, presensi: 0 };
    results.forEach(r => { data[r.tipe] = r.total; });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET CHART GENERAL ─────────────────────────────────────────────────────────

exports.getChartGeneral = async (req, res) => {
  const { kelas, tanggal } = req.query;
  const tgl = (tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    ? tanggal
    : getTanggalWIB({ body: {} });

  try {
    const sql = `SELECT aktivitas.tipe, COUNT(*) as total FROM aktivitas
         JOIN siswa ON aktivitas.siswa_id = siswa.id
         WHERE siswa.kelas = ? AND aktivitas.tanggal = ?
         GROUP BY aktivitas.tipe`;
    const params = [kelas, tgl];

    const [results] = await db.query(sql, params);
    const data = { tegur: 0, panggil: 0, presensi: 0 };
    results.forEach(r => { data[r.tipe] = r.total; });
    res.json(data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET TRAFFIC (untuk grafik di dashboard) ───────────────────────────────────

exports.getTraffic = async (req, res) => {
  const { mode, kelas } = req.query;

  const whereKelas = kelas ? ' AND siswa.kelas = ?' : '';
  const params = kelas ? [kelas] : [];

  let sql;
  switch (mode) {
    case 'mingguan':
      sql = `
        SELECT aktivitas.tanggal AS label, aktivitas.tipe, COUNT(*) as total
        FROM aktivitas
        JOIN siswa ON aktivitas.siswa_id = siswa.id
        WHERE aktivitas.tanggal >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)${whereKelas}
        GROUP BY aktivitas.tanggal, aktivitas.tipe
        ORDER BY aktivitas.tanggal ASC`;
      break;
    case 'bulanan':
      sql = `
        SELECT DATE_FORMAT(aktivitas.tanggal, '%Y-%m') AS label, aktivitas.tipe, COUNT(*) as total
        FROM aktivitas
        JOIN siswa ON aktivitas.siswa_id = siswa.id
        WHERE aktivitas.tanggal >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)${whereKelas}
        GROUP BY label, aktivitas.tipe
        ORDER BY label ASC`;
      break;
    case 'semester':
      sql = `
        SELECT CONCAT(YEAR(aktivitas.tanggal), '-', IF(MONTH(aktivitas.tanggal) <= 6, 1, 2)) AS label,
               aktivitas.tipe, COUNT(*) as total
        FROM aktivitas
        JOIN siswa ON aktivitas.siswa_id = siswa.id
        WHERE 1=1${whereKelas}
        GROUP BY label, aktivitas.tipe
        ORDER BY label ASC`;
      break;
    case 'tahunan':
      sql = `
        SELECT YEAR(aktivitas.tanggal) AS label, aktivitas.tipe, COUNT(*) as total
        FROM aktivitas
        JOIN siswa ON aktivitas.siswa_id = siswa.id
        WHERE 1=1${whereKelas}
        GROUP BY label, aktivitas.tipe
        ORDER BY label ASC`;
      break;
    default:
      return res.status(400).json({ message: 'mode tidak valid (mingguan/bulanan/semester/tahunan)' });
  }

  try {
    const [rows] = await db.query(sql, params);

    const map = {};
    rows.forEach(r => {
      const label = String(r.label);
      if (!map[label]) map[label] = { label, presensi: 0, tegur: 0, panggil: 0 };
      if (r.tipe === 'presensi') map[label].presensi = r.total;
      if (r.tipe === 'tegur')    map[label].tegur = r.total;
      if (r.tipe === 'panggil')  map[label].panggil = r.total;
    });

    const data = Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
    res.json({ data });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET LAPORAN RANGE (untuk export PDF rentang tanggal) ──────────────────────

exports.getLaporanRange = async (req, res) => {
  const { mapel, dari, sampai, kelas } = req.query;

  if (!dari || !sampai) {
    return res.status(400).json({ message: 'Parameter dari dan sampai wajib diisi' });
  }

  let sql = `
    SELECT siswa.id, siswa.nama, siswa.nis, siswa.kelas,
           aktivitas.mapel, aktivitas.tipe, aktivitas.tanggal
    FROM aktivitas
    JOIN siswa ON aktivitas.siswa_id = siswa.id
    WHERE aktivitas.tanggal BETWEEN ? AND ?
  `;
  const params = [dari, sampai];
  if (mapel) { sql += ' AND aktivitas.mapel = ?'; params.push(mapel); }
  if (kelas) { sql += ' AND siswa.kelas = ?'; params.push(kelas); }
  sql += ' ORDER BY aktivitas.tanggal ASC';

  try {
    const [results] = await db.query(sql, params);
    const grouped = {};
    results.forEach(row => {
      const tgl = row.tanggal instanceof Date
        ? row.tanggal.toISOString().split('T')[0]
        : row.tanggal;
      const key = `${tgl}_${row.kelas}_${row.mapel}`;
      if (!grouped[key]) {
        grouped[key] = {
          tanggal: tgl,
          namaKelas: `Kelas ${row.kelas}`,
          mapel: row.mapel,
          siswaMap: {}
        };
      }
      if (!grouped[key].siswaMap[row.id]) {
        grouped[key].siswaMap[row.id] = {
          id: row.id,
          nama: row.nama,
          nis: row.nis,
          presensi: 'Belum',
          tegurCount: 0,
          panggilCount: 0
        };
      }
      if (row.tipe === 'presensi') grouped[key].siswaMap[row.id].presensi = 'Hadir';
      if (row.tipe === 'tegur')    grouped[key].siswaMap[row.id].tegurCount++;
      if (row.tipe === 'panggil')  grouped[key].siswaMap[row.id].panggilCount++;
    });

    const data = Object.values(grouped).map(g => ({
      tanggal: g.tanggal,
      namaKelas: g.namaKelas,
      mapel: g.mapel,
      records: Object.values(g.siswaMap)
    }));
    res.json(data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.tegur = async (req, res) => {
  const { siswa_id, guru_id, mapel } = req.body;
  const tgl = getTanggalWIB(req);
  const jam = getWaktuWIB();
  try {
    await db.query(
      `INSERT INTO aktivitas (siswa_id, guru_id, mapel, tanggal, waktu, tipe)
       VALUES (?, ?, ?, ?, ?, 'tegur')`,
      [siswa_id, guru_id, mapel, tgl, jam]
    );
    const pins = req.app.get('pins');
    console.log('DEBUG tegur - siswa_id diterima:', siswa_id, '| tipe data:', typeof siswa_id);
    console.log('DEBUG tegur - daftar pins yang connect:', Object.keys(pins));
    if (pins[siswa_id]) {
      pins[siswa_id].send(JSON.stringify({ tipe: 'tegur' }));
      console.log('DEBUG tegur - BERHASIL kirim ke ESP32');
    } else {
      console.log('DEBUG tegur - GAGAL, tidak ada ESP32 terdaftar untuk siswa_id ini');
    }
    res.json({ message: 'Tegur berhasil' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Gagal tegur' });
  }
};

exports.panggil = async (req, res) => {
  const { siswa_id, guru_id, mapel } = req.body;
  const tgl = getTanggalWIB(req);
  const jam = getWaktuWIB();
  try {
    await db.query(
      `INSERT INTO aktivitas (siswa_id, guru_id, mapel, tanggal, waktu, tipe)
       VALUES (?, ?, ?, ?, ?, 'panggil')`,
      [siswa_id, guru_id, mapel, tgl, jam]
    );
    const pins = req.app.get('pins');
    console.log('DEBUG panggil - siswa_id diterima:', siswa_id, '| tipe data:', typeof siswa_id);
    console.log('DEBUG panggil - daftar pins yang connect:', Object.keys(pins));
    if (pins[siswa_id]) {
      pins[siswa_id].send(JSON.stringify({ tipe: 'panggil' }));
      console.log('DEBUG panggil - BERHASIL kirim ke ESP32');
    } else {
      console.log('DEBUG panggil - GAGAL, tidak ada ESP32 terdaftar untuk siswa_id ini');
    }
    res.json({ message: 'Panggil berhasil' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Gagal panggil' });
  }
};

exports.presensi = async (req, res) => {
  const { siswa_id, guru_id, mapel } = req.body;
  const tgl = getTanggalWIB(req);
  const jam = getWaktuWIB();
  try {
    await db.query(
      `INSERT INTO aktivitas (siswa_id, guru_id, mapel, tanggal, waktu, tipe)
       VALUES (?, ?, ?, ?, ?, 'presensi')`,
      [siswa_id, guru_id, mapel, tgl, jam]
    );
    const pins = req.app.get('pins');
    console.log('DEBUG presensi - siswa_id diterima:', siswa_id, '| tipe data:', typeof siswa_id);
    console.log('DEBUG presensi - daftar pins yang connect:', Object.keys(pins));
    if (pins[siswa_id]) {
      pins[siswa_id].send(JSON.stringify({ tipe: 'presensi' }));
      console.log('DEBUG presensi - BERHASIL kirim ke ESP32');
    } else {
      console.log('DEBUG presensi - GAGAL, tidak ada ESP32 terdaftar untuk siswa_id ini');
    }
    res.json({ message: 'Presensi berhasil' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Gagal presensi' });
  }
};

// ── EXPORT CSV ────────────────────────────────────────────────────────────────

exports.exportCSV = async (req, res) => {
  const { mapel } = req.query;
  try {
    const [results] = await db.query(
      `SELECT siswa.nama, aktivitas.mapel, aktivitas.tipe,
              aktivitas.tanggal, aktivitas.waktu
       FROM aktivitas
       JOIN siswa ON aktivitas.siswa_id = siswa.id
       WHERE aktivitas.mapel = ?`,
      [mapel]
    );
    let csv = 'Nama,Mapel,Tipe,Tanggal,Waktu\n';
    results.forEach(row => {
      csv += `${row.nama},${row.mapel},${row.tipe},${row.tanggal},${row.waktu}\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment(`laporan_${mapel}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── UPDATE PROFIL GURU ────────────────────────────────────────────────────────

exports.updateProfil = async (req, res) => {
  const { nama } = req.body;
  const guruId = req.user.id;
  try {
    await db.query('UPDATE guru SET nama = ? WHERE id = ?', [nama, guruId]);
    res.json({ message: 'Profil berhasil diupdate' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server error' });
  }
};