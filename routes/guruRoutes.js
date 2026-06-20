const express = require('express');
const router = express.Router();
const guruController = require('../controllers/guruController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/siswa', guruController.getSiswa);
router.post('/tegur', guruController.tegur);
router.post('/panggil', guruController.panggil);
router.post('/presensi', guruController.presensi);
router.get('/laporan', guruController.getLaporan);
router.get('/laporan-range', guruController.getLaporanRange);
router.get('/chart', guruController.getChart);
router.get('/chart-general', guruController.getChartGeneral);
router.get('/export-csv', guruController.exportCSV);
router.put('/profil', verifyToken, guruController.updateProfil);
router.put('/profil', verifyToken, guruController.updateProfil);
router.post('/upload-foto',verifyToken,guruController.upload.single('foto'),guruController.uploadFoto);
module.exports = router;