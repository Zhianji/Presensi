/**
 * ABSENSI WEB SERVICE - Backend (Google Apps Script)
 * ---------------------------------------------------
 * Deploy: Extensions > Apps Script (di Spreadsheet) > Deploy > New deployment
 *         Type: Web app | Execute as: Me | Who has access: Anyone
 *
 * Struktur Sheet (dibuat otomatis oleh setupSheets()):
 *   Guru     : id | username | password_hash | nama
 *   Siswa    : id | nis | password_hash | nama | kelas
 *   Absensi  : id | siswa_id | nama_siswa | kelas | mapel | tanggal | waktu | status
 *   Sessions : token | user_id | role | nama | expires_at
 *
 * CATATAN PERUBAHAN KEAMANAN/PERFORMA:
 * - password_hash sekarang berformat "salt:hash" (SHA-256 dari salt+password),
 *   bukan hash polos. Lihat makePasswordHash() / verifyPassword(). Akun yang
 *   dibuat oleh setupSheets() versi ini sudah pakai format baru. Kalau sheet
 *   Guru/Siswa kamu masih berisi hash lama (tanpa "salt:" di depan, dari versi
 *   sebelumnya), reset password akun tersebut lewat updateSiswa/createSiswa
 *   (atau edit manual admin) supaya ikut ter-migrasi ke format baru.
 * - Login (guru & siswa) sekarang dibatasi (rate limit) memakai CacheService:
 *   5 kali gagal berturut-turut untuk identitas yang sama akan diblokir
 *   sementara (5 menit) sebelum bisa mencoba lagi.
 * - Semua action yang butuh token (checkSession, getSiswaList, getLaporan,
 *   getAbsensiHariIni) dulu dilayani lewat doGet dengan token di query
 *   string. Sekarang HANYA lewat doPost (token di body) -- lihat catatan
 *   di doGet(). Frontend (config.js, absen-siswa.html, dashboard-guru.html)
 *   sudah disesuaikan memakai apiPost untuk action-action ini.
 */

// ============ KONFIGURASI ============
const SHEET_PENGGUNA = 'Pengguna';
const SHEET_GURU = 'Pengguna';
const SHEET_SISWA = 'Siswa';
const SHEET_ABSENSI = 'Absensi';
const SHEET_SESSIONS = 'Sessions';
const MAPEL_LIST = ['TIK', 'KKA'];
const STATUS_LIST = ['Hadir', 'Izin', 'Sakit', 'Alfa'];
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 jam

// ============ SETUP (jalankan manual sekali dari editor Apps Script) ============
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const pengguna = ss.getSheetByName('Pengguna') || ss.insertSheet('Pengguna');
  pengguna.clear();
  pengguna.appendRow(['id', 'email', 'password_hash', 'nama', 'role']);
  pengguna.appendRow(['1', 'admin@sekolah.edu', makePasswordHash('admin123'), 'Super Admin', 'admin']);

  const siswa = ss.getSheetByName('Siswa') || ss.insertSheet('Siswa');
  siswa.clear();
  siswa.appendRow(['id', 'nis', 'nama', 'kelas', 'wali_murid', 'status_aktif', 'email']);

  const absensi = ss.getSheetByName('Absensi') || ss.insertSheet('Absensi');
  absensi.clear();
  absensi.appendRow(['id', 'siswa_id', 'nama_siswa', 'kelas', 'mapel', 'tanggal', 'waktu', 'status', 'keterangan']);

  const sessions = ss.getSheetByName('Sessions') || ss.insertSheet('Sessions');
  sessions.clear();
  sessions.appendRow(['token', 'user_id', 'role', 'nama', 'expires_at']);

  const pengaturan = ss.getSheetByName('Pengaturan') || ss.insertSheet('Pengaturan');
  pengaturan.clear();
  pengaturan.appendRow(['key', 'value']);
  pengaturan.appendRow(['tahun_ajaran', '2023/2024']);
  pengaturan.appendRow(['semester', 'Ganjil']);
  pengaturan.appendRow(['batas_waktu_input', '14:00']);

  const log = ss.getSheetByName('LogAktivitas') || ss.insertSheet('LogAktivitas');
  log.clear();
  log.appendRow(['id', 'waktu', 'user_id', 'nama', 'action', 'detail']);

  Logger.log('Setup selesai.');
}

// ============ ENTRY POINTS ============
// PERUBAHAN: dulu checkSession, getSiswaList, getLaporan, dan getAbsensiHariIni
// dilayani lewat doGet dengan token di query string (?token=...). Token di URL
// berisiko bocor lewat log eksekusi Apps Script (tercatat di sana untuk siapa
// pun yang punya akses editor project), riwayat browser, atau header Referer.
// Semua action yang butuh token sekarang HANYA dilayani lewat doPost (token di
// body request, seperti checkin/login yang sudah begitu sejak awal). doGet
// disisakan hanya untuk 'ping' yang memang tidak butuh autentikasi.
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case 'ping':
        result = { ok: true, message: 'pong' };
        break;
      case 'getPublicAccounts':
        result = getPublicAccounts();
        break;
      default:
        result = { ok: false, error: 'Action "' + action + '" harus dipanggil lewat POST, bukan GET. Pastikan URL Apps Script diakhiri dengan /exec' };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    switch (action) {
      case 'loginWithGoogle':
        result = loginWithGoogle(body.email, body.name, body.picture, body.expectedRole);
        break;
      case 'getPublicAccounts':
        result = getPublicAccounts();
        break;
      case 'getPengaturan':
        result = getPengaturan();
        break;
      case 'savePengaturan':
        result = requireRole(body.token, ['admin', 'kepsek'], (session) => savePengaturan(session, body.settings));
        break;
      case 'getLogAktivitas':
        result = requireRole(body.token, ['admin', 'kepsek'], () => getLogAktivitas());
        break;
      case 'logout':
        result = logout(body.token);
        break;
      case 'checkSession':
        result = handleCheckSession(body.token);
        break;
      case 'checkin':
        result = requireRole(body.token, 'siswa', (session) => checkin(session, body.mapel));
        break;
      case 'getAbsensiHariIni':
        result = requireRole(body.token, 'siswa', (session) => getAbsensiHariIni(session.user_id));
        break;
      case 'getSiswaList':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], () => getSiswaList(body.kelas));
        break;
      case 'getStatusHarian':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], () => getStatusHarian(body.kelas, body.mapel, body.tanggal));
        break;
      case 'setAbsensiStatus':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          setAbsensiStatus(session, body.siswa_id, body.mapel, body.tanggal, body.status, body.keterangan)
        );
        break;
      case 'saveAbsensiBatch':
      case 'setAbsensiStatusBatch':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          saveAbsensiBatch(session, body.items, body.mapel, body.tanggal)
        );
        break;
      case 'setAbsensiStatusBulk':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          setAbsensiStatusBulk(session, body.siswa_ids, body.mapel, body.tanggal, body.status)
        );
        break;
      case 'getLaporan':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], () =>
          getLaporan(body.tanggal_mulai, body.tanggal_selesai, body.kelas, body.mapel)
        );
        break;
      case 'createSiswa':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          createSiswa(session, body.nis, body.nama, body.kelas, body.wali_murid, body.status_aktif, body.email)
        );
        break;
      case 'importSiswaBulk':
      case 'importSiswaCSV':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) => importSiswaBulk(session, body.items));
        break;
      case 'updateSiswa':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          updateSiswa(session, body.id, body.nis, body.nama, body.kelas, body.wali_murid, body.status_aktif, body.email)
        );
        break;
      case 'deleteSiswa':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) => deleteSiswa(session, body.id));
        break;
      case 'deleteSiswaBatch':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) => deleteSiswaBatch(session, body.ids));
        break;
      case 'getGuruList':
      case 'getPengguna':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], () => getGuruList());
        break;
      case 'createGuru':
      case 'createPengguna':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          createPengguna(session, body.nama, body.email || body.username, body.role, body.password)
        );
        break;
      case 'updateGuru':
      case 'updatePengguna':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          updatePengguna(session, body.id, body.nama, body.email || body.username, body.role)
        );
        break;
      case 'resetGuruPassword':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) => resetGuruPassword(session, body.id, body.password));
        break;
      case 'deleteGuru':
      case 'deletePengguna':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) => deleteGuru(session, body.id));
        break;
      case 'changeOwnPassword':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) => changeOwnPassword(session, body.old_password, body.new_password));
        break;
      case 'changeSiswaPassword':
        result = requireRole(body.token, 'siswa', (session) => changeSiswaPassword(session, body.old_password, body.new_password));
        break;
      case 'getRekapBulanan':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], () =>
          getRekapBulanan(body.bulan, body.tahun, body.kelas, body.tanggal)
        );
        break;
      case 'resetAbsensi':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          resetAbsensi(session, body.kelas, body.mapel, body.tanggal)
        );
        break;
      case 'getRiwayatSiswa':
        result = requireRole(body.token, 'siswa', (session) =>
          getRiwayatSiswa(session, body.bulan, body.tahun)
        );
        break;
      case 'getOverview':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], () =>
          getOverview(body.tanggal_mulai, body.tanggal_selesai)
        );
        break;
      default:
        result = { ok: false, error: 'Action tidak dikenal: ' + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}


