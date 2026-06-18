const db = require('../config/db');

// 🟢 GET SISWA
exports.getSiswa = async (req, res) => {
    const kelas = req.query.kelas;
    try {
        const [results] = await db.query('SELECT * FROM siswa WHERE kelas = ?', [kelas]);
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// 📊 GET LAPORAN
exports.getLaporan = async (req, res) => {
    const { mapel, tanggal, kelas } = req.query;
    const tgl = tanggal || new Date().toISOString().split('T')[0];

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
            if (!grouped[key]) grouped[key] = { namaKelas: `Kelas ${row.kelas}`, mapel: row.mapel, siswaMap: {} };
            if (!grouped[key].siswaMap[row.id]) grouped[key].siswaMap[row.id] = { id: row.id, nama: row.nama, nis: row.nis, presensi: 'Belum', tegurCount: 0, panggilCount: 0 };
            if (row.tipe === 'presensi') grouped[key].siswaMap[row.id].presensi = 'Hadir';
            if (row.tipe === 'tegur') grouped[key].siswaMap[row.id].tegurCount++;
            if (row.tipe === 'panggil') grouped[key].siswaMap[row.id].panggilCount++;
        });
        const data = Object.values(grouped).map(g => ({ namaKelas: g.namaKelas, mapel: g.mapel, records: Object.values(g.siswaMap) }));
        res.json(data);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// 📈 GET CHART
exports.getChart = async (req, res) => {
    const { mapel } = req.query;
    try {
        const [results] = await db.query(
            // ✅ FIX: hapus filter CURDATE() agar data terakumulasi semua
            `SELECT tipe, COUNT(*) as total FROM aktivitas WHERE mapel = ? GROUP BY tipe`,
            [mapel]
        );
        let data = { tegur: 0, panggil: 0, presensi: 0 };
        results.forEach(r => { data[r.tipe] = r.total; });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// 📈 GET CHART GENERAL
exports.getChartGeneral = async (req, res) => {
    const { kelas } = req.query;
    try {
        const [results] = await db.query(
            // ✅ FIX: hapus filter CURDATE() agar data terakumulasi semua
            `SELECT aktivitas.tipe, COUNT(*) as total FROM aktivitas
             JOIN siswa ON aktivitas.siswa_id = siswa.id
             WHERE siswa.kelas = ?
             GROUP BY aktivitas.tipe`,
            [kelas]
        );
        let data = { tegur: 0, panggil: 0, presensi: 0 };
        results.forEach(r => { data[r.tipe] = r.total; });
        res.json(data);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// 🔴 TEGUR
exports.tegur = async (req, res) => {
    const { siswa_id, guru_id, mapel } = req.body;
    try {
        await db.query(
            `INSERT INTO aktivitas (siswa_id, guru_id, mapel, tanggal, waktu, tipe) VALUES (?, ?, ?, CURDATE(), CURTIME(), 'tegur')`,
            [siswa_id, guru_id, mapel]
        );
        const pins = req.app.get('pins');
        if (pins[siswa_id]) pins[siswa_id].send(JSON.stringify({ tipe: 'tegur' }));
        res.json({ message: 'Tegur berhasil' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Gagal tegur' });
    }
};

// 🔵 PANGGIL
exports.panggil = async (req, res) => {
    const { siswa_id, guru_id, mapel } = req.body;
    try {
        await db.query(
            `INSERT INTO aktivitas (siswa_id, guru_id, mapel, tanggal, waktu, tipe) VALUES (?, ?, ?, CURDATE(), CURTIME(), 'panggil')`,
            [siswa_id, guru_id, mapel]
        );
        const pins = req.app.get('pins');
        if (pins[siswa_id]) pins[siswa_id].send(JSON.stringify({ tipe: 'panggil' }));
        res.json({ message: 'Panggil berhasil' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Gagal panggil' });
    }
};

// 🟢 PRESENSI
exports.presensi = async (req, res) => {
    const { siswa_id, guru_id, mapel } = req.body;
    try {
        await db.query(
            `INSERT INTO aktivitas (siswa_id, guru_id, mapel, tanggal, waktu, tipe) VALUES (?, ?, ?, CURDATE(), CURTIME(), 'presensi')`,
            [siswa_id, guru_id, mapel]
        );
        const pins = req.app.get('pins');
        if (pins[siswa_id]) pins[siswa_id].send(JSON.stringify({ tipe: 'presensi' }));
        res.json({ message: 'Presensi berhasil' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Gagal presensi' });
    }
};

// EXPORT CSV
exports.exportCSV = async (req, res) => {
    const { mapel } = req.query;
    try {
        const [results] = await db.query(
            // ✅ FIX: hapus filter CURDATE() agar export semua data
            `SELECT siswa.nama, aktivitas.mapel, aktivitas.tipe, aktivitas.tanggal, aktivitas.waktu
             FROM aktivitas JOIN siswa ON aktivitas.siswa_id = siswa.id
             WHERE aktivitas.mapel = ?`,
            [mapel]
        );
        let csv = 'Nama,Mapel,Tipe,Tanggal,Waktu\n';
        results.forEach(row => { csv += `${row.nama},${row.mapel},${row.tipe},${row.tanggal},${row.waktu}\n`; });
        res.header('Content-Type', 'text/csv');
        res.attachment(`laporan_${mapel}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// UPDATE PROFIL GURU
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