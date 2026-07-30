import re

filepath = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/Code.gs"

with open(filepath, "r") as f:
    code = f.read()

# Update createSiswa, importSiswaBulk, updateSiswa, getSiswaById to handle new schema
code = code.replace(
'''function getSiswaById(id) {
  const rows = getSheet(SHEET_SISWA).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return { id: rows[i][0], nis: rows[i][1], nama: rows[i][3], kelas: rows[i][4] };
    }
  }
  return null;
}''',
'''function getSiswaById(id) {
  const rows = getSheet(SHEET_SISWA).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return { id: rows[i][0], nis: rows[i][1], nama: rows[i][2], kelas: rows[i][3], wali_murid: rows[i][4], status_aktif: rows[i][5], email: rows[i][6] };
    }
  }
  return null;
}'''
)

code = code.replace(
'''function updateSiswa(id, nis, nama, kelas, password) {
  const sheet = getSheet(SHEET_SISWA);
  const rows = sheet.getDataRange().getValues();

  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(nis) && String(rows[i][0]) !== String(id)) {
      return { ok: false, error: 'NIS sudah dipakai siswa lain' };
    }
    if (String(rows[i][0]) === String(id)) {
      targetIndex = i + 1;
    }
  }

  if (targetIndex === -1) return { ok: false, error: 'Siswa tidak ditemukan' };

  sheet.getRange(targetIndex, 2).setValue(nis);
  sheet.getRange(targetIndex, 4).setValue(nama);
  sheet.getRange(targetIndex, 5).setValue(kelas);

  if (password) {
    sheet.getRange(targetIndex, 3).setValue(makePasswordHash(password));
  }
  return { ok: true };
}''',
'''function updateSiswa(session, id, nis, nama, kelas, wali, status, email) {
  const sheet = getSheet(SHEET_SISWA);
  const rows = sheet.getDataRange().getValues();

  let targetIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(nis) && String(rows[i][0]) !== String(id)) {
      return { ok: false, error: 'NIS sudah dipakai siswa lain' };
    }
    if (String(rows[i][0]) === String(id)) {
      targetIndex = i + 1;
    }
  }

  if (targetIndex === -1) return { ok: false, error: 'Siswa tidak ditemukan' };

  sheet.getRange(targetIndex, 2, 1, 6).setValues([[nis, nama, kelas, wali, status, email]]);
  logAction(session.user_id, session.nama, 'Update Siswa', 'Update siswa ' + nama);
  return { ok: true };
}'''
)

# Replace getSiswaList if we haven't properly
code = re.sub(
r'function getSiswaList\(kelasFilter\).*?return \{ ok: true, data: list \};\n\}',
'''function getSiswaList(kelasFilter) {
  const rows = getSheet(SHEET_SISWA).getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, nis, nama, kelas, wali, status, email] = rows[i];
    if (!kelasFilter || kelasFilter === kelas) {
      list.push({ id, nis, nama, kelas, wali_murid: wali, status_aktif: status, email });
    }
  }
  return { ok: true, data: list };
}''', code, flags=re.DOTALL
)

with open(filepath, "w") as f:
    f.write(code)

print("Updated Siswa CRUD in Code.gs")