function logAction(userId, nama, action, detail) {
  try {
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const waktu = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    const logId = Utilities.getUuid();
    getSheet('LogAktivitas').appendRow([logId, waktu, userId, nama, action, detail]);
  } catch(e) {}
}

function getLogAktivitas() {
  const rows = getSheet('LogAktivitas').getDataRange().getValues();
  const data = [];
  for(let i=rows.length-1; i>=1; i--) { 
    data.push({
      id: rows[i][0], waktu: rows[i][1], user_id: rows[i][2], 
      nama: rows[i][3], action: rows[i][4], detail: rows[i][5]
    });
    if (data.length >= 100) break;
  }
  return { ok: true, data: data };
}

function getPengaturan() {
  const rows = getSheet('Pengaturan').getDataRange().getValues();
  const data = {};
  for(let i=1; i<rows.length; i++) {
    data[rows[i][0]] = rows[i][1];
  }
  return { ok: true, data: data };
}

function savePengaturan(session, settings) {
  if (session.role !== 'admin' && session.role !== 'kepsek') return { ok: false, error: 'Akses ditolak' };
  const sheet = getSheet('Pengaturan');
  const rows = sheet.getDataRange().getValues();
  for(let i=1; i<rows.length; i++) {
    const key = rows[i][0];
    if (settings[key] !== undefined) {
      sheet.getRange(i+1, 2).setValue(settings[key]);
    }
  }
  logAction(session.user_id, session.nama, 'Update Pengaturan', 'Mengubah pengaturan sistem');
  return { ok: true, message: 'Pengaturan berhasil disimpan' };
}

// ============ AUTH ============
function loginWithGoogle(email, name, picture, expectedRole) {
  if (!email) return { ok: false, error: 'Email tidak valid' };
  
  const targetEmail = String(email).toLowerCase().trim();
  const expRole = expectedRole ? String(expectedRole).toLowerCase().trim() : null;

  const sheetPengguna = getSheet('Pengguna');
  const rowsPengguna = sheetPengguna.getDataRange().getValues();
  for (let i = 1; i < rowsPengguna.length; i++) {
    const row = rowsPengguna[i];
    const id = row[0];
    const rowEmail = String(row[1] || '').toLowerCase().trim();
    const rowNama = row[3] || name || 'User';
    const actualRole = String(row[4] || 'admin').toLowerCase().trim();
    
    if (rowEmail === targetEmail) {
      if (expRole && expRole !== actualRole) {
        const actualLabel = actualRole === 'admin' ? 'Administrator' : actualRole === 'kepsek' ? 'Kepala Sekolah' : actualRole === 'guru' ? 'Guru' : actualRole;
        const expectedLabel = expRole === 'admin' ? 'Administrator' : expRole === 'kepsek' ? 'Kepala Sekolah' : expRole === 'guru' ? 'Guru' : expRole === 'siswa' ? 'Siswa' : expRole;
        return { 
          ok: false, 
          error: 'Akses Ditolak: Akun Anda terdaftar sebagai ' + actualLabel + ', bukan ' + expectedLabel + '. Silakan login melalui portal ' + actualLabel + '.' 
        };
      }
      const token = createSession(id, actualRole, rowNama);
      logAction(id, rowNama, 'Login', 'Berhasil login sebagai ' + actualRole);
      return { ok: true, token: token, nama: rowNama, role: actualRole };
    }
  }

  const sheetSiswa = getSheet('Siswa');
  const rowsSiswa = sheetSiswa.getDataRange().getValues();
  for (let i = 1; i < rowsSiswa.length; i++) {
    const [id, nis, rowNama, kelas, wali, status, rowEmail] = rowsSiswa[i];
    const studentEmail = rowEmail ? String(rowEmail).toLowerCase().trim() : '';
    if (studentEmail && studentEmail === targetEmail) {
      if (status !== 'Aktif') return { ok: false, error: 'Akun siswa tidak aktif' };
      if (expRole && expRole !== 'siswa') {
        const expectedLabel = expRole === 'admin' ? 'Administrator' : expRole === 'kepsek' ? 'Kepala Sekolah' : expRole === 'guru' ? 'Guru' : expRole;
        return { 
          ok: false, 
          error: 'Akses Ditolak: Akun Anda terdaftar sebagai Siswa, bukan ' + expectedLabel + '. Silakan login melalui portal Siswa.' 
        };
      }
      const token = createSession(id, 'siswa', rowNama);
      logAction(id, rowNama, 'Login', 'Berhasil login sebagai siswa');
      return { ok: true, token: token, nama: rowNama, kelas: kelas, role: 'siswa' };
    }
  }

  return { ok: false, error: 'Akun dengan email ' + email + ' tidak terdaftar di sistem.' };
}

function getPublicAccounts() {
  const accounts = [];
  
  try {
    const sheetPengguna = getSheet('Pengguna');
    const rowsPengguna = sheetPengguna.getDataRange().getValues();
    for (let i = 1; i < rowsPengguna.length; i++) {
      const row = rowsPengguna[i];
      const id = String(row[0] || ('user-' + i));
      const email = String(row[1] || '').trim();
      const nama = String(row[3] || '').trim();
      const role = String(row[4] || 'admin').trim();
      if (email) {
        accounts.push({ id: id, email: email, username: email, nama: nama || email, role: role });
      }
    }
  } catch (e) {}

  try {
    const sheetSiswa = getSheet('Siswa');
    const rowsSiswa = sheetSiswa.getDataRange().getValues();
    for (let i = 1; i < rowsSiswa.length; i++) {
      const [id, nis, rowNama, kelas, wali, status, rowEmail] = rowsSiswa[i];
      const email = String(rowEmail || '').trim();
      const nama = String(rowNama || '').trim();
      if (email && String(status).trim() === 'Aktif') {
        accounts.push({ id: String(id || ('siswa-' + i)), email: email, username: email, nama: nama || email, role: 'siswa', kelas: kelas || '' });
      }
    }
  } catch (e) {}

  return { ok: true, data: accounts };
}

function createSession(userId, role, nama) {
  const token = Utilities.getUuid();
  const expiresAt = new Date().getTime() + SESSION_DURATION_MS;
  getSheet(SHEET_SESSIONS).appendRow([token, userId, role, nama, expiresAt]);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const sheet = getSheet(SHEET_SESSIONS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [t, userId, role, nama, expiresAt] = rows[i];
    if (t === token) {
      if (new Date().getTime() > Number(expiresAt)) {
        sheet.deleteRow(i + 1); // bersihkan session basi saat ketemu, biar sheet tidak membengkak
        return null;
      }
      return { user_id: userId, role: role, nama: nama, rowIndex: i + 1 };
    }
  }
  return null;
}

/**
 * Hapus semua session yang sudah kadaluarsa. Sheet "Sessions" hanya
 * dibersihkan otomatis untuk token yang sedang dicek (lazy, di getSession),
 * jadi token yang ditinggal begitu saja (browser ditutup tanpa logout)
 * tetap menumpuk dan lama-lama memperlambat SEMUA request berbasis login.
 * Jalankan fungsi ini manual dari editor, atau pasang time-based trigger
 * (Triggers > Add Trigger > cleanupExpiredSessions > Time-driven > Daily).
 */
function cleanupExpiredSessions() {
  const sheet = getSheet(SHEET_SESSIONS);
  const rows = sheet.getDataRange().getValues();
  const now = new Date().getTime();
  let deleted = 0;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (now > Number(rows[i][4])) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  Logger.log(deleted + ' session kadaluarsa dihapus.');
  return deleted;
}

