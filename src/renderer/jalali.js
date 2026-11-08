/**
 * Persian (Jalali) Calendar Utility - 100% Offline & Pure JavaScript
 */
const JalaliDate = (() => {
  const g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  const PERSIAN_MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد',
    'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر',
    'دی', 'بهمن', 'اسفند'
  ];

  const PERSIAN_WEEKDAYS = [
    'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'
  ];

  const PERSIAN_WEEKDAYS_SHORT = [
    'یک', 'دو', 'سه', 'چهار', 'پنج', 'جمعه', 'شنبه'
  ];

  // Convert Gregorian to Jalali
  function gregorianToJalali(gy, gm, gd) {
    let g_day_no = 365 * (gy - 1600) + Math.floor((gy - 1599) / 4) - Math.floor((gy - 1599) / 100) + Math.floor((gy - 1599) / 400);
    for (let i = 0; i < gm; ++i) g_day_no += g_days_in_month[i];
    if (gm > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0))) ++g_day_no;
    g_day_no += gd - 1;

    let j_day_no = g_day_no - 79;
    let j_np = Math.floor(j_day_no / 12053);
    j_day_no %= 12053;

    let jy = 979 + 33 * j_np + 4 * Math.floor(j_day_no / 1461);
    j_day_no %= 1461;

    if (j_day_no >= 366) {
      jy += Math.floor((j_day_no - 1) / 365);
      j_day_no = (j_day_no - 1) % 365;
    }

    let jm = 0;
    for (let i = 0; i < 11 && j_day_no >= j_days_in_month[i]; ++i) {
      j_day_no -= j_days_in_month[i];
      jm = i + 1;
    }
    let jd = j_day_no + 1;

    return { jy, jm: jm + 1, jd };
  }

  // Convert Jalali to Gregorian
  function jalaliToGregorian(jy, jm, jd) {
    let j_day_no = 365 * (jy - 979) + Math.floor(Math.floor((jy - 979) / 33) * 8) + Math.floor((((jy - 979) % 33) + 3) / 4);
    for (let i = 0; i < jm - 1; ++i) j_day_no += j_days_in_month[i];
    j_day_no += jd - 1;

    let g_day_no = j_day_no + 79;
    let gy = 1600 + 400 * Math.floor(g_day_no / 146097);
    g_day_no %= 146097;

    let leap = true;
    if (g_day_no >= 36525) {
      g_day_no--;
      gy += 100 * Math.floor(g_day_no / 36524);
      g_day_no %= 36524;
      if (g_day_no >= 365) g_day_no++;
      else leap = false;
    }

    gy += 4 * Math.floor(g_day_no / 1461);
    g_day_no %= 1461;

    if (g_day_no >= 366) {
      leap = false;
      g_day_no--;
      gy += Math.floor(g_day_no / 365);
      g_day_no %= 365;
    }

    let gm = 0;
    for (let i = 0; g_day_no >= g_days_in_month[i] + (i === 1 && leap ? 1 : 0); i++) {
      g_day_no -= g_days_in_month[i] + (i === 1 && leap ? 1 : 0);
      gm = i + 1;
    }
    let gd = g_day_no + 1;

    return { gy, gm: gm + 1, gd };
  }

  function toPersianDigits(n) {
    if (n === null || n === undefined) return '';
    const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(n).replace(/[0-9]/g, w => faDigits[+w]);
  }

  function getTodayJalali() {
    const d = new Date();
    const j = gregorianToJalali(d.getFullYear(), d.getMonth(), d.getDate());
    const weekday = PERSIAN_WEEKDAYS[d.getDay()];
    return {
      ...j,
      monthName: PERSIAN_MONTHS[j.jm - 1],
      weekday,
      formatted: `${toPersianDigits(j.jy)}/${toPersianDigits(String(j.jm).padStart(2, '0'))}/${toPersianDigits(String(j.jd).padStart(2, '0'))}`,
      longFormatted: `${weekday}، ${toPersianDigits(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`
    };
  }

  function formatISODateToJalali(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const j = gregorianToJalali(d.getFullYear(), d.getMonth(), d.getDate());
    return `${toPersianDigits(j.jy)}/${toPersianDigits(String(j.jm).padStart(2, '0'))}/${toPersianDigits(String(j.jd).padStart(2, '0'))}`;
  }

  function getJalaliDateKey(date = new Date()) {
    const j = gregorianToJalali(date.getFullYear(), date.getMonth(), date.getDate());
    return `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`;
  }

  return {
    gregorianToJalali,
    jalaliToGregorian,
    toPersianDigits,
    getTodayJalali,
    formatISODateToJalali,
    getJalaliDateKey,
    PERSIAN_MONTHS,
    PERSIAN_WEEKDAYS,
    PERSIAN_WEEKDAYS_SHORT
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JalaliDate;
}

