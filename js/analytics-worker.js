// ==== WEB WORKER: ANALYTICS & CHART COMPUTATION THREAD ====
self.onmessage = function (event) {
  const { action, payloadId, data, year, todayStr } = event.data;

  if (action === 'CALCULATE_MONTHLY_TREND') {
    const result = calculateMonthlyTrend(data, year);
    self.postMessage({ action, payloadId, year, result });
  } else if (action === 'CALCULATE_DAILY_STATS') {
    const result = calculateDailyStats(data, todayStr);
    self.postMessage({ action, payloadId, todayStr, result });
  }
};

function calculateMonthlyTrend(absensiData, selectedYear) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const monthlyStats = Array(12).fill(null).map(() => ({ total: 0, hadir: 0, sakit: 0, izin: 0, alfa: 0 }));

  let totalHadirYear = 0;
  let totalRecordsYear = 0;

  if (Array.isArray(absensiData) && absensiData.length > 0) {
    absensiData.forEach((item) => {
      if (item && item.tanggal && String(item.tanggal).startsWith(selectedYear)) {
        const m = parseInt(String(item.tanggal).substring(5, 7), 10) - 1;
        if (m >= 0 && m < 12) {
          monthlyStats[m].total++;
          totalRecordsYear++;
          const st = String(item.status || '').toLowerCase();
          if (st === 'hadir') {
            monthlyStats[m].hadir++;
            totalHadirYear++;
          } else if (st === 'sakit') {
            monthlyStats[m].sakit++;
          } else if (st === 'izin') {
            monthlyStats[m].izin++;
          } else if (st === 'alfa') {
            monthlyStats[m].alfa++;
          }
        }
      }
    });
  }

  const monthData = monthNames.map((name, idx) => {
    const stat = monthlyStats[idx];
    const hasData = stat.total > 0;
    const pct = hasData ? Math.round((stat.hadir / stat.total) * 100) : 0;
    const countLabel = hasData ? `${stat.hadir}/${stat.total} Hadir` : 'Belum Ada Data';

    return {
      name,
      pct,
      countLabel,
      hasData,
      total: stat.total,
      hadir: stat.hadir,
      sakit: stat.sakit,
      izin: stat.izin,
      alfa: stat.alfa
    };
  });

  const avgPctStr = totalRecordsYear > 0 ? ((totalHadirYear / totalRecordsYear) * 100).toFixed(1) + '%' : '0.0%';

  return {
    monthData,
    avgPctStr,
    totalHadirYear,
    totalRecordsYear
  };
}

function calculateDailyStats(absensiData, todayStr) {
  let hadir = 0, sakit = 0, izin = 0, alfa = 0;

  if (Array.isArray(absensiData) && absensiData.length > 0) {
    absensiData.forEach((item) => {
      if (item && item.tanggal === todayStr) {
        const st = String(item.status || '').toLowerCase();
        if (st === 'hadir') hadir++;
        else if (st === 'sakit') sakit++;
        else if (st === 'izin') izin++;
        else if (st === 'alfa') alfa++;
      }
    });
  }

  const totalHariIni = hadir + sakit + izin + alfa;
  const pct = totalHariIni > 0 ? Math.round((hadir / totalHariIni) * 100) : 0;

  return {
    hadir,
    sakit,
    izin,
    alfa,
    totalHariIni,
    pct
  };
}
