import re

filepath = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/Code.gs"

with open(filepath, "r") as f:
    code = f.read()

# Fix orphaned blocks
# 1. Remove orphaned getSiswaList leftover
code = re.sub(
    r'//\s*\n\s*const rows = getSheet\(SHEET_SISWA\)\.getDataRange\(\)\.getValues\(\);\n\s*const list = \[\];\n\s*for \(let i = 1; i < rows\.length; i\+\+\) \{\n\s*const \[id, nis, , nama, kelas\] = rows\[i\];\n\s*if \(!kelasFilter \|\| kelasFilter === kelas\) \{\n\s*list\.push\(\{ id: id, nis: nis, nama: nama, kelas: kelas \}\);\n\s*\}\n\s*\}\n\s*return \{ ok: true, data: list \};\n\s*\}',
    '',
    code
)

# 2. Remove orphaned createSiswa leftover
code = re.sub(
    r'//\s*\n\s*if \(!nis \|\| !nama \|\| !kelas \|\| !password\) return \{ ok: false, error: \'Semua field wajib diisi\' \};\n\s*const sheet = getSheet\(SHEET_SISWA\);\n\s*const rows = sheet\.getDataRange\(\)\.getValues\(\);\n\s*for \(let i = 1; i < rows\.length; i\+\+\) \{\n\s*if \(String\(rows\[i\]\[1\]\) === String\(nis\)\) return \{ ok: false, error: \'NIS sudah terdaftar\' \};\n\s*\}\n\s*const id = Utilities\.getUuid\(\);\n\s*sheet\.appendRow\(\[id, nis, makePasswordHash\(password\), nama, kelas\]\);\n\s*return \{ ok: true, id: id \};\n\s*\}',
    '',
    code
)

# 3. Update importSiswaBulk to 7 columns (id, nis, nama, kelas, wali, status, email)
old_import = '''  items.forEach((item, idx) => {
    const nis = String(item.nis || '').trim();
    const nama = String(item.nama || '').trim();
    const kelas = String(item.kelas || '').trim();
    const password = String(item.password || '').trim();

    if (!nis || !nama || !kelas || !password) {
      results.push({ index: idx, nis: nis, ok: false, error: 'Ada kolom kosong' });
      return;
    }
    if (existingNis.has(nis)) {
      results.push({ index: idx, nis: nis, ok: false, error: 'NIS sudah terdaftar di sistem' });
      return;
    }
    if (seenInBatch.has(nis)) {
      results.push({ index: idx, nis: nis, ok: false, error: 'NIS duplikat di dalam file' });
      return;
    }
    seenInBatch.add(nis);
    const id = Utilities.getUuid();
    toAppend.push([id, nis, makePasswordHash(password), nama, kelas]);
    results.push({ index: idx, nis: nis, nama: nama, kelas: kelas, ok: true, id: id });
  });

  if (toAppend.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, toAppend.length, 5).setValues(toAppend);
  }'''

new_import = '''  items.forEach((item, idx) => {
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
  }'''

code = code.replace(old_import, new_import)

with open(filepath, "w") as f:
    f.write(code)

print("Code.gs cleaned up successfully.")