function handleCheckSession(token) {
  const session = getSession(token);
  if (!session) return { ok: false, error: 'Session tidak valid atau kadaluarsa' };
  return { ok: true, role: session.role, nama: session.nama, user_id: session.user_id };
}

// Menjalankan fn hanya jika token valid dan role sesuai. fn menerima (session).
function requireRole(token, allowedRoles, fn) {
  const session = getSession(token);
  if (!session) return { ok: false, error: 'Session tidak valid atau kadaluarsa, silakan login ulang' };
  if (typeof allowedRoles === 'string') allowedRoles = [allowedRoles];
  if (!allowedRoles.includes(session.role)) return { ok: false, error: 'Akses ditolak untuk role ini' };
  return fn(session);
}

/**
 * Normalisasi nilai kolom "tanggal" dari Sheet ke string "yyyy-MM-dd".
 *
 * Meskipun tanggal ditulis sebagai string "yyyy-MM-dd" saat appendRow,
 * Google Sheets otomatis mendeteksi pola tanggal itu dan mengonversi sel
 * menjadi objek Date asli. Akibatnya getValues() bisa mengembalikan Date
 * ATAU string tergantung histori sel tsb. Semua perbandingan tanggal harus
 * lewat fungsi ini dulu supaya konsisten -- tanpanya, Date dibandingkan
 * dengan string via ===/</> selalu bernilai salah (silent bug).
 */
