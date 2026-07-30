import re

filepath = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/Code.gs"

with open(filepath, "r") as f:
    code = f.read()

# Replace setAbsensiStatus
code = re.sub(
r'function setAbsensiStatus\(session, siswaId, mapel, tanggal, status\) \{.*?return \{ ok: true, message: \'Status \' \+ siswaData\.nama \+ \' \(\' \+ mapel \+ \'\) diset menjadi \' \+ status \};\n  \} finally \{\n    lock\.releaseLock\(\);\n  \}\n\}',
'''function setAbsensiStatus(session, siswaId, mapel, tanggal, status, keterangan) {
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
}''', code, flags=re.DOTALL
)

# Update findAbsensiRow to include keterangan (optional, but good for completeness)
code = re.sub(
r'const \[rowMapel, rowTanggal, rowWaktu, rowStatus\] = sheet\.getRange\(row, 5, 1, 4\)\.getValues\(\)\[0\]; // mapel, tanggal, waktu, status\n\s*if \(rowMapel === mapel && normalizeTanggal\(rowTanggal\) === tanggal\) \{\n\s*return \{ row: row, waktu: rowWaktu, status: rowStatus \};\n\s*\}',
'''const [rowMapel, rowTanggal, rowWaktu, rowStatus, rowKeterangan] = sheet.getRange(row, 5, 1, 5).getValues()[0];
    if (rowMapel === mapel && normalizeTanggal(rowTanggal) === tanggal) {
      return { row: row, waktu: rowWaktu, status: rowStatus, keterangan: rowKeterangan };
    }''', code
)

# Replace doPost case for setAbsensiStatus
code = code.replace(
'''case 'setAbsensiStatus':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          setAbsensiStatus(session, body.siswa_id, body.mapel, body.tanggal, body.status)
        );''',
'''case 'setAbsensiStatus':
        result = requireRole(body.token, ['admin', 'guru', 'kepsek'], (session) =>
          setAbsensiStatus(session, body.siswa_id, body.mapel, body.tanggal, body.status, body.keterangan)
        );'''
)

with open(filepath, "w") as f:
    f.write(code)

print("Updated Absensi endpoints in Code.gs")
