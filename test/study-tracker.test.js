/**
 * Automated Unit Tests for Changiz Study Tracker Core Utilities, Bug Fixes & New Features
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const JalaliDate = require('../src/renderer/jalali.js');
const ChartRenderer = require('../src/renderer/charts.js');
const SoundManager = require('../src/renderer/audio.js');
const StudyUtils = require('../src/renderer/study-utils.js');

describe('JalaliDate Utilities & Fixes', () => {
  it('converts date-only ISO strings without UTC timezone shift', () => {
    // 2026-03-21 is 1405-01-01 (Nowruz) regardless of local timezone offset
    const formatted = JalaliDate.formatISODateToJalali('2026-03-21');
    assert.equal(formatted, '۱۴۰۵/۰۱/۰۱');
  });

  it('round-trips Gregorian -> Jalali -> UTC timestamp cleanly', () => {
    const d = new Date(2026, 2, 21); // March 21, 2026
    const key = JalaliDate.getJalaliDateKey(d);
    assert.equal(key, '1405-01-01');
    const utcMs = JalaliDate.parseJalaliDateKeyToUTCMs(key);
    assert.equal(utcMs, Date.UTC(2026, 2, 21));
  });
});

describe('ChartRenderer Safety Guards', () => {
  function createMockCanvas() {
    const calls = [];
    const ctx = {
      scale: () => {},
      clearRect: () => calls.push('clearRect'),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      arcTo: () => {},
      closePath: () => {},
      save: () => {},
      restore: () => {},
      setLineDash: () => {},
      fillText: (txt) => calls.push(['fillText', txt]),
      createLinearGradient: () => ({ addColorStop: () => {} })
    };
    return {
      width: 400,
      height: 200,
      getBoundingClientRect: () => ({ width: 400, height: 200 }),
      getContext: () => ctx,
      calls
    };
  }

  it('handles empty daysData in drawWeeklyChart without dividing by zero', () => {
    const canvas = createMockCanvas();
    assert.doesNotThrow(() => ChartRenderer.drawWeeklyChart(canvas, [], 4, true));
    assert.ok(canvas.calls.some(c => Array.isArray(c) && c[0] === 'fillText'));
  });

  it('handles invalid subjectsData in drawSubjectDonut safely', () => {
    const canvas = createMockCanvas();
    assert.doesNotThrow(() => ChartRenderer.drawSubjectDonut(canvas, null, true));
  });
});

describe('SoundManager Ambient Focus Audio & Settings', () => {
  it('toggles, switches, and stops ambient soundscapes cleanly', async () => {
    SoundManager.stopAllAmbient();
    assert.equal(SoundManager.isAmbientActive(), false);

    const started = SoundManager.toggleAmbient('rain');
    assert.equal(started, true);
    assert.equal(SoundManager.isAmbientActive('rain'), true);
    assert.equal(SoundManager.getActiveAmbient(), 'rain');

    // Switching to brown replaces rain
    SoundManager.toggleAmbient('brown');
    assert.equal(SoundManager.isAmbientActive('rain'), false);
    assert.equal(SoundManager.isAmbientActive('brown'), true);

    // Toggling brown off stops it
    const afterOff = SoundManager.toggleAmbient('brown');
    assert.equal(afterOff, false);
    assert.equal(SoundManager.isAmbientActive(), false);
  });

  it('clamps ambient volume to [0, 1] and tracks soundEnabled state', () => {
    assert.equal(SoundManager.setAmbientVolume(1.5), 1);
    assert.equal(SoundManager.setAmbientVolume(-0.4), 0);
    assert.equal(SoundManager.setAmbientVolume(0.6), 0.6);

    SoundManager.setSoundEnabled(false);
    assert.equal(SoundManager.isSoundEnabled(), false);
    SoundManager.setSoundEnabled(true);
    assert.equal(SoundManager.isSoundEnabled(), true);
  });
});

describe('StudyUtils Core Logic (Streaks, Drift, Manual Save, CSV, Filters)', () => {
  it('computes DST-safe streaks across calendar days', () => {
    // 2026-03-07, 2026-03-08 (US DST spring-forward), 2026-03-09
    const d1 = new Date(2026, 2, 7);
    const d2 = new Date(2026, 2, 8);
    const d3 = new Date(2026, 2, 9);
    const sessions = [
      { dateKey: JalaliDate.getJalaliDateKey(d1), durationMinutes: 25, verifiedMinutes: 25 },
      { dateKey: JalaliDate.getJalaliDateKey(d2), durationMinutes: 30, verifiedMinutes: 30 },
      { dateKey: JalaliDate.getJalaliDateKey(d3), durationMinutes: 20, verifiedMinutes: 20 }
    ];
    const streaks = StudyUtils.calculateStreaksFromSessions(sessions, JalaliDate, d3);
    assert.deepEqual(streaks, { current: 3, best: 3 });
  });

  it('ignores days with less than 10 verified minutes in streak calculation', () => {
    const today = new Date(2026, 5, 10);
    const sessions = [
      { dateKey: JalaliDate.getJalaliDateKey(today), durationMinutes: 25, verifiedMinutes: 5 }
    ];
    const streaks = StudyUtils.calculateStreaksFromSessions(sessions, JalaliDate, today);
    assert.deepEqual(streaks, { current: 0, best: 0 });
  });

  it('computes drift-free elapsed seconds from timestamps', () => {
    assert.equal(StudyUtils.computeElapsedSeconds(10000, 15400), 5);
    assert.equal(StudyUtils.computeElapsedSeconds(10000, 10500), 0);
    assert.equal(StudyUtils.computeElapsedSeconds(10000, 9000), 0);
  });

  it('computes manual save minutes accurately and blocks break-mode saves', () => {
    // Classic focus: 25 min total, 18 min left => 7 min elapsed
    assert.equal(StudyUtils.computeManualSaveMinutes('classic', 'focus', 1500, 1080, 0), 7);
    // Classic break: must return 0
    assert.equal(StudyUtils.computeManualSaveMinutes('classic', 'shortBreak', 300, 60, 0), 0);
    // Reverse mode: 365 seconds => 6 min
    assert.equal(StudyUtils.computeManualSaveMinutes('reverse', 'focus', 0, 0, 365), 6);
  });

  it('exports UTF-8 BOM CSV with proper RFC-4180 escaping for notes', () => {
    const subjects = [{ id: 'sub-1', name: 'ریاضیات' }];
    const sessions = [
      {
        dateKey: '1405-01-01',
        subjectId: 'sub-1',
        mode: 'classic',
        durationMinutes: 50,
        verifiedMinutes: 45,
        absentMinutes: 5,
        note: 'فصل ۱، "تمرین‌ها"'
      }
    ];
    const csv = StudyUtils.buildSessionsCSV(sessions, subjects);
    assert.ok(csv.startsWith('\uFEFFDate (Jalali),Subject,Mode,Nominal Minutes,Verified Minutes,Absent Minutes,Note'));
    assert.ok(csv.includes('"فصل ۱، ""تمرین‌ها"""'));
  });

  it('filters sessions by range and subject', () => {
    const today = new Date(2026, 4, 20);
    const twoDaysAgo = new Date(2026, 4, 18);
    const fortyDaysAgo = new Date(2026, 3, 10);

    const sessions = [
      { id: '1', subjectId: 'sub-1', dateKey: JalaliDate.getJalaliDateKey(today), durationMinutes: 25 },
      { id: '2', subjectId: 'sub-2', dateKey: JalaliDate.getJalaliDateKey(twoDaysAgo), durationMinutes: 25 },
      { id: '3', subjectId: 'sub-1', dateKey: JalaliDate.getJalaliDateKey(fortyDaysAgo), durationMinutes: 25 }
    ];

    const last7 = StudyUtils.filterSessions(sessions, { rangeDays: 7, subjectId: 'all', nowDate: today, jalaliLib: JalaliDate });
    assert.equal(last7.length, 2);

    const sub1Last7 = StudyUtils.filterSessions(sessions, { rangeDays: 7, subjectId: 'sub-1', nowDate: today, jalaliLib: JalaliDate });
    assert.equal(sub1Last7.length, 1);
    assert.equal(sub1Last7[0].id, '1');
  });

  it('computes subject target completion percentage cleanly', () => {
    assert.equal(StudyUtils.computeSubjectProgress(150, 5), 50);
    assert.equal(StudyUtils.computeSubjectProgress(400, 5), 100);
    assert.equal(StudyUtils.computeSubjectProgress(60, 0), null);
  });
});