function normalizeTanggal(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  let str = String(value).trim();
  if (str.indexOf('T') !== -1) {
    str = str.split('T')[0];
  }
  if (str.indexOf(' ') !== -1) {
    str = str.split(' ')[0];
  }
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/\-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return year + '-' + month + '-' + day;
  }
  if (/^\d{4}[\/]\d{1,2}[\/]\d{1,2}$/.test(str)) {
    const parts = str.split('/');
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  if (/^\d{4}\-\d{1,2}\-\d{1,2}$/.test(str)) {
    const parts = str.split('-');
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  return str;
}

// ============ CHECK-IN SISWA ============
function checkin(session, mapel) {
  if (MAPEL_LIST.indexOf(mapel) === -1) {
    return { ok: false, error: 'Mata pelajaran tidak valid. Pilih TIK atau KKA.' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // tunggu maksimal 15 detik jika ada proses lain
  } catch (e) {
    return { ok: false, error: 'Server sibuk, silakan coba lagi.' };
  }

  try {
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const now = new Date();
    const tanggal = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const waktu = Utilities.formatDate(now, tz, 'HH:mm:ss');

    const absensiSheet = getSheet(SHEET_ABSENSI);
    const existing = findAbsensiHariIni(absensiSheet, session.user_id, mapel, tanggal);
    if (existing) {
      return { ok: false, error: 'Kamu sudah check-in untuk ' + mapel + ' hari ini pukul ' + existing.waktu };
    }

    const siswaData = getSiswaById(session.user_id);
    const kelas = siswaData ? siswaData.kelas : '';
    const nama = siswaData ? siswaData.nama : session.nama;
    const newId = Utilities.getUuid();

    absensiSheet.appendRow([newId, session.user_id, nama, kelas, mapel, tanggal, waktu, 'Hadir']);
    return { ok: true, message: 'Check-in ' + mapel + ' berhasil pukul ' + waktu, tanggal: tanggal, waktu: waktu };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cek apakah siswa sudah check-in untuk mapel+tanggal tertentu.
 *
 * Versi sebelumnya membaca SELURUH sheet Absensi (getDataRange) di dalam
 * lock global setiap kali ada yang check-in. Itu berarti: (1) semua siswa
 * lain ikut antre menunggu lock selama pembacaan itu berlangsung, dan
 * (2) makin banyak riwayat absensi menumpuk sepanjang tahun ajaran, makin
 * lambat SETIAP check-in -- termasuk punya siswa yang baru pertama kali
 * absen hari itu.
 *
 * Perbaikan di sini memakai TextFinder untuk mencari baris milik siswa ini
 * SAJA di kolom siswa_id (pencarian dijalankan di sisi server Sheets, bukan
 * loop JS di atas seluruh data), lalu hanya baris yang cocok itu yang benar-
 * benar dibaca detail kolomnya. Untuk satu siswa, jumlah baris historisnya
 * jauh lebih kecil daripada total baris seluruh sekolah, jadi ini jauh lebih
 * ringan -- terutama begitu data absensi sudah menumpuk berbulan-bulan.
 *
 * Catatan: ini bukan index database sungguhan (Apps Script/Sheets memang
 * tidak punya itu), jadi untuk sekolah yang SANGAT besar dengan histori
 * bertahun-tahun tanpa pernah diarsipkan, pertimbangkan memisahkan sheet
 * Absensi per bulan/semester supaya sheet aktif tetap kecil.
 */
function findAbsensiHariIni(sheet, siswaId, mapel, tanggal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const finder = sheet.getRange('B2:B' + lastRow).createTextFinder(String(siswaId)).matchEntireCell(true);
  const matches = finder.findAll();

  for (let i = 0; i < matches.length; i++) {
    const row = matches[i].getRow();
    const [rowMapel, rowTanggal, rowWaktu] = sheet.getRange(row, 5, 1, 3).getValues()[0]; // mapel, tanggal, waktu
    if (rowMapel === mapel && normalizeTanggal(rowTanggal) === tanggal) {
      return { waktu: rowWaktu };
    }
  }
  return null;
}

function getAbsensiHariIni(siswaId) {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const rows = getSheet(SHEET_ABSENSI).getDataRange().getValues();
  const status = {};
  MAPEL_LIST.forEach((m) => (status[m] = null));
  for (let i = 1; i < rows.length; i++) {
    const [, siswaIdRow, , , mapel, rowTanggal, waktu, statusRow] = rows[i];
    if (String(siswaIdRow) === String(siswaId) && normalizeTanggal(rowTanggal) === tanggal) {
      status[mapel] = waktu || statusRow || 'Tercatat';
    }
  }
  return { ok: true, tanggal: tanggal, status: status };
}

/**
 * Sama seperti findAbsensiHariIni, tapi mengembalikan nomor baris (bukan
 * cuma waktu) dan status saat ini -- dipakai setAbsensiStatus() untuk tahu
 * apakah harus UPDATE baris yang sudah ada (mis. siswa sudah check-in Hadir
 * sendiri) atau APPEND baris baru (siswa belum pernah tercatat sama sekali
 * untuk mapel+tanggal itu).
 */
function findAbsensiRow(sheet, siswaId, mapel, tanggal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const finder = sheet.getRange('B2:B' + lastRow).createTextFinder(String(siswaId)).matchEntireCell(true);
  const matches = finder.findAll();

  for (let i = 0; i < matches.length; i++) {
    const row = matches[i].getRow();
    const [rowMapel, rowTanggal, rowWaktu, rowStatus, rowKeterangan] = sheet.getRange(row, 5, 1, 5).getValues()[0];
    if (rowMapel === mapel && normalizeTanggal(rowTanggal) === tanggal) {
      return { row: row, waktu: rowWaktu, status: rowStatus, keterangan: rowKeterangan };
    }
  }
  return null;
}

/**
 * Guru menandai/mengoreksi status kehadiran siswa secara manual (Izin, Sakit,
 * Alfa -- atau koreksi balik ke Hadir kalau salah tandai). Ini melengkapi
 * checkin(), yang HANYA bisa mencatat "Hadir" dan cuma bisa dipanggil siswa
 * yang bersangkutan untuk tanggal hari itu sendiri.
 *
 * - Kalau baris Absensi utk siswa+mapel+tanggal itu SUDAH ada (mis. siswa
 *   sudah check-in Hadir lewat absen-siswa.html), statusnya DIGANTI di
 *   tempat -- tidak membuat baris duplikat.
 * - Kalau belum ada baris sama sekali (siswa tidak check-in), baris baru
 *   dibuat dengan kolom "waktu" kosong, karena ini bukan check-in nyata.
 * - Pakai LockService yang sama dengan checkin() supaya tidak balapan kalau
 *   siswa kebetulan check-in sendiri persis saat guru menandainya.
 */
function setAbsensiStatus(session, siswaId, mapel, tanggal, status, keterangan) {
  if (!siswaId || !mapel || !tanggal || !status) return { ok: false, error: 'Data tidak lengkap' };
  const tanggalNorm = normalizeTanggal(tanggal);

  const siswaData = getSiswaById(siswaId);
  if (!siswaData) return { ok: false, error: 'Siswa tidak ditemukan' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, error: 'Server sibuk' }; }

  try {
    const sheet = getSheet(SHEET_ABSENSI);
    const existing = findAbsensiRow(sheet, siswaId, mapel, tanggalNorm);
    if (existing) {
      sheet.getRange(existing.row, 8, 1, 2).setValues([[status, keterangan || '']]);
    } else {
      const newId = Utilities.getUuid();
      sheet.appendRow([newId, siswaId, siswaData.nama, siswaData.kelas, mapel, tanggalNorm, '', status, keterangan || '']);
    }
    logAction(session.user_id, session.nama, 'Set Absensi', `Set ${siswaData.nama} -> ${status}`);
    return { ok: true, message: 'Status berhasil diset' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Versi massal dari setAbsensiStatus() -- dipakai tombol "Tandai Semua" di
 * Dashboard Guru > Tandai Kehadiran, supaya guru bisa menandai satu status
 * yang sama (mis. semua Hadir, atau semua Alfa kalau jam pelajaran kosong)
 * untuk seluruh siswa yang sedang tampil di tabel, tanpa klik satu per satu.
 *
 * Beda dari memanggil setAbsensiStatus() berkali-kali dari client: di sini
 * LockService HANYA diambil SEKALI untuk seluruh batch (bukan per siswa),
 * supaya lebih cepat dan tidak ada siswa lain yang menyelinap masuk baris
 * Absensi di tengah-tengah proses. Siswa yang gagal (mis. ID tidak valid)
 * tidak menggagalkan siswa lain -- dikembalikan di array `failed`.
 */
function setAbsensiStatusBulk(session, siswaIds, mapel, tanggal, status) {
  if (!Array.isArray(siswaIds) || siswaIds.length === 0) {
    return { ok: false, error: 'Tidak ada siswa yang dipilih' };
  }
  if (!mapel || !tanggal || !status) {
    return { ok: false, error: 'Data tidak lengkap' };
  }
  if (MAPEL_LIST.indexOf(mapel) === -1) {
    return { ok: false, error: 'Mata pelajaran tidak valid' };
  }
  if (STATUS_LIST.indexOf(status) === -1) {
    return { ok: false, error: 'Status tidak valid. Pilih Hadir, Izin, Sakit, atau Alfa.' };
  }
  const tanggalNorm = normalizeTanggal(tanggal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalNorm)) {
    return { ok: false, error: 'Format tanggal tidak valid' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: 'Server sibuk, silakan coba lagi.' };
  }

  try {
    const sheet = getSheet(SHEET_ABSENSI);
    let updated = 0;
    const failed = [];
    siswaIds.forEach((siswaId) => {
      const siswaData = getSiswaById(siswaId);
      if (!siswaData) {
        failed.push(String(siswaId));
        return;
      }
      const existing = findAbsensiRow(sheet, siswaId, mapel, tanggalNorm);
      if (existing) {
        sheet.getRange(existing.row, 8).setValue(status); // kolom H = status
      } else {
        const newId = Utilities.getUuid();
        sheet.appendRow([newId, siswaId, siswaData.nama, siswaData.kelas, mapel, tanggalNorm, '', status]);
      }
      updated++;
    });
    return {
      ok: true,
      updated: updated,
      failed: failed,
      status: status,
      message: updated + ' siswa ditandai ' + status + (failed.length ? (', ' + failed.length + ' gagal') : ''),
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Simpan absensi secara batch/massal untuk daftar siswa dengan status dan keterangan masing-masing.
 * LockService hanya diambil sekali untuk seluruh batch demi kecepatan dan reliabilitas.
 */
function saveAbsensiBatch(session, items, mapel, tanggal) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Tidak ada data presensi yang dikirim' };
  }
  if (!mapel || !tanggal) {
    return { ok: false, error: 'Mata pelajaran dan tanggal harus diisi' };
  }

  let cleanM = mapel ? String(mapel).trim() : 'TIK';
  if (cleanM.toUpperCase().startsWith('TIK')) cleanM = 'TIK';
  else if (cleanM.toUpperCase().startsWith('KKA')) cleanM = 'KKA';

  const tanggalNorm = normalizeTanggal(tanggal);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return { ok: false, error: 'Server sibuk saat menyimpan batch presensi, silakan coba lagi.' };
  }

  try {
    const sheet = getSheet(SHEET_ABSENSI);
    const data = sheet.getDataRange().getValues();
    
    // Map untuk mencari baris absensi yang sudah ada (Key: siswaId_mapel_tanggal -> 0-indexed row in data)
    const existingMap = {};
    for (let r = 1; r < data.length; r++) {
      const rowSId = String(data[r][1] || '').trim();
      let rowM = String(data[r][4] || '').trim();
      if (rowM.toUpperCase().startsWith('TIK')) rowM = 'TIK';
      else if (rowM.toUpperCase().startsWith('KKA')) rowM = 'KKA';

      const rowT = normalizeTanggal(data[r][5]);
      if (rowSId && rowM && rowT) {
        existingMap[`${rowSId}_${rowM}_${rowT}`] = r;
      }
    }

    // Map untuk data siswa dari SHEET_SISWA
    const siswaRows = getSheet(SHEET_SISWA).getDataRange().getValues();
    const siswaMap = {};
    for (let i = 1; i < siswaRows.length; i++) {
      const [sId, , sNama, sKelas] = siswaRows[i];
      if (sId) siswaMap[String(sId).trim()] = { nama: sNama, kelas: sKelas };
    }

    let updatedCount = 0;

    items.forEach(item => {
      const siswaId = String(item.siswa_id || item.id || '').trim();
      if (!siswaId) return;

      const status = item.status || 'Hadir';
      const keterangan = item.keterangan || '';
      const siswaData = siswaMap[siswaId] || { nama: item.nama || 'Siswa', kelas: item.kelas || '' };
      const key = `${siswaId}_${cleanM}_${tanggalNorm}`;

      if (existingMap.hasOwnProperty(key)) {
        const rIndex = existingMap[key];
        data[rIndex][7] = status;      // Kolom H (index 7) = status
        data[rIndex][8] = keterangan;  // Kolom I (index 8) = keterangan
      } else {
        const newId = Utilities.getUuid();
        data.push([newId, siswaId, siswaData.nama, siswaData.kelas, cleanM, tanggalNorm, '', status, keterangan]);
        existingMap[key] = data.length - 1;
      }
      updatedCount++;
    });

    // Write updated array back to sheet in 1 single bulk call
    if (data.length > 0) {
      sheet.getRange(1, 1, data.length, 9).setValues(data);
    }

    logAction(session.user_id, session.nama, 'Save Absensi Batch', `Simpan batch ${updatedCount} siswa untuk ${cleanM} tanggal ${tanggalNorm}`);
    return { ok: true, count: updatedCount, message: `Berhasil menyimpan presensi ${updatedCount} siswa` };
  } catch (err) {
    return { ok: false, error: 'Gagal menyimpan batch: ' + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rekap status kehadiran satu kelas untuk satu mapel+tanggal. Beda dengan
 * getLaporan() (yang cuma menampilkan baris yang SUDAH ada di Absensi),
 * fungsi ini menggabungkan seluruh roster Siswa dengan baris Absensi yang
 * cocok -- jadi guru bisa lihat siapa saja yang BELUM tercatat sama sekali
 * (status null) dan menandainya lewat setAbsensiStatus().
 */
function getStatusHarian(kelas, mapel, tanggal) {
  let cleanMapel = mapel ? String(mapel).trim() : 'TIK';
  if (cleanMapel.startsWith('TIK')) cleanMapel = 'TIK';
  else if (cleanMapel.startsWith('KKA')) cleanMapel = 'KKA';

  const tanggalNorm = normalizeTanggal(tanggal);

  const siswaRows = getSheet(SHEET_SISWA).getDataRange().getValues();
  const roster = [];
  for (let i = 1; i < siswaRows.length; i++) {
    const [id, , nama, rowKelas] = siswaRows[i];
    if (!kelas || kelas === rowKelas) roster.push({ id: id, nama: nama, kelas: rowKelas });
  }

  const absensiRows = getSheet(SHEET_ABSENSI).getDataRange().getValues();
  const statusById = {};
  for (let i = 1; i < absensiRows.length; i++) {
    const [, siswaId, , , rowMapel, rowTanggal, waktu, status, keterangan] = absensiRows[i];
    const rMapel = String(rowMapel || '').trim();
    if ((rMapel === cleanMapel || rMapel === mapel) && normalizeTanggal(rowTanggal) === tanggalNorm) {
      statusById[siswaId] = { status: status, waktu: waktu, keterangan: keterangan || '' };
    }
  }

  const data = roster
    .map((s) => ({
      siswa_id: s.id,
      nama: s.nama,
      kelas: s.kelas,
      status: statusById[s.id] ? statusById[s.id].status : null,
      waktu: statusById[s.id] ? statusById[s.id].waktu : null,
      keterangan: statusById[s.id] ? statusById[s.id].keterangan : '',
    }))
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));

  return { ok: true, tanggal: tanggalNorm, mapel: cleanMapel, data: data };
}

/**
 * Reset / Hapus seluruh data presensi untuk tanggal tertentu (seluruh kelas & mapel jika kelas/mapel tidak diisi).
 */
function resetAbsensi(session, kelasFilter, mapelFilter, tanggalInput) {
  if (!tanggalInput) {
    return { ok: false, error: 'Tanggal wajib diisi' };
  }

  const tanggalNorm = normalizeTanggal(tanggalInput);
  const kelasNorm = kelasFilter ? String(kelasFilter).trim().toLowerCase() : null;
  const mapelNorm = mapelFilter ? String(mapelFilter).trim().toLowerCase() : null;

  const sheet = getSheet(SHEET_ABSENSI);
  const rows = sheet.getDataRange().getValues();
  let deletedCount = 0;

  for (let i = rows.length - 1; i >= 1; i--) {
    const [, , , rowKelas, rowMapel, rowTanggal] = rows[i];
    const rTanggal = normalizeTanggal(rowTanggal);
    const rKelas = String(rowKelas || '').trim().toLowerCase();
    const rMapel = String(rowMapel || '').trim().toLowerCase();

    const matchTanggal = (rTanggal === tanggalNorm);
    const matchKelas = !kelasNorm || (rKelas === kelasNorm || !rowKelas);
    const matchMapel = !mapelNorm || (rMapel === mapelNorm);

    if (matchTanggal && matchKelas && matchMapel) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }

  const scopeInfo = (kelasFilter && mapelFilter) 
    ? mapelFilter + ' kelas ' + kelasFilter 
    : 'SELURUH kelas & mata pelajaran';

  logAction(session, 'RESET_ABSENSI', 'Reset presensi ' + scopeInfo + ' tanggal ' + tanggalNorm + ' (' + deletedCount + ' baris)');
  return { 
    ok: true, 
    message: 'Seluruh data presensi pada tanggal ' + tanggalNorm + ' berhasil direset (' + deletedCount + ' data terhapus).', 
    count: deletedCount 
  };
}

// ============ CRUD SISWA (guru) ============
function getSiswaList(kelasFilter) {
  const rows = getSheet(SHEET_SISWA).getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, nis, nama, kelas, wali, status, email] = rows[i];
    if (!kelasFilter || kelasFilter === kelas) {
      list.push({ id, nis, nama, kelas, wali_murid: wali, status_aktif: status, email });
    }
  }
  return { ok: true, data: list };
}


function getSiswaById(id) {
  const rows = getSheet(SHEET_SISWA).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return { id: rows[i][0], nis: rows[i][1], nama: rows[i][2], kelas: rows[i][3], wali_murid: rows[i][4], status_aktif: rows[i][5], email: rows[i][6] };
    }
  }
  return null;
}

function createSiswa(session, nis, nama, kelas, wali, status, email) {
  if (!nis || !nama || !kelas) return { ok: false, error: 'Field wajib diisi' };
  const sheet = getSheet('Siswa');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(nis)) return { ok: false, error: 'NIS sudah terdaftar' };
  }
  const id = Utilities.getUuid();
  sheet.appendRow([id, nis, nama, kelas, wali, status, email]);
  logAction(session.user_id, session.nama, 'Tambah Siswa', 'Menambah siswa ' + nama);
  return { ok: true, id: id };
}


