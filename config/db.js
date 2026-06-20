const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sora_backend',
    waitForConnections: true,
    connectionLimit: 10,
    // FIX: tanpa dua opsi ini, kolom DATE/DATETIME/TIMESTAMP otomatis
    // dikonversi jadi objek JS Date oleh mysql2, lalu ikut tergeser ke
    // timezone server (Railway = UTC) saat dibaca/ditulis kembali.
    // Akibatnya tanggal yang sudah benar dikirim dari Flutter ('2026-06-21')
    // bisa berubah jadi '2026-06-20' saat disimpan atau dibaca ulang.
    //
    // dateStrings: true  -> kolom tanggal dibaca sebagai STRING mentah
    //                       ('2026-06-21'), tidak dikonversi ke Date/UTC sama sekali.
    // timezone: '+07:00' -> kalau ada operasi yang tetap perlu konversi
    //                       (misal NOW()/CURDATE() di kolom DATETIME lain),
    //                       session MySQL dianggap WIB, bukan UTC.
    dateStrings: true,
    timezone: '+07:00',
});

db.getConnection()
  .then(conn => {
    console.log('MySQL Connected');
    conn.release();
  })
  .catch(err => {
    console.log('MySQL Error:', err.message);
  });

module.exports = db;