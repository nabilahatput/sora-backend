const express = require('express');
const router = express.Router();
const guruController = require('../controllers/guruController');

router.get('/siswa', guruController.getSiswa);
router.post('/tegur', guruController.tegur);
router.post('/panggil', guruController.panggil);
router.post('/presensi', guruController.presensi);
router.get('/laporan', guruController.getLaporan);
router.get('/chart', guruController.getChart);
router.get('/chart-general', guruController.getChartGeneral);
router.get('/export-csv', guruController.exportCSV);
router.put('/profil', guruController.updateProfil); // ← endpoint update nama guru

module.exports = router;