/**
 * Import banyak siswa sekaligus dari CSV (dikirim frontend sebagai array item).
 * Sengaja pakai SATU batch read (cek duplikat) + SATU batch write (setValues),
 * bukan appendRow per baris, supaya import 50-100 siswa tidak jadi 50-100
 * operasi Sheets API terpisah yang lambat.
 */
function importSiswaBulk(session, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Tidak ada data untuk diimport' };
  }
  if (items.length > 500) {
    return { ok: false, error: 'Maksimal 500 baris per import, pecah jadi beberapa file.' };
  }

  const sheet = getSheet(SHEET_SISWA);
  const existingRows = sheet.getDataRange().getValues();
  const existingNis = new Set();
  for (let i = 1; i < existingRows.length; i++) existingNis.add(String(existingRows[i][1]));

  const toAppend = [];
  const results = [];
  const seenInBatch = new Set();

  items.forEach((item, idx) => {
    const nis = String(item.nis || '').trim();
    const nama = String(item.nama || '').trim();
    const kelas = String(item.kelas || '').trim();
    const wali = String(item.wali_murid || '').trim();
    const status = String(item.status_aktif || 'Aktif').trim();
    const email = String(item.email || '').trim();

    if (!nis || !nama || !kelas) {
      results.push({ index: idx, nis: nis, ok: false, error: 'Ada kolom wajib yang kosong' });
      return;
    }
    if (existingNis.has(nis)) {
      results.push({ index: idx, nis: nis, ok: false, error: 'NIS sudah terdaftar' });
      return;
    }
    if (seenInBatch.has(nis)) {
      results.push({ index: idx, nis: nis, ok: false, error: 'NIS duplikat dalam file' });
      return;
    }
    seenInBatch.add(nis);
    const id = Utilities.getUuid();
    toAppend.push([id, nis, nama, kelas, wali, status, email]);
    results.push({ index: idx, nis: nis, nama: nama, kelas: kelas, ok: true, id: id });
  });

  if (toAppend.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, toAppend.length, 7).setValues(toAppend);
  }

  const successCount = results.filter((r) => r.ok).length;
  if (session) {
    logAction(session.user_id, session.nama, 'Import Siswa Bulk', `Mengimport ${successCount} siswa`);
  }
  return { ok: true, total: items.length, success: successCount, failed: items.length - successCount, results: results };
}

function updateSiswa(session, id, nis, nama, kelas, wali, status, email) {
  const sheet = getSheet(SHEET_SISWA);
  const rows = sheet.getDataRange().getValues();

  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { targetIndex = i; break; }
  }
  if (targetIndex === -1) return { ok: false, error: 'Siswa tidak ditemukan' };

  if (nis && String(nis) !== String(rows[targetIndex][1])) {
    for (let i = 1; i < rows.length; i++) {
      if (i !== targetIndex && String(rows[i][1]) === String(nis)) {
        return { ok: false, error: 'NIS sudah dipakai siswa lain' };
      }
    }
  }

  const r = targetIndex + 1;
  if (nis !== undefined && nis !== null) sheet.getRange(r, 2).setValue(nis);
  if (nama !== undefined && nama !== null) sheet.getRange(r, 3).setValue(nama);
  if (kelas !== undefined && kelas !== null) sheet.getRange(r, 4).setValue(kelas);
  if (wali !== undefined && wali !== null) sheet.getRange(r, 5).setValue(wali);
  if (status !== undefined && status !== null) sheet.getRange(r, 6).setValue(status);
  if (email !== undefined && email !== null) sheet.getRange(r, 7).setValue(email);

  if (session) {
    logAction(session.user_id, session.nama, 'Update Siswa', 'Mengubah data siswa ' + (nama || rows[targetIndex][2]));
  }
  return { ok: true };
}

function deleteSiswa(session, id) {
  const sheet = getSheet(SHEET_SISWA);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      const nama = rows[i][2];
      sheet.deleteRow(i + 1);
      if (session) {
        logAction(session.user_id, session.nama, 'Hapus Siswa', 'Menghapus siswa ' + nama);
      }
      return { ok: true };
    }
  }
  return { ok: false, error: 'Siswa tidak ditemukan' };
}

function deleteSiswaBatch(session, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'Tidak ada ID siswa yang dipilih' };
  }
  const sheet = getSheet(SHEET_SISWA);
  const rows = sheet.getDataRange().getValues();
  const idsToDelete = new Set(ids.map(id => String(id)));

  let deletedCount = 0;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (idsToDelete.has(String(rows[i][0]))) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }

  if (session && deletedCount > 0) {
    logAction(session.user_id, session.nama, 'Hapus Siswa Batch', `Menghapus ${deletedCount} siswa`);
  }
  return { ok: true, count: deletedCount };
}

