/**
 * StudyUtils - Pure, testable helper functions for Changiz Study Tracker
 * Zero external dependencies; works in both browser renderer and Node.js tests.
 */
const StudyUtils = (() => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * DST-safe streak calculation based on UTC calendar days.
   * A day counts toward a streak if verified study time >= minDailyMinutes (default 10).
   */
  function calculateStreaksFromSessions(sessions, jalaliLib, nowDate = new Date(), minDailyMinutes = 10) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return { current: 0, best: 0 };
    }

    const dayTotals = {};
    sessions.forEach(s => {
      if (!s || !s.dateKey) return;
      const vMins = s.verifiedMinutes !== undefined ? s.verifiedMinutes : (s.durationMinutes || 0);
      dayTotals[s.dateKey] = (dayTotals[s.dateKey] || 0) + Math.max(0, vMins);
    });

    const activeDays = Object.keys(dayTotals).filter(d => dayTotals[d] >= minDailyMinutes);
    if (!activeDays.length) return { current: 0, best: 0 };

    const parseKey = (dk) => {
      if (jalaliLib && typeof jalaliLib.parseJalaliDateKeyToUTCMs === 'function') {
        return jalaliLib.parseJalaliDateKeyToUTCMs(dk);
      }
      const [jy, jm, jd] = dk.split('-').map(Number);
      const g = jalaliLib.jalaliToGregorian(jy, jm, jd);
      return Date.UTC(g.gy, g.gm - 1, g.gd);
    };

    const sortedDateObjs = activeDays
      .map(dk => ({ key: dk, time: parseKey(dk) }))
      .filter(o => !isNaN(o.time))
      .sort((a, b) => b.time - a.time);

    if (!sortedDateObjs.length) return { current: 0, best: 0 };

    const todayUTCMs = Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

    let currentStreak = 0;
    let checkTime = todayUTCMs;

    if (sortedDateObjs[0].time === todayUTCMs) {
      currentStreak = 1;
      checkTime = todayUTCMs - ONE_DAY_MS;
      for (let i = 1; i < sortedDateObjs.length; i++) {
        if (sortedDateObjs[i].time === checkTime) {
          currentStreak++;
          checkTime -= ONE_DAY_MS;
        } else {
          break;
        }
      }
    } else if (sortedDateObjs[0].time === todayUTCMs - ONE_DAY_MS) {
      currentStreak = 1;
      checkTime = todayUTCMs - 2 * ONE_DAY_MS;
      for (let i = 1; i < sortedDateObjs.length; i++) {
        if (sortedDateObjs[i].time === checkTime) {
          currentStreak++;
          checkTime -= ONE_DAY_MS;
        } else {
          break;
        }
      }
    }

    let bestStreak = Math.max(1, currentStreak);
    let tempStreak = 1;
    for (let i = 0; i < sortedDateObjs.length - 1; i++) {
      if (sortedDateObjs[i].time - sortedDateObjs[i + 1].time === ONE_DAY_MS) {
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      } else {
        tempStreak = 1;
      }
    }

    return { current: currentStreak, best: bestStreak };
  }

  /**
   * Compute drift-free whole elapsed seconds from timestamps.
   */
  function computeElapsedSeconds(lastTickMs, nowMs) {
    if (!lastTickMs || !nowMs || nowMs <= lastTickMs) return 0;
    return Math.floor((nowMs - lastTickMs) / 1000);
  }

  /**
   * Compute accurate elapsed minutes when manually saving the active timer session.
   * Returns 0 if currently in a break mode or less than 1 minute has elapsed.
   */
  function computeManualSaveMinutes(mode, subMode, totalDuration, timeLeft, reverseElapsed) {
    if (mode === 'reverse') {
      return Math.floor(Math.max(0, reverseElapsed || 0) / 60);
    }
    if (subMode !== 'focus') {
      return 0;
    }
    const elapsedSeconds = Math.max(0, (totalDuration || 0) - (timeLeft || 0));
    return Math.floor(elapsedSeconds / 60);
  }

  /**
   * Escape a single CSV cell according to RFC 4180.
   */
  function escapeCSVCell(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Build a UTF-8 BOM CSV export of all study sessions.
   */
  function buildSessionsCSV(sessions, subjects = []) {
    const subjectMap = {};
    (subjects || []).forEach(s => {
      subjectMap[s.id] = s.name;
    });

    const headers = [
      'Date (Jalali)',
      'Subject',
      'Mode',
      'Nominal Minutes',
      'Verified Minutes',
      'Absent Minutes',
      'Note'
    ];

    const rows = [headers.map(escapeCSVCell).join(',')];

    (sessions || []).forEach(s => {
      const subName = subjectMap[s.subjectId] || 'عمومی';
      const nominal = s.durationMinutes || 0;
      const verified = s.verifiedMinutes !== undefined ? s.verifiedMinutes : nominal;
      const absent = s.absentMinutes !== undefined ? s.absentMinutes : Math.max(0, nominal - verified);
      const row = [
        s.dateKey || '',
        subName,
        s.mode || 'classic',
        nominal,
        verified,
        absent,
        s.note || ''
      ];
      rows.push(row.map(escapeCSVCell).join(','));
    });

    return '\uFEFF' + rows.join('\r\n');
  }

  /**
   * Filter sessions by rangeDays ('all' | 7 | 30) and optional subjectId ('all' | id).
   */
  function filterSessions(sessions, options = {}) {
    const { rangeDays = 'all', subjectId = 'all', nowDate = new Date(), jalaliLib = null } = options;
    const list = Array.isArray(sessions) ? sessions : [];

    let cutoffUTCMs = null;
    if (rangeDays !== 'all' && Number(rangeDays) > 0) {
      const todayUTC = Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
      cutoffUTCMs = todayUTC - (Number(rangeDays) - 1) * ONE_DAY_MS;
    }

    return list.filter(s => {
      if (subjectId && subjectId !== 'all' && s.subjectId !== subjectId) {
        return false;
      }
      if (cutoffUTCMs !== null) {
        let sessionUTC = NaN;
        if (s.dateKey && jalaliLib && typeof jalaliLib.parseJalaliDateKeyToUTCMs === 'function') {
          sessionUTC = jalaliLib.parseJalaliDateKeyToUTCMs(s.dateKey);
        } else if (s.timestamp) {
          const d = new Date(s.timestamp);
          sessionUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
        }
        if (!isNaN(sessionUTC) && sessionUTC < cutoffUTCMs) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Compute subject target completion percentage (0..100), or null if no target is set.
   */
  function computeSubjectProgress(verifiedMinutes, targetHours) {
    const target = Number(targetHours);
    if (!target || target <= 0) return null;
    const targetMins = target * 60;
    return Math.min(100, Math.round((Math.max(0, verifiedMinutes || 0) / targetMins) * 100));
  }

  return {
    calculateStreaksFromSessions,
    computeElapsedSeconds,
    computeManualSaveMinutes,
    escapeCSVCell,
    buildSessionsCSV,
    filterSessions,
    computeSubjectProgress
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StudyUtils;
}
