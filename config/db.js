const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sora_backend',
    waitForConnections: true,
    connectionLimit: 10,
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