// ============ MANAJEMEN AKUN GURU/ADMIN (guru) ============
// Halaman admin.html memakai action-action ini untuk mengelola akun Guru/Admin
// (yang sebelumnya cuma bisa dibuat sekali lewat setupSheets() atau edit
// manual Sheet). Catatan keamanan:
// - Password akun admin pakai skema hash yang sama dengan siswa (SHA-256 +
//   salt per-user, lihat makePasswordHash/verifyPassword) -- bukan sistem
//   terpisah yang lebih lemah.
// - Reset password admin LAIN (resetGuruPassword) sengaja TIDAK butuh
//   password lama -- ini memang wewenang admin yang sudah login (sama
//   seperti guru mereset password siswa lewat updateSiswa). Tapi ganti
//   password AKUN SENDIRI (changeOwnPassword) WAJIB konfirmasi password
//   lama dulu, supaya token/sesi yang "nyasar" (lupa logout di komputer
//   bersama, atau token dicuri) tidak otomatis bisa mengambil alih akun
//   hanya bermodal token -- tanpa tahu password aslinya, self password
//   change akan ditolak.
// - Admin tidak bisa menghapus akun sendiri saat sedang login (mencegah
//   kunci-diri-sendiri secara tidak sengaja), dan tidak bisa menghapus
//   admin terakhir yang tersisa (mencegah sistem kehilangan SEMUA akun
//   admin sehingga tidak ada yang bisa login lagi).
const PASSWORD_MIN_LENGTH = 6;

function getGuruList() {
  const rows = getSheet(SHEET_GURU).getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[0] || ('user-' + i));
    const username = String(row[1] || '').trim();
    const nama = String(row[3] || '').trim();
    const role = String(row[4] || 'admin').trim();
    if (id || username) {
      list.push({
        id: id,
        username: username,
        email: username,
        nama: nama || username,
        role: role
      });
    }
  }
  return { ok: true, data: list };
}

function isUsernameTaken(rows, username, excludeId) {
  const target = String(username).trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (excludeId && String(rows[i][0]) === String(excludeId)) continue;
    if (String(rows[i][1]).trim().toLowerCase() === target) return true;
  }
  return false;
}

function createGuru(username, password, nama) {
  return createPengguna(null, nama, username, 'admin', password);
}

function createPengguna(session, nama, email, role, password) {
  email = String(email || '').trim();
  nama = String(nama || '').trim();
  role = String(role || 'guru').trim().toLowerCase();
  password = String(password || '123456');

  if (!email || !nama) return { ok: false, error: 'Nama dan email wajib diisi' };

  const sheet = getSheet(SHEET_GURU);
  const rows = sheet.getDataRange().getValues();
  if (isUsernameTaken(rows, email)) return { ok: false, error: 'Email / Username sudah terdaftar' };

  const id = Utilities.getUuid();
  sheet.appendRow([id, email, makePasswordHash(password), nama, role]);
  if (session) logAction(session.user_id, session.nama, 'Tambah Pengguna', 'Menambahkan pengguna ' + nama + ' (' + email + ') sebagai ' + role);
  return { ok: true, id: id };
}

function updateGuru(session, id, username, nama) {
  return updatePengguna(session, id, nama, username, 'admin');
}

function updatePengguna(session, id, nama, email, role) {
  email = String(email || '').trim();
  nama = String(nama || '').trim();
  role = String(role || 'guru').trim().toLowerCase();

  if (!email || !nama) return { ok: false, error: 'Email dan nama wajib diisi' };

  const sheet = getSheet(SHEET_GURU);
  const rows = sheet.getDataRange().getValues();
  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id) || String(rows[i][1]).trim().toLowerCase() === email.toLowerCase()) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) return { ok: false, error: 'Akun tidak ditemukan' };
  if (isUsernameTaken(rows, email, rows[targetIndex][0])) return { ok: false, error: 'Email / Username sudah dipakai akun lain' };

  const r = targetIndex + 1;
  sheet.getRange(r, 2).setValue(email);
  sheet.getRange(r, 4).setValue(nama);
  sheet.getRange(r, 5).setValue(role);
  if (session) logAction(session.user_id, session.nama, 'Update Pengguna', 'Mengubah data pengguna ' + nama + ' (' + email + ')');
  return { ok: true };
}

// Reset password admin LAIN oleh admin yang sedang login -- lihat catatan
// keamanan di atas soal kenapa ini tidak butuh password lama.
function resetGuruPassword(session, id, newPassword) {
  newPassword = String(newPassword || '');
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: 'Password minimal ' + PASSWORD_MIN_LENGTH + ' karakter' };
  }

  const sheet = getSheet(SHEET_GURU);
  const rows = sheet.getDataRange().getValues();
  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { targetIndex = i; break; }
  }
  if (targetIndex === -1) return { ok: false, error: 'Akun admin tidak ditemukan' };

  sheet.getRange(targetIndex + 1, 3).setValue(makePasswordHash(newPassword));
  return { ok: true };
}

function deleteGuru(session, id) {
  if (session && String(id) === String(session.user_id)) {
    return { ok: false, error: 'Tidak bisa menghapus akun sendiri saat sedang login' };
  }

  const sheet = getSheet(SHEET_GURU);
  const rows = sheet.getDataRange().getValues();
  if (rows.length - 1 <= 1) {
    return { ok: false, error: 'Tidak bisa menghapus admin terakhir -- sistem butuh minimal 1 akun admin yang tersisa' };
  }
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      const targetNama = rows[i][3] || rows[i][1];
      sheet.deleteRow(i + 1);
      if (session) logAction(session.user_id, session.nama, 'Hapus Pengguna', 'Menghapus pengguna ' + targetNama);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Akun admin tidak ditemukan' };
}

// Ganti password AKUN SENDIRI -- wajib konfirmasi password lama (lihat
// catatan keamanan di atas).
function changeOwnPassword(session, oldPassword, newPassword) {
  oldPassword = String(oldPassword || '');
  newPassword = String(newPassword || '');
  if (!oldPassword || !newPassword) return { ok: false, error: 'Password lama dan password baru wajib diisi' };
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: 'Password baru minimal ' + PASSWORD_MIN_LENGTH + ' karakter' };
  }

  const sheet = getSheet(SHEET_GURU);
  const rows = sheet.getDataRange().getValues();
  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(session.user_id)) { targetIndex = i; break; }
  }
  if (targetIndex === -1) return { ok: false, error: 'Akun tidak ditemukan' };

  const currentHash = rows[targetIndex][2];
  if (!verifyPassword(oldPassword, currentHash)) {
    return { ok: false, error: 'Password lama salah' };
  }
  sheet.getRange(targetIndex + 1, 3).setValue(makePasswordHash(newPassword));
  return { ok: true };
}

function changeSiswaPassword(session, oldPassword, newPassword) {
  oldPassword = String(oldPassword || '');
  newPassword = String(newPassword || '');
  if (!oldPassword || !newPassword) return { ok: false, error: 'Password lama dan password baru wajib diisi' };
  if (newPassword.length < 6) {
    return { ok: false, error: 'Password baru minimal 6 karakter' };
  }

  const sheet = getSheet(SHEET_SISWA);
  const rows = sheet.getDataRange().getValues();
  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(session.user_id)) { targetIndex = i; break; }
  }
  if (targetIndex === -1) return { ok: false, error: 'Akun tidak ditemukan' };

  const currentHash = rows[targetIndex][2];
  if (!verifyPassword(oldPassword, currentHash)) {
    return { ok: false, error: 'Password lama salah' };
  }
  sheet.getRange(targetIndex + 1, 3).setValue(makePasswordHash(newPassword));
  return { ok: true };
}

// ============ LAPORAN (guru) ============
function getLaporan(tanggalMulai, tanggalSelesai, kelasFilter, mapelFilter) {
  const rows = getSheet(SHEET_ABSENSI).getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, siswaId, namaSiswa, kelas, mapel, tanggalRaw, waktu, status] = rows[i];
    const tanggal = normalizeTanggal(tanggalRaw);
    if (tanggalMulai && tanggal < tanggalMulai) continue;
    if (tanggalSelesai && tanggal > tanggalSelesai) continue;
    if (kelasFilter && kelas !== kelasFilter) continue;
    if (mapelFilter && mapel !== mapelFilter) continue;
    list.push({ id, siswa_id: siswaId, nama_siswa: namaSiswa, kelas, mapel, tanggal, waktu, status });
  }
  list.sort((a, b) => (a.tanggal + a.waktu < b.tanggal + b.waktu ? 1 : -1));
  return { ok: true, data: list };
}

