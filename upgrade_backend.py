import re
import os

filepath = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/Code.gs"

with open(filepath, "r") as f:
    code = f.read()

# 1. Update setupSheets
code = re.sub(r'function setupSheets\(\) \{.*?\n\}', '''function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const pengguna = ss.getSheetByName('Pengguna') || ss.insertSheet('Pengguna');
  pengguna.clear();
  pengguna.appendRow(['id', 'email', 'role', 'nama']);
  pengguna.appendRow(['1', 'admin@sekolah.edu', 'admin', 'Super Admin']);

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
}''', code, flags=re.DOTALL)

# 2. Update Constants
code = code.replace("const SHEET_GURU = 'Guru';", "const SHEET_PENGGUNA = 'Pengguna';")

# 3. Add new functions for Log and Pengaturan
new_funcs = '''
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
'''
code = code.replace("// ============ AUTH ============", new_funcs + "\n// ============ AUTH ============")

# 4. Replace Auth Functions
auth_regex = re.compile(r'function loginGuru.*?function createSession', re.DOTALL)
login_func = '''function loginWithGoogle(email, name, picture) {
  if (!email) return { ok: false, error: 'Email tidak valid' };
  
  const sheetPengguna = getSheet('Pengguna');
  const rowsPengguna = sheetPengguna.getDataRange().getValues();
  for (let i = 1; i < rowsPengguna.length; i++) {
    const [id, rowEmail, role, rowNama] = rowsPengguna[i];
    if (String(rowEmail).toLowerCase() === String(email).toLowerCase()) {
      const token = createSession(id, role, rowNama);
      logAction(id, rowNama, 'Login', 'Berhasil login sebagai ' + role);
      return { ok: true, token: token, nama: rowNama, role: role };
    }
  }

  const sheetSiswa = getSheet('Siswa');
  const rowsSiswa = sheetSiswa.getDataRange().getValues();
  for (let i = 1; i < rowsSiswa.length; i++) {
    const [id, nis, rowNama, kelas, wali, status, rowEmail] = rowsSiswa[i];
    if (rowEmail && String(rowEmail).toLowerCase() === String(email).toLowerCase()) {
      if (status !== 'Aktif') return { ok: false, error: 'Akun siswa tidak aktif' };
      const token = createSession(id, 'siswa', rowNama);
      logAction(id, rowNama, 'Login', 'Berhasil login sebagai siswa');
      return { ok: true, token: token, nama: rowNama, kelas: kelas, role: 'siswa' };
    }
  }

  return { ok: false, error: 'Akun dengan email ' + email + ' tidak terdaftar di sistem.' };
}

function createSession'''
code = auth_regex.sub(login_func, code)

# 5. Update doPost
code = re.sub(r'case \'loginGuru\':.*?result = loginSiswa\(body\.nis, body\.password\);\n\s*break;', 
'''case 'loginWithGoogle':
        result = loginWithGoogle(body.email, body.name, body.picture);
        break;
      case 'getPengaturan':
        result = getPengaturan();
        break;
      case 'savePengaturan':
        result = requireRole(body.token, 'admin', (session) => savePengaturan(session, body.settings));
        break;
      case 'getLogAktivitas':
        result = requireRole(body.token, 'admin', () => getLogAktivitas());
        break;''', code, flags=re.DOTALL)

# Also fix requireRole usages to allow admin/guru/kepsek mapping
# The old system hardcoded 'guru' and 'siswa'. Now we have 'admin', 'guru', 'kepsek', 'siswa'.
# We should change `requireRole` to accept an array of allowed roles.
code = code.replace("function requireRole(token, role, fn) {", "function requireRole(token, allowedRoles, fn) {")
code = code.replace("if (session.role !== role) return { ok: false, error: 'Akses ditolak untuk role ini' };", 
"if (typeof allowedRoles === 'string') allowedRoles = [allowedRoles];\n  if (!allowedRoles.includes(session.role)) return { ok: false, error: 'Akses ditolak untuk role ini' };")

# Update all `requireRole(body.token, 'guru', ...)` to `requireRole(body.token, ['admin', 'guru', 'kepsek'], ...)`
code = code.replace("requireRole(body.token, 'guru'", "requireRole(body.token, ['admin', 'guru', 'kepsek']")

# Update Siswa CRUD
code = code.replace("function getSiswaList(kelasFilter) {", "function getSiswaList(kelasFilter) {\n  const rows = getSheet('Siswa').getDataRange().getValues();\n  const list = [];\n  for (let i = 1; i < rows.length; i++) {\n    const [id, nis, nama, kelas, wali, status, email] = rows[i];\n    if (!kelasFilter || kelasFilter === kelas) {\n      list.push({ id, nis, nama, kelas, wali_murid: wali, status_aktif: status, email });\n    }\n  }\n  return { ok: true, data: list };\n}\n//")

code = code.replace("function createSiswa(nis, nama, kelas, password) {", "function createSiswa(session, nis, nama, kelas, wali, status, email) {\n  if (!nis || !nama || !kelas) return { ok: false, error: 'Field wajib diisi' };\n  const sheet = getSheet('Siswa');\n  const rows = sheet.getDataRange().getValues();\n  for (let i = 1; i < rows.length; i++) {\n    if (String(rows[i][1]) === String(nis)) return { ok: false, error: 'NIS sudah terdaftar' };\n  }\n  const id = Utilities.getUuid();\n  sheet.appendRow([id, nis, nama, kelas, wali, status, email]);\n  logAction(session.user_id, session.nama, 'Tambah Siswa', 'Menambah siswa ' + nama);\n  return { ok: true, id: id };\n}\n//")

# I will write the rest of the updates manually by creating a new `Code.gs` or I can just use the replace script for the major parts and then manually tweak the files.
# Let's save what we have.
with open(filepath, "w") as f:
    f.write(code)
