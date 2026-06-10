const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

exports.login = async (req, res) => {
    try {
        const { role, identifier, password } = req.body;

        let sql = '';
        if (role === 'admin') sql = 'SELECT * FROM admin WHERE email = ?';
        else if (role === 'guru') sql = "SELECT * FROM guru WHERE CONCAT(nip, kode_kelas) = ?";
        else if (role === 'orangtua') sql = 'SELECT * FROM orang_tua WHERE nis = ?';
        else return res.status(400).json({ message: 'Role tidak valid' });

        const [results] = await db.query(sql, [identifier]);
        if (results.length === 0) return res.status(400).json({ message: 'User tidak ditemukan' });

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Password salah' });

        db.query('INSERT INTO login_history (user_id, role) VALUES (?, ?)', [user.id, role])
            .then(() => console.log('History tersimpan, user_id:', user.id, 'role:', role))
            .catch(e => console.log('Gagal simpan history ERROR:', e));

        const token = jwt.sign({ id: user.id, role }, 'SECRET_KEY', { expiresIn: '1h' });

        return res.json({ message: 'Login berhasil', token, role, data: user });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const { identifier, password_lama, password_baru, role } = req.body;

        let sql = '';
        if (role === 'guru') sql = "SELECT * FROM guru WHERE CONCAT(nip, kode_kelas) = ?";
        else if (role === 'orangtua') sql = 'SELECT * FROM orang_tua WHERE nis = ?';
        else if (role === 'admin') sql = 'SELECT * FROM admin WHERE email = ?';
        else return res.status(400).json({ success: false, message: 'Role tidak valid' });

        const [results] = await db.query(sql, [identifier]);
        if (results.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        const user = results[0];
        const match = await bcrypt.compare(password_lama, user.password);
        if (!match) return res.status(400).json({ success: false, message: 'Password lama salah' });

        const hashed = await bcrypt.hash(password_baru, 10);

        let updateSql = '';
        if (role === 'guru') updateSql = "UPDATE guru SET password = ? WHERE CONCAT(nip, kode_kelas) = ?";
        else if (role === 'orangtua') updateSql = 'UPDATE orang_tua SET password = ? WHERE nis = ?';
        else updateSql = 'UPDATE admin SET password = ? WHERE email = ?';

        await db.query(updateSql, [hashed, identifier]);
        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.logout = (req, res) => {
    res.json({ message: 'Logout berhasil' });
};