/**
 * getOverview: gabungan getSiswaList + getLaporan dalam 1 API call.
 * Dipakai oleh dashboard guru untuk memuat semua data yang dibutuhkan
 * sekaligus (statistik kartu, grafik tren 7 hari, pie chart, leaderboard,
 * dan aktivitas terbaru) tanpa harus 2 round-trip ke Apps Script.
 *
 * Return: { ok, siswa: { ok, data: [...] }, laporan: { ok, data: [...] } }
 */
function getOverview(tanggalMulai, tanggalSelesai) {
  const siswaRes = getSiswaList(null);  // semua kelas
  const laporanRes = getLaporan(tanggalMulai, tanggalSelesai, null, null);
  return {
    ok: true,
    siswa: siswaRes,
    laporan: laporanRes
  };
}

// ============ REKAP BULANAN (guru) ============
/**
 * Rekap kehadiran bulanan per siswa untuk satu bulan+tahun tertentu.
 * Menghitung persentase kehadiran berdasarkan hari efektif (tanggal unik
 * yang memiliki data absensi di bulan tersebut, per mapel).
 *
 * Return: {
 *   ok, bulan, tahun, kelas_filter,
 *   hari_efektif: { TIK: N, KKA: N },
 *   ringkasan: { rata_rata, tertinggi: {nama, persen}, terendah: {nama, persen} },
 *   data: [{ siswa_id, nama, kelas, per_mapel: { TIK: {hadir,izin,sakit,alfa,total,persen}, KKA: {...} },
 *            total_hadir, total_hari, persen_total }]
 * }
 */
function getRekapBulanan(bulan, tahun, kelasFilter, tanggalFilter) {
  bulan = parseInt(bulan, 10);
  tahun = parseInt(tahun, 10);
  if (!bulan || bulan < 1 || bulan > 12 || !tahun) {
    return { ok: false, error: 'Bulan (1-12) dan tahun wajib diisi' };
  }

  // Prefix tanggal untuk filter bulan: "yyyy-MM"
  const bulanStr = String(bulan).padStart(2, '0');
  const prefix = tahun + '-' + bulanStr;

  let exactTanggal = null;
  if (tanggalFilter) {
    const tStr = String(tanggalFilter).trim();
    if (tStr) {
      if (tStr.indexOf('-') !== -1) {
        exactTanggal = normalizeTanggal(tStr);
      } else {
        const tNum = parseInt(tStr, 10);
        if (tNum >= 1 && tNum <= 31) {
          exactTanggal = prefix + '-' + String(tNum).padStart(2, '0');
        }
      }
    }
  }

  // Baca siswa
  const siswaRows = getSheet(SHEET_SISWA).getDataRange().getValues();
  const siswaMap = {}; // id -> {nama, kelas, nis}
  const kelasFilterNorm = kelasFilter ? String(kelasFilter).trim().toLowerCase() : null;

  for (let i = 1; i < siswaRows.length; i++) {
    const [id, nis, nama, kelas] = siswaRows[i];
    if (!id && !nama) continue;
    const sid = String(id || '').trim();
    const skelas = String(kelas || '').trim();
    if (kelasFilterNorm && skelas.toLowerCase() !== kelasFilterNorm) continue;
    siswaMap[sid] = { nama: String(nama || '').trim(), kelas: skelas, nis: String(nis || '').trim() };
  }

  // Baca absensi bulan ini
  const absensiRows = getSheet(SHEET_ABSENSI).getDataRange().getValues();
  const rekapData = {}; // siswaId -> mapel -> { hadir, izin, sakit, alfa }
  const mapelSet = new Set(MAPEL_LIST); // default MAPEL_LIST + dynamic mapels
  const tanggalUnikPerMapel = {};

  for (let i = 1; i < absensiRows.length; i++) {
    const [, siswaId, , , mapelRaw, tanggalRaw, , status] = absensiRows[i];
    const sid = String(siswaId || '').trim();
    const tanggal = normalizeTanggal(tanggalRaw);
    if (!tanggal || !tanggal.startsWith(prefix)) continue;
    if (exactTanggal && tanggal !== exactTanggal) continue;

    // Filter siswa berbasis siswaMap (sudah mencakup filter kelas)
    if (!siswaMap[sid]) continue;

    const mapel = String(mapelRaw || '').trim() || 'Umum';
    mapelSet.add(mapel);

    if (!tanggalUnikPerMapel[mapel]) {
      tanggalUnikPerMapel[mapel] = {};
    }
    tanggalUnikPerMapel[mapel][tanggal] = true;

    if (!rekapData[sid]) {
      rekapData[sid] = {};
    }
    if (!rekapData[sid][mapel]) {
      rekapData[sid][mapel] = { hadir: 0, izin: 0, sakit: 0, alfa: 0 };
    }

    const statusLower = String(status || '').trim().toLowerCase();
    if (statusLower === 'hadir') rekapData[sid][mapel].hadir++;
    else if (statusLower === 'izin') rekapData[sid][mapel].izin++;
    else if (statusLower === 'sakit') rekapData[sid][mapel].sakit++;
    else if (statusLower === 'alfa') rekapData[sid][mapel].alfa++;
  }

  const allMapel = Array.from(mapelSet);

  // Hitung hari efektif per mapel
  const hariEfektif = {};
  allMapel.forEach(function(m) {
    hariEfektif[m] = tanggalUnikPerMapel[m] ? Object.keys(tanggalUnikPerMapel[m]).length : 0;
  });

  // Bangun result array
  const result = [];
  const siswaIds = Object.keys(siswaMap);
  siswaIds.forEach(function(sid) {
    const info = siswaMap[sid];
    const perMapel = {};
    let totalHadir = 0;
    let totalIzin = 0;
    let totalSakit = 0;
    let totalAlfa = 0;
    let totalHari = 0;

    allMapel.forEach(function(m) {
      const d = rekapData[sid] && rekapData[sid][m]
        ? rekapData[sid][m]
        : { hadir: 0, izin: 0, sakit: 0, alfa: 0 };
      const hari = hariEfektif[m] || 0;
      const persen = hari > 0 ? Math.round((d.hadir / hari) * 100) : 0;
      perMapel[m] = {
        hadir: d.hadir,
        izin: d.izin,
        sakit: d.sakit,
        alfa: d.alfa,
        total_hari: hari,
        persen: persen
      };
      totalHadir += d.hadir;
      totalIzin += d.izin;
      totalSakit += d.sakit;
      totalAlfa += d.alfa;
      totalHari += hari;
    });

    const persenTotal = totalHari > 0 ? Math.round((totalHadir / totalHari) * 100) : 0;

    result.push({
      siswa_id: sid,
      nama: info.nama,
      kelas: info.kelas,
      per_mapel: perMapel,
      total_hadir: totalHadir,
      total_izin: totalIzin,
      total_sakit: totalSakit,
      total_alfa: totalAlfa,
      total_hari: totalHari,
      persen_total: persenTotal
    });
  });

  // Sort by nama
  result.sort(function(a, b) { return String(a.nama).localeCompare(String(b.nama), 'id'); });

  // Ringkasan
  let rataRata = 0;
  let tertinggi = { nama: '-', persen: 0 };
  let terendah = { nama: '-', persen: 100 };
  if (result.length > 0) {
    let sumPersen = 0;
    result.forEach(function(r) {
      sumPersen += r.persen_total;
      if (r.persen_total > tertinggi.persen) tertinggi = { nama: r.nama, persen: r.persen_total };
      if (r.persen_total < terendah.persen) terendah = { nama: r.nama, persen: r.persen_total };
    });
    rataRata = Math.round(sumPersen / result.length);
  }

  return {
    ok: true,
    bulan: bulan,
    tahun: tahun,
    kelas_filter: kelasFilter || null,
    hari_efektif: hariEfektif,
    ringkasan: {
      total_siswa: result.length,
      rata_rata: rataRata,
      tertinggi: tertinggi,
      terendah: terendah
    },
    data: result
  };
}

