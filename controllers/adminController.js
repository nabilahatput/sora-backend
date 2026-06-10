const db = require('../config/db');
const bcrypt = require('bcryptjs');

const query = async (sql, params) => {
    const [results] = await db.query(sql, params);
    return results;
};

// ================= GURU =================

exports.getAllGuru = async (req, res) => {
    try {
        const results = await query('SELECT id, nama, nip, kode_kelas FROM guru');
        res.json({ success: true, total: results.length, data: results });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.tambahGuru = async (req, res) => {
    const { nama, nip, kode_kelas, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await query('INSERT INTO guru (nama, nip, kode_kelas, password) VALUES (?, ?, ?, ?)', [nama, nip, kode_kelas, hashed]);
        res.json({ success: true, message: 'Guru berhasil ditambahkan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.editGuru = async (req, res) => {
    const { id } = req.params;
    const { nama, nip, kode_kelas, password } = req.body;
    try {
        let sql = 'UPDATE guru SET nama = ?, nip = ?, kode_kelas = ?';
        let params = [nama, nip, kode_kelas];
        if (password) {
            params.push(await bcrypt.hash(password, 10));
            sql += ', password = ?';
        }
        sql += ' WHERE id = ?';
        params.push(id);
        await query(sql, params);
        res.json({ success: true, message: 'Guru berhasil diupdate' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.hapusGuru = async (req, res) => {
    try {
        await query('DELETE FROM guru WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Guru berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================= ORANG TUA =================

exports.getAllOrangTua = async (req, res) => {
    try {
        const results = await query('SELECT id, nama, nis FROM orang_tua');
        res.json({ success: true, total: results.length, data: results });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.tambahOrangTua = async (req, res) => {
    const { nama, nis, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await query('INSERT INTO orang_tua (nama, nis, password) VALUES (?, ?, ?)', [nama, nis, hashed]);
        res.json({ success: true, message: 'Orang tua berhasil ditambahkan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.editOrangTua = async (req, res) => {
    const { id } = req.params;
    const { nama, nis, password } = req.body;
    try {
        let sql = 'UPDATE orang_tua SET nama = ?, nis = ?';
        let params = [nama, nis];
        if (password) {
            params.push(await bcrypt.hash(password, 10));
            sql += ', password = ?';
        }
        sql += ' WHERE id = ?';
        params.push(id);
        await query(sql, params);
        res.json({ success: true, message: 'Orang tua berhasil diupdate' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.hapusOrangTua = async (req, res) => {
    try {
        await query('DELETE FROM orang_tua WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Orang tua berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================= ADMIN =================

exports.editAdmin = async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;
    try {
        let sql = 'UPDATE admin SET email = ?';
        let params = [email];
        if (password) {
            params.push(await bcrypt.hash(password, 10));
            sql += ', password = ?';
        }
        sql += ' WHERE id = ?';
        params.push(id);
        await query(sql, params);
        res.json({ success: true, message: 'Admin berhasil diupdate' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================= LAPORAN =================

exports.getLaporan = async (req, res) => {
    const { tanggal, kelas, mapel } = req.query;
    const tgl = tanggal || new Date().toISOString().split('T')[0];

    let sql = `
    SELECT 
      s.id, s.nama AS nama_siswa, s.nis, s.kelas,
      COALESCE(g.nama, 'Unknown') AS nama_guru,
      a.mapel, a.tanggal, a.waktu, a.tipe
    FROM aktivitas a
    JOIN siswa s ON a.siswa_id = s.id
    LEFT JOIN guru g ON a.guru_id = g.id
    WHERE a.tanggal = ?
  `;
    const params = [tgl];

    if (kelas) { sql += ' AND s.kelas = ?'; params.push(kelas); }
    if (mapel) { sql += ' AND a.mapel = ?'; params.push(mapel); }

    try {
        const results = await query(sql, params);

        const grouped = {};
        results.forEach(row => {
            const key = `${row.kelas}_${row.mapel}`;
            if (!grouped[key]) {
                grouped[key] = { namaKelas: `Kelas ${row.kelas}`, mapel: row.mapel, siswaMap: {} };
            }
            if (!grouped[key].siswaMap[row.id]) {
                grouped[key].siswaMap[row.id] = {
                    id: row.id, nama: row.nama_siswa, nis: row.nis,
                    presensi: 'Belum', tegurCount: 0, panggilCount: 0,
                };
            }
            if (row.tipe === 'presensi') grouped[key].siswaMap[row.id].presensi = 'Hadir';
            if (row.tipe === 'tegur') grouped[key].siswaMap[row.id].tegurCount++;
            if (row.tipe === 'panggil') grouped[key].siswaMap[row.id].panggilCount++;
        });

        const data = Object.values(grouped).map(g => ({
            namaKelas: g.namaKelas,
            mapel: g.mapel,
            records: Object.values(g.siswaMap),
        }));

        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================= SISWA =================

exports.tambahSiswa = async (req, res) => {
    const { nama, nis, kelas } = req.body;
    try {
        if (!nama || !nis || !kelas) {
            return res.status(400).json({ success: false, message: 'nama, nis, dan kelas wajib diisi' });
        }
        await query('INSERT INTO siswa (nama, nis, kelas) VALUES (?, ?, ?)', [nama, nis, kelas]);
        res.json({ success: true, message: 'Siswa berhasil ditambahkan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ================= DEVICES =================

exports.registerDevice = async (req, res) => {
    console.log('REGISTER DEVICE HIT:', req.body);
    const { ip_address } = req.body;
    try {
        if (!ip_address) return res.status(400).json({ success: false, message: 'ip_address wajib diisi' });

        const existing = await query('SELECT * FROM devices WHERE ip_address = ?', [ip_address]);
        console.log('existing:', existing);

        if (existing.length > 0) {
            console.log('device sudah ada');
            return res.json({ success: true, message: 'Device sudah terdaftar', device: existing[0] });
        }

        await query('INSERT INTO devices (ip_address) VALUES (?)', [ip_address]);
        const device = await query('SELECT * FROM devices WHERE ip_address = ?', [ip_address]);
        console.log('device baru:', device[0]);
        res.json({ success: true, message: 'Device berhasil didaftarkan', device: device[0] });
    } catch (err) {
        console.error('ERROR registerDevice:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.tambahSiswaDevice = async (req, res) => {
    const { device_id, nama, nis, kelas } = req.body;
    try {
        if (!device_id || !nama || !nis || !kelas) {
            return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
        }
        await query(
            'INSERT INTO siswa (nama, nis, kelas, device_id) VALUES (?, ?, ?, ?)',
            [nama, nis, kelas, device_id]
        );
        await query('UPDATE devices SET is_registered = 1 WHERE id = ?', [device_id]);
        res.json({ success: true, message: 'Siswa berhasil ditambahkan' });
    } catch (err) {
        console.error('ERROR tambahSiswaDevice:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};