// ============ RIWAYAT KEHADIRAN SISWA (siswa) ============
/**
 * Mengambil riwayat kehadiran personal siswa. Jika bulan dan tahun diberikan,
 * menampilkan detail bulan tersebut. Jika tidak, menampilkan ringkasan semua
 * bulan yang ada datanya.
 *
 * Return: {
 *   ok, profil: {nama, kelas, nis},
 *   rekap_bulanan: [{ bulan, tahun, label, per_mapel: {...}, persen_total }],
 *   detail: [{ tanggal, mapel, status, waktu }]  // hanya jika bulan+tahun diberikan
 * }
 */
function getRiwayatSiswa(session, bulan, tahun) {
  const siswaData = getSiswaById(session.user_id);
  if (!siswaData) return { ok: false, error: 'Data siswa tidak ditemukan' };

  const absensiRows = getSheet(SHEET_ABSENSI).getDataRange().getValues();

  // Kumpulkan semua record milik siswa ini
  const records = [];
  for (let i = 1; i < absensiRows.length; i++) {
    const [, siswaId, , , mapel, tanggalRaw, waktu, status] = absensiRows[i];
    if (String(siswaId) !== String(session.user_id)) continue;
    const tanggal = normalizeTanggal(tanggalRaw);
    records.push({ tanggal: tanggal, mapel: mapel, status: status, waktu: waktu || '' });
  }

  // Group by bulan-tahun
  const bulanMap = {}; // "2024-07" -> { records: [...], tanggalUnik: { mapel: Set } }
  records.forEach(function(r) {
    const key = r.tanggal.substring(0, 7); // "yyyy-MM"
    if (!bulanMap[key]) {
      bulanMap[key] = { records: [], tanggalUnik: {} };
      MAPEL_LIST.forEach(function(m) { bulanMap[key].tanggalUnik[m] = {}; });
    }
    bulanMap[key].records.push(r);
    if (bulanMap[key].tanggalUnik[r.mapel]) {
      bulanMap[key].tanggalUnik[r.mapel][r.tanggal] = true;
    }
  });

  // Hitung hari efektif global per mapel per bulan (dari SEMUA siswa, bukan cuma siswa ini)
  // Ini penting agar siswa yang banyak alfa tetap punya denominator yang benar
  const allTanggalPerMapelPerBulan = {};
  for (let i = 1; i < absensiRows.length; i++) {
    const [, , , kelas, mapel, tanggalRaw] = absensiRows[i];
    if (kelas !== siswaData.kelas) continue; // hanya kelas yg sama
    const tanggal = normalizeTanggal(tanggalRaw);
    const key = tanggal.substring(0, 7);
    if (!allTanggalPerMapelPerBulan[key]) {
      allTanggalPerMapelPerBulan[key] = {};
      MAPEL_LIST.forEach(function(m) { allTanggalPerMapelPerBulan[key][m] = {}; });
    }
    if (allTanggalPerMapelPerBulan[key][mapel]) {
      allTanggalPerMapelPerBulan[key][mapel][tanggal] = true;
    }
  }

  // Bangun rekap per bulan
  const namaBulan = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const allKeys = Object.keys(bulanMap).concat(Object.keys(allTanggalPerMapelPerBulan));
  if (bulan && tahun) {
    var targetKey = parseInt(tahun, 10) + '-' + String(parseInt(bulan, 10)).padStart(2, '0');
    allKeys.push(targetKey);
  }
  const uniqueKeys = [];
  var seen = {};
  allKeys.forEach(function(k) { if (!seen[k]) { seen[k] = true; uniqueKeys.push(k); } });
  uniqueKeys.sort().reverse();

  const rekapBulanan = [];
  uniqueKeys.forEach(function(key) {
    var parts = key.split('-');
    var bln = parseInt(parts[1], 10);
    var thn = parseInt(parts[0], 10);
    var perMapel = {};
    var totalHadir = 0;
    var totalHari = 0;

    MAPEL_LIST.forEach(function(m) {
      var d = { hadir: 0, izin: 0, sakit: 0, alfa: 0 };
      if (bulanMap[key]) {
        bulanMap[key].records.forEach(function(r) {
          if (r.mapel !== m) return;
          var sl = String(r.status).toLowerCase();
          if (sl === 'hadir') d.hadir++;
          else if (sl === 'izin') d.izin++;
          else if (sl === 'sakit') d.sakit++;
          else if (sl === 'alfa') d.alfa++;
        });
      }
      // Hari efektif dari data global kelas
      var hari = allTanggalPerMapelPerBulan[key] && allTanggalPerMapelPerBulan[key][m]
        ? Object.keys(allTanggalPerMapelPerBulan[key][m]).length : 0;
      var persen = hari > 0 ? Math.round((d.hadir / hari) * 100) : 0;
      perMapel[m] = { hadir: d.hadir, izin: d.izin, sakit: d.sakit, alfa: d.alfa, total_hari: hari, persen: persen };
      totalHadir += d.hadir;
      totalHari += hari;
    });

    var persenTotal = totalHari > 0 ? Math.round((totalHadir / totalHari) * 100) : 0;
    rekapBulanan.push({
      bulan: bln,
      tahun: thn,
      label: namaBulan[bln] + ' ' + thn,
      per_mapel: perMapel,
      total_hadir: totalHadir,
      total_hari: totalHari,
      persen_total: persenTotal
    });
  });

  // Detail harian (jika bulan & tahun diberikan)
  var detail = [];
  if (bulan && tahun) {
    var filterPrefix = parseInt(tahun, 10) + '-' + String(parseInt(bulan, 10)).padStart(2, '0');
    detail = records.filter(function(r) { return r.tanggal.startsWith(filterPrefix); });
    detail.sort(function(a, b) {
      if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
      return a.mapel < b.mapel ? -1 : 1;
    });
  }

  return {
    ok: true,
    profil: { nama: siswaData.nama, kelas: siswaData.kelas, nis: siswaData.nis },
    rekap_bulanan: rekapBulanan,
    detail: detail
  };
}

// ============ UTIL ============
function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan setupSheets() dahulu.');
  return sheet;
}

/**
 * Password hashing dengan salt per-user.
 *
 * Sebelumnya password di-hash SHA-256 tanpa salt. SHA-256 itu sengaja
 * dirancang cepat (bukan untuk password), jadi tanpa salt ia rentan
 * terhadap rainbow table dan brute force -- apalagi endpoint Apps Script
 * ini publik (Who has access: Anyone). Solusi ideal adalah algoritma
 * lambat seperti bcrypt/scrypt, tapi Apps Script tidak menyediakannya
 * secara native, jadi minimal kita tambahkan salt unik per user yang
 * disimpan bersama hash-nya (format "salt:hash").
 */
function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hashPassword(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  return digest.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function makePasswordHash(password) {
  const salt = generateSalt();
  return salt + ':' + hashPassword(password, salt);
}

/**
 * Verifikasi password terhadap hash tersimpan. Mendukung deteksi hash lama
 * (tanpa salt, tanpa "salt:" prefix) supaya errornya jelas -- bukan diam-
 * diam gagal login tanpa sebab yang bisa ditelusuri.
 */
function verifyPassword(password, stored) {
  if (!stored || String(stored).indexOf(':') === -1) return false;
  const parts = String(stored).split(':');
  const salt = parts[0];
  const hash = parts[1];
  return hashPassword(password, salt) === hash;
}

/**
 * Rate limiting login sederhana pakai CacheService (bukan Sheet, supaya
 * tidak menambah baris/beban baca-tulis Sheets untuk sesuatu yang sifatnya
 * sementara). Maks 5 kali gagal berturut-turut per identitas (username/NIS),
 * lalu diblokir 5 menit. Terapkan whitespace-insensitive/lowercase di
 * pemanggil supaya "Admin" dan "admin" dianggap identitas yang sama.
 */
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 300; // 5 menit

function checkRateLimit(identifier) {
  const cache = CacheService.getScriptCache();
  const data = cache.get('loginfail_' + identifier);
  const attempts = data ? parseInt(data, 10) : 0;
  return attempts < RATE_LIMIT_MAX_ATTEMPTS;
}

function recordFailedLogin(identifier) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + identifier;
  const data = cache.get(key);
  const attempts = data ? parseInt(data, 10) : 0;
  cache.put(key, String(attempts + 1), RATE_LIMIT_WINDOW_SECONDS);
}

function clearFailedLogin(identifier) {
  CacheService.getScriptCache().remove('loginfail_' + identifier);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
