/**
 * Changiz - Smart Study Tracker
 * Completely Offline, Local Storage Persistence, Dual Pomodoro + Reverse Mode
 */

(function () {
  'use strict';

  // --- Initial Default Data ---
  const DEFAULT_SUBJECTS = [
    { id: 'sub-1', name: 'ریاضیات و آمار', color: '#ff6b35' },
    { id: 'sub-2', name: 'فیزیک و شیمی', color: '#3b82f6' },
    { id: 'sub-3', name: 'زیست‌شناسی', color: '#10b981' },
    { id: 'sub-4', name: 'زبان انگلیسی', color: '#8b5cf6' },
    { id: 'sub-5', name: 'برنامه‌نویسی و کامپیوتر', color: '#06b6d4' }
  ];

  const PALETTE_COLORS = [
    '#ff6b35', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899',
    '#f59e0b', '#06b6d4', '#ef4444', '#14b8a6', '#6366f1'
  ];

  const DEFAULT_SETTINGS = {
    focusMinutes: 25,
    shortBreak: 5,
    longBreak: 15,
    dailyGoalHours: 4,
    soundEnabled: true,
    theme: 'dark',
    autoStartBreak: false,
    autoStartFocus: false,
    ambientVolume: 0.35
  };

  const DEFAULT_PAGE_TITLE = document.title;
  let listenersInitialized = false;

  const DEFAULT_PRESENCE = {
    enabled: true,
    scoreThreshold: 0.5,
    observations: [],
    latestStatus: 'PENDING', // 'PENDING' | 'PRESENT' | 'NOT_DETECTED' | 'UNKNOWN'
    persistSessionStream: true // Persist stream during active session to prevent repetitive browser permission popups
  };

  // --- State Object ---
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    subjects: [...DEFAULT_SUBJECTS],
    activeSubjectId: 'sub-1',
    sessions: [],
    tasks: [],
    presence: { ...DEFAULT_PRESENCE },
    timer: {
      mode: 'classic', // 'classic' or 'reverse'
      subMode: 'focus', // 'focus', 'shortBreak', 'longBreak'
      timeLeft: 25 * 60, // in seconds
      totalDuration: 25 * 60,
      isRunning: false,
      isEditing: false,
      intervalId: null,
      cycleCount: 0, // 0 to 4
      reverseElapsed: 0,
      earnedBreakSeconds: 0,
      currentSessionId: null,
      sessionStartTime: null,
      sessionAbsences: [],
      lastCheckTime: null,
      lastTickMs: null
    }
  };

  // --- Local Storage Management ---
  const STORAGE_KEY = 'changiz_store_v1';
  const LEGACY_STORAGE_KEY = 'bentodoro_persian_store_v1';

  function loadState() {
    try {
      let data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        data = localStorage.getItem(LEGACY_STORAGE_KEY);
      }
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.settings) state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        if (Array.isArray(parsed.subjects)) state.subjects = parsed.subjects;
        if (parsed.activeSubjectId !== undefined) state.activeSubjectId = parsed.activeSubjectId;
        if (parsed.sessions) state.sessions = parsed.sessions;
        if (parsed.tasks) state.tasks = parsed.tasks;
        if (parsed.presence) {
          state.presence = {
            ...DEFAULT_PRESENCE,
            ...parsed.presence,
            observations: Array.isArray(parsed.presence.observations) ? parsed.presence.observations.slice(0, 200) : []
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load local storage state:', e);
    }
  }

  function saveState() {
    try {
      const data = {
        settings: state.settings,
        subjects: state.subjects,
        activeSubjectId: state.activeSubjectId,
        sessions: state.sessions,
        tasks: state.tasks,
        presence: {
          enabled: state.presence.enabled,
          scoreThreshold: state.presence.scoreThreshold,
          observations: state.presence.observations.slice(0, 200),
          latestStatus: state.presence.latestStatus,
          persistSessionStream: state.presence.persistSessionStream !== false
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save state to local storage:', e);
    }
  }

  // --- DOM Elements ---
  const el = {
    dateText: document.getElementById('dateText'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    themeIcon: document.getElementById('themeIcon'),
    btnOpenSettings: document.getElementById('btnOpenSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    settingsModal: document.getElementById('settingsModal'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    settingFocusMinutes: document.getElementById('settingFocusMinutes'),
    settingShortBreak: document.getElementById('settingShortBreak'),
    settingLongBreak: document.getElementById('settingLongBreak'),
    settingDailyGoal: document.getElementById('settingDailyGoal'),
    settingSoundToggle: document.getElementById('settingSoundToggle'),
    settingAutoStartBreak: document.getElementById('settingAutoStartBreak'),
    settingAutoStartFocus: document.getElementById('settingAutoStartFocus'),
    sessionNoteInput: document.getElementById('sessionNoteInput'),
    ambientSoundBar: document.getElementById('ambientSoundBar'),
    ambientVolumeSlider: document.getElementById('ambientVolumeSlider'),

    // Timer
    btnModeClassic: document.getElementById('btnModeClassic'),
    btnModeReverse: document.getElementById('btnModeReverse'),
    classicSubModes: document.getElementById('classicSubModes'),
    btnSubFocus: document.getElementById('btnSubFocus'),
    btnSubShort: document.getElementById('btnSubShort'),
    btnSubLong: document.getElementById('btnSubLong'),
    timerClock: document.getElementById('timerClock'),
    timerClockInput: document.getElementById('timerClockInput'),
    timerEditHint: document.getElementById('timerEditHint'),
    timerSubtext: document.getElementById('timerSubtext'),
    reverseBreakBadge: document.getElementById('reverseBreakBadge'),
    earnedBreakTime: document.getElementById('earnedBreakTime'),
    timerProgressFill: document.getElementById('timerProgressFill'),
    cycleDots: document.getElementById('cycleDots'),
    btnTogglePlay: document.getElementById('btnTogglePlay'),
    playBtnText: document.getElementById('playBtnText'),
    playIcon: document.getElementById('playIcon'),
    btnSkipTimer: document.getElementById('btnSkipTimer'),
    btnResetTimer: document.getElementById('btnResetTimer'),
    btnSaveSessionManual: document.getElementById('btnSaveSessionManual'),
    activeSubjectSelect: document.getElementById('activeSubjectSelect'),
    btnManageSubjects: document.getElementById('btnManageSubjects'),
    btnManageSubjectsFromDonut: document.getElementById('btnManageSubjectsFromDonut'),

    // Streaks & Stats
    streakCurrentCount: document.getElementById('streakCurrentCount'),
    streakSubtext: document.getElementById('streakSubtext'),
    todayStudyTime: document.getElementById('todayStudyTime'),
    todayNominalTime: document.getElementById('todayNominalTime'),
    todaySessionsCount: document.getElementById('todaySessionsCount'),
    goalTargetText: document.getElementById('goalTargetText'),
    goalPercentText: document.getElementById('goalPercentText'),
    goalProgressFill: document.getElementById('goalProgressFill'),

    // Weekly Chart
    weeklyChartCanvas: document.getElementById('weeklyChartCanvas'),
    weeklyTotalText: document.getElementById('weeklyTotalText'),

    // Donut & Subjects
    subjectDonutCanvas: document.getElementById('subjectDonutCanvas'),
    subjectsLegendList: document.getElementById('subjectsLegendList'),

    // Heatmap
    heatmapGrid: document.getElementById('heatmapGrid'),
    heatmapStreakRecord: document.getElementById('heatmapStreakRecord'),

    // Tasks
    taskInput: document.getElementById('taskInput'),
    btnAddTask: document.getElementById('btnAddTask'),
    tasksList: document.getElementById('tasksList'),
    taskCompletionCount: document.getElementById('taskCompletionCount'),

    // Subjects Modal
    subjectsModal: document.getElementById('subjectsModal'),
    btnCloseSubjects: document.getElementById('btnCloseSubjects'),
    newSubjectName: document.getElementById('newSubjectName'),
    newSubjectTargetHours: document.getElementById('newSubjectTargetHours'),
    colorPickerRow: document.getElementById('colorPickerRow'),
    btnAddSubjectSubmit: document.getElementById('btnAddSubjectSubmit'),
    managedSubjectsList: document.getElementById('managedSubjectsList'),
    subjectsCountText: document.getElementById('subjectsCountText'),
    btnClearDefaultSubjects: document.getElementById('btnClearDefaultSubjects'),
    btnRestoreDefaultSubjects: document.getElementById('btnRestoreDefaultSubjects'),

    // History Modal
    historyModal: document.getElementById('historyModal'),
    btnOpenHistory: document.getElementById('btnOpenHistory'),
    btnCloseHistory: document.getElementById('btnCloseHistory'),
    historySessionsList: document.getElementById('historySessionsList'),
    manualSessionSubject: document.getElementById('manualSessionSubject'),
    manualSessionMinutes: document.getElementById('manualSessionMinutes'),
    manualSessionNote: document.getElementById('manualSessionNote'),
    btnAddManualSession: document.getElementById('btnAddManualSession'),
    historyRangeFilter: document.getElementById('historyRangeFilter'),
    historySubjectFilter: document.getElementById('historySubjectFilter'),
    historyFilteredSummary: document.getElementById('historyFilteredSummary'),

    // Backup Modal
    backupModal: document.getElementById('backupModal'),
    btnOpenBackup: document.getElementById('btnOpenBackup'),
    btnCloseBackup: document.getElementById('btnCloseBackup'),
    btnExportJSON: document.getElementById('btnExportJSON'),
    btnExportCSV: document.getElementById('btnExportCSV'),
    btnImportJSON: document.getElementById('btnImportJSON'),
    importFileInput: document.getElementById('importFileInput'),

    // Presence Monitoring Elements
    presenceBar: document.getElementById('presenceBar'),
    presenceDot: document.getElementById('presenceDot'),
    presenceStatusBadge: document.getElementById('presenceStatusBadge'),
    presenceCamLive: document.getElementById('presenceCamLive'),
    presenceSubtext: document.getElementById('presenceSubtext'),
    btnPresenceCheckNow: document.getElementById('btnPresenceCheckNow'),
    presenceToggleCheckbox: document.getElementById('presenceToggleCheckbox'),
    btnOpenPresenceInfo: document.getElementById('btnOpenPresenceInfo'),
    btnClosePresenceInfo: document.getElementById('btnClosePresenceInfo'),
    presenceInfoModal: document.getElementById('presenceInfoModal'),
    presenceLogsList: document.getElementById('presenceLogsList'),
    presenceLogCount: document.getElementById('presenceLogCount'),
    btnClearPresenceLogs: document.getElementById('btnClearPresenceLogs'),
    settingPresenceToggle: document.getElementById('settingPresenceToggle'),
    settingPresenceThreshold: document.getElementById('settingPresenceThreshold'),
    settingPresenceThresholdVal: document.getElementById('settingPresenceThresholdVal'),

    // Evidence Photo Modal
    evidenceModal: document.getElementById('evidenceModal'),
    evidenceImageDisplay: document.getElementById('evidenceImageDisplay'),
    evidenceMetaBox: document.getElementById('evidenceMetaBox'),
    btnCloseEvidence: document.getElementById('btnCloseEvidence'),
    btnCloseEvidenceBtn: document.getElementById('btnCloseEvidenceBtn')
  };

  // --- Initial Setup ---
  function init() {
    loadState();
    SoundManager.setSoundEnabled(state.settings.soundEnabled);
    SoundManager.setAmbientVolume(state.settings.ambientVolume !== undefined ? state.settings.ambientVolume : 0.35);
    if (el.ambientVolumeSlider) {
      el.ambientVolumeSlider.value = SoundManager.getAmbientVolume();
    }
    applyTheme(state.settings.theme);
    updateDateDisplay();
    populateSubjectsSelect();
    renderSubjectsLegend();
    renderTasks();
    renderHeatmap();
    updateStatsAndCharts();
    if (!listenersInitialized) {
      setupEventListeners();
      listenersInitialized = true;
    }
    resetTimerDisplay();
    initPresenceService();
  }

  function isFocusSessionActive() {
    return state.timer.isRunning && (state.timer.mode === 'reverse' || state.timer.subMode === 'focus');
  }

  function updateDocumentTitle(clockStr = null) {
    if (state.timer.isRunning && clockStr) {
      const modeLabel = state.timer.mode === 'reverse'
        ? 'تمرکز'
        : (state.timer.subMode === 'focus' ? 'تمرکز' : 'استراحت');
      document.title = `${clockStr} (${modeLabel}) | چنگیز`;
    } else {
      document.title = DEFAULT_PAGE_TITLE;
    }
  }

  // --- Date & Calendar ---
  function updateDateDisplay() {
    const today = JalaliDate.getTodayJalali();
    el.dateText.textContent = today.longFormatted;
  }

  // --- Theme Management ---
  function applyTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
    state.settings.theme = themeName;
    saveState();
    renderCharts();
  }

  function cycleTheme() {
    const themes = ['dark', 'light', 'bloom', 'retro'];
    const curIdx = themes.indexOf(state.settings.theme);
    const nextTheme = themes[(curIdx + 1) % themes.length];
    applyTheme(nextTheme);
  }

  // --- Subjects Management ---
  function populateSubjectsSelect() {
    el.activeSubjectSelect.innerHTML = '';
    if (!state.subjects.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(هیچ درسی تعریف نشده - افزودن درس)';
      el.activeSubjectSelect.appendChild(opt);
      state.activeSubjectId = '';
      return;
    }

    if (!state.subjects.some(s => s.id === state.activeSubjectId)) {
      state.activeSubjectId = state.subjects[0].id;
    }

    state.subjects.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.textContent = sub.name;
      if (sub.id === state.activeSubjectId) opt.selected = true;
      el.activeSubjectSelect.appendChild(opt);
    });

    populateHistorySubjectSelects();
  }

  function populateHistorySubjectSelects() {
    if (el.manualSessionSubject) {
      el.manualSessionSubject.innerHTML = '';
      if (!state.subjects.length) {
        const opt = document.createElement('option');
        opt.value = 'general';
        opt.textContent = 'عمومی';
        el.manualSessionSubject.appendChild(opt);
      } else {
        state.subjects.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub.id;
          opt.textContent = sub.name;
          if (sub.id === state.activeSubjectId) opt.selected = true;
          el.manualSessionSubject.appendChild(opt);
        });
      }
    }

    if (el.historySubjectFilter) {
      const prev = el.historySubjectFilter.value || 'all';
      el.historySubjectFilter.innerHTML = '<option value="all">همه دروس</option>';
      state.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = sub.name;
        if (sub.id === prev) opt.selected = true;
        el.historySubjectFilter.appendChild(opt);
      });
    }
  }

  function renderManagedSubjects() {
    el.managedSubjectsList.innerHTML = '';
    if (el.subjectsCountText) {
      el.subjectsCountText.textContent = `${JalaliDate.toPersianDigits(state.subjects.length)} درس`;
    }

    if (!state.subjects.length) {
      el.managedSubjectsList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 24px; font-size: 13px; line-height: 1.7;">
          هیچ درسی در لیست وجود ندارد.<br>از کادر بالا درس‌های دلخواه خود را اضافه کنید!
        </div>
      `;
      return;
    }

    state.subjects.forEach(sub => {
      const item = document.createElement('div');
      item.className = 'task-item';
      item.id = `subject-item-${sub.id}`;
      item.innerHTML = `
        <div class="task-left">
          <div style="width: 14px; height: 14px; border-radius: 50%; background: ${sub.color}; flex-shrink: 0; box-shadow: 0 0 8px ${sub.color}80;"></div>
          <span class="task-title" style="font-weight: 700;">${escapeHTML(sub.name)}</span>
          ${sub.targetHours > 0 ? `<span class="task-tag" style="background: ${sub.color}20; color: ${sub.color};">هدف: ${JalaliDate.toPersianDigits(sub.targetHours)} ساعت</span>` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="card-action-btn btn-edit-subject" data-subid="${sub.id}" title="ویرایش نام یا رنگ درس">✏️ ویرایش</button>
          <button class="task-delete btn-delete-subject" data-subid="${sub.id}" title="حذف این درس">✕</button>
        </div>
      `;
      el.managedSubjectsList.appendChild(item);
    });

    // Delete buttons
    el.managedSubjectsList.querySelectorAll('.btn-delete-subject').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-subid');
        state.subjects = state.subjects.filter(s => s.id !== id);
        if (state.activeSubjectId === id) {
          state.activeSubjectId = state.subjects[0]?.id || '';
        }
        saveState();
        populateSubjectsSelect();
        renderManagedSubjects();
        renderSubjectsLegend();
        renderCharts();
        renderTasks();
      });
    });

    // Edit buttons
    el.managedSubjectsList.querySelectorAll('.btn-edit-subject').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-subid');
        openEditSubjectInline(id);
      });
    });
  }

  function openEditSubjectInline(subId) {
    const sub = state.subjects.find(s => s.id === subId);
    if (!sub) return;

    const row = document.getElementById(`subject-item-${subId}`);
    if (!row) return;

    let currentColor = sub.color;

    row.innerHTML = `
      <div class="subject-edit-wrap">
        <div class="subject-edit-row">
          <input type="text" class="form-input" id="edit-sub-input-${sub.id}" value="${escapeHTML(sub.name)}" style="padding: 7px 10px; font-size: 13px;">
          <input type="number" class="form-input" id="edit-sub-target-${sub.id}" value="${sub.targetHours || ''}" min="0" max="500" step="0.5" placeholder="هدف (ساعت)" style="padding: 7px 8px; font-size: 12px; width: 92px;">
          <button class="btn-mini-save" id="btn-save-edit-${sub.id}">ذخیره</button>
          <button class="btn-mini-cancel" id="btn-cancel-edit-${sub.id}">انصراف</button>
        </div>
        <div class="color-picker-row mini" id="edit-color-picker-${sub.id}">
          ${PALETTE_COLORS.map(c => `
            <div class="color-option ${c.toLowerCase() === currentColor.toLowerCase() ? 'selected' : ''}" style="background: ${c};" data-color="${c}"></div>
          `).join('')}
        </div>
      </div>
    `;

    const input = row.querySelector(`#edit-sub-input-${sub.id}`);
    input.focus();
    input.select();

    // Color options
    row.querySelectorAll(`#edit-color-picker-${sub.id} .color-option`).forEach(opt => {
      opt.addEventListener('click', () => {
        row.querySelectorAll(`#edit-color-picker-${sub.id} .color-option`).forEach(c => c.classList.remove('selected'));
        opt.classList.add('selected');
        currentColor = opt.getAttribute('data-color');
      });
    });

    // Save
    const targetInput = row.querySelector(`#edit-sub-target-${sub.id}`);
    const saveFunc = () => {
      const newName = input.value.trim();
      if (!newName) return;
      sub.name = newName;
      sub.color = currentColor;
      const parsedTarget = targetInput ? parseFloat(targetInput.value) : 0;
      sub.targetHours = (!isNaN(parsedTarget) && parsedTarget > 0) ? parsedTarget : 0;
      saveState();
      populateSubjectsSelect();
      renderManagedSubjects();
      renderSubjectsLegend();
      renderCharts();
      renderTasks();
    };

    row.querySelector(`#btn-save-edit-${sub.id}`).addEventListener('click', saveFunc);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveFunc();
      else if (e.key === 'Escape') renderManagedSubjects();
    });

    row.querySelector(`#btn-cancel-edit-${sub.id}`).addEventListener('click', () => {
      renderManagedSubjects();
    });
  }

  // --- Timer Engine ---
  function resetTimerDisplay() {
    if (presenceServiceInstance) {
      presenceServiceInstance.stop();
    }
    state.timer.currentSessionId = null;
    state.timer.sessionStartTime = null;
    state.timer.sessionAbsences = [];
    state.timer.lastCheckTime = null;
    state.timer.lastTickMs = null;
    updateDocumentTitle(null);
    updatePresenceUI();

    // Update submode pills with current settings
    el.btnSubFocus.textContent = `تمرکز (${JalaliDate.toPersianDigits(state.settings.focusMinutes)} دقیقه)`;
    el.btnSubShort.textContent = `استراحت کوتاه (${JalaliDate.toPersianDigits(state.settings.shortBreak)} دقیقه)`;
    el.btnSubLong.textContent = `استراحت طولانی (${JalaliDate.toPersianDigits(state.settings.longBreak)} دقیقه)`;

    if (state.timer.mode === 'classic') {
      let mins = state.settings.focusMinutes;
      if (state.timer.subMode === 'shortBreak') mins = state.settings.shortBreak;
      if (state.timer.subMode === 'longBreak') mins = state.settings.longBreak;

      state.timer.totalDuration = mins * 60;
      state.timer.timeLeft = state.timer.totalDuration;
      el.timerClock.textContent = formatClock(state.timer.timeLeft);
      el.timerProgressFill.style.width = '0%';
      el.reverseBreakBadge.style.display = 'none';

      if (state.timer.subMode === 'focus') {
        el.timerSubtext.textContent = 'زمان تمرکز عمیق روی مبحث انتخابی';
      } else {
        el.timerSubtext.textContent = 'زمان استراحت، نوشیدن آب و کشش عضلات!';
      }
    } else {
      // Reverse Mode
      state.timer.reverseElapsed = 0;
      state.timer.earnedBreakSeconds = 0;
      el.timerClock.textContent = '۰۰:۰۰';
      el.timerProgressFill.style.width = '100%';
      el.timerSubtext.textContent = 'شمارش صعودی تمرکز آزاد — به ازای هر ۵ دقیقه، ۱ دقیقه استراحت اندوخته کنید';
      el.reverseBreakBadge.style.display = 'inline-flex';
      el.earnedBreakTime.textContent = '۰ دقیقه';
    }

    updateCycleDots();
    updatePlayButton();
  }

  function formatClock(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const mStr = String(mins).padStart(2, '0');
    const sStr = String(secs).padStart(2, '0');
    return `${JalaliDate.toPersianDigits(mStr)}:${JalaliDate.toPersianDigits(sStr)}`;
  }

  function updateCycleDots() {
    const dots = el.cycleDots.querySelectorAll('.cycle-dot');
    dots.forEach((dot, idx) => {
      dot.className = 'cycle-dot';
      if (idx < state.timer.cycleCount) {
        dot.classList.add('completed');
      } else if (idx === state.timer.cycleCount && state.timer.subMode === 'focus') {
        dot.classList.add('current');
      }
    });
  }

  function updatePlayButton() {
    if (state.timer.isRunning) {
      el.playBtnText.textContent = 'توقف موقت';
      el.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
      el.playBtnText.textContent = state.timer.mode === 'classic' ? 'شروع مطالعه' : 'شروع تمرکز آزاد';
      el.playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
  }

  function toggleTimer() {
    if (state.timer.isRunning) {
      pauseTimer();
      SoundManager.playNotification('pause');
    } else {
      startTimer();
      SoundManager.playNotification('start');
    }
  }

  function startTimer() {
    if (state.timer.isRunning) return;
    if (state.timer.isEditing) commitTimerEdit();

    const now = Date.now();
    state.timer.isRunning = true;
    state.timer.lastTickMs = now;
    if (!state.timer.currentSessionId && (state.timer.mode === 'reverse' || state.timer.subMode === 'focus')) {
      state.timer.currentSessionId = 'sess-' + now;
      state.timer.sessionStartTime = now;
      state.timer.sessionAbsences = [];
      state.timer.lastCheckTime = now;
    }
    updatePlayButton();
    updateDocumentTitle(formatClock(state.timer.mode === 'classic' ? state.timer.timeLeft : state.timer.reverseElapsed));

    // Only monitor presence during active study/focus intervals (not breaks)
    if (presenceServiceInstance && state.presence.enabled && isFocusSessionActive()) {
      presenceServiceInstance.start();
    }
    updatePresenceUI();

    state.timer.intervalId = setInterval(() => {
      tickTimer();
    }, 500);
  }

  function pauseTimer() {
    if (!state.timer.isRunning) return;
    state.timer.isRunning = false;
    state.timer.lastTickMs = null;
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
    updatePlayButton();
    updateDocumentTitle(null);

    if (presenceServiceInstance) {
      presenceServiceInstance.stop();
    }
    updatePresenceUI();
  }

  function tickTimer() {
    const now = Date.now();
    const elapsed = StudyUtils.computeElapsedSeconds(state.timer.lastTickMs, now);
    if (elapsed <= 0) return;
    state.timer.lastTickMs += elapsed * 1000;

    if (state.timer.mode === 'classic') {
      if (state.timer.timeLeft > 0) {
        state.timer.timeLeft = Math.max(0, state.timer.timeLeft - elapsed);
        const clockStr = formatClock(state.timer.timeLeft);
        el.timerClock.textContent = clockStr;
        updateDocumentTitle(clockStr);

        const progressPercent = state.timer.totalDuration > 0
          ? ((state.timer.totalDuration - state.timer.timeLeft) / state.timer.totalDuration) * 100
          : 100;
        el.timerProgressFill.style.width = `${progressPercent}%`;

        if (state.timer.timeLeft <= 0) {
          handleClassicTimerComplete();
        }
      } else {
        handleClassicTimerComplete();
      }
    } else {
      // Reverse Mode
      state.timer.reverseElapsed += elapsed;
      const clockStr = formatClock(state.timer.reverseElapsed);
      el.timerClock.textContent = clockStr;
      updateDocumentTitle(clockStr);

      // Earned break: 1 min break per 5 min focus
      const earnedMins = Math.floor(state.timer.reverseElapsed / 300);
      el.earnedBreakTime.textContent = `${JalaliDate.toPersianDigits(earnedMins)} دقیقه`;
    }
  }

  function sendDesktopNotification(title, body) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch (_) {
      // Ignore notification errors in restricted offline contexts
    }
  }

  function handleClassicTimerComplete() {
    const finishedSubMode = state.timer.subMode;
    pauseTimer();
    if (presenceServiceInstance) {
      presenceServiceInstance.stop();
    }
    SoundManager.playNotification('complete');

    if (finishedSubMode === 'focus') {
      // Record completed session
      const completedMins = Math.max(1, Math.round(state.timer.totalDuration / 60));
      recordSession(completedMins, 'classic');
      sendDesktopNotification('چنگیز — پایان تمرکز!', `عالی بود! ${JalaliDate.toPersianDigits(completedMins)} دقیقه مطالعه ثبت شد. زمان استراحت است.`);

      state.timer.cycleCount = (state.timer.cycleCount + 1) % 4;

      if (state.timer.cycleCount === 0) {
        setSubMode('longBreak');
      } else {
        setSubMode('shortBreak');
      }

      if (state.settings.autoStartBreak) {
        startTimer();
      }
    } else {
      // Break finished -> Back to focus
      sendDesktopNotification('چنگیز — پایان استراحت!', 'زمان شروع جلسه تمرکز بعدی رسیده است.');
      setSubMode('focus');

      if (state.settings.autoStartFocus) {
        startTimer();
      }
    }

    updateStatsAndCharts();
  }

  function setSubMode(subMode) {
    pauseTimer();
    state.timer.subMode = subMode;
    document.querySelectorAll('.sub-mode-pill').forEach(pill => {
      pill.classList.toggle('active', pill.getAttribute('data-submode') === subMode);
    });
    resetTimerDisplay();
  }

  // --- Timer Direct Click-to-Edit ---
  function toEnglishDigits(str) {
    if (!str) return '';
    return String(str)
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }

  function enterTimerEditMode() {
    if (state.timer.isEditing) return;
    state.timer.isEditing = true;

    if (state.timer.isRunning) {
      pauseTimer();
    }

    let currentVal = '';
    if (state.timer.mode === 'classic') {
      const totalSecs = state.timer.timeLeft;
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      if (secs === 0) {
        currentVal = String(mins);
      } else {
        currentVal = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    } else {
      const mins = Math.floor(state.timer.reverseElapsed / 60);
      currentVal = String(mins || 25);
    }

    el.timerClock.style.display = 'none';
    el.timerClockInput.style.display = 'block';
    el.timerClockInput.value = currentVal;
    el.timerEditHint.textContent = '↵ اینتر برای تأیید | Esc برای انصراف';
    el.timerEditHint.style.color = 'var(--primary)';

    el.timerClockInput.focus();
    el.timerClockInput.select();
  }

  function commitTimerEdit() {
    if (!state.timer.isEditing) return;
    state.timer.isEditing = false;

    const rawVal = el.timerClockInput.value.trim();
    const enVal = toEnglishDigits(rawVal);

    el.timerClockInput.style.display = 'none';
    el.timerClock.style.display = 'block';
    el.timerEditHint.textContent = '✏️ برای ویرایش مستقیم زمان، روی عدد کلیک کنید';
    el.timerEditHint.style.color = '';

    if (!enVal) {
      resetTimerDisplay();
      return;
    }

    let totalSecs = 0;
    if (enVal.includes(':')) {
      const parts = enVal.split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      totalSecs = m * 60 + s;
    } else {
      const m = parseFloat(enVal);
      if (!isNaN(m) && m > 0) {
        totalSecs = Math.round(m * 60);
      }
    }

    if (totalSecs < 10 || totalSecs > 720 * 60) {
      alert('لطفاً یک زمان معتبر بین ۱ تا ۷۲۰ دقیقه وارد کنید.');
      resetTimerDisplay();
      return;
    }

    if (state.timer.mode === 'reverse') {
      state.timer.mode = 'classic';
      el.btnModeClassic.classList.add('active');
      el.btnModeReverse.classList.remove('active');
      el.classicSubModes.style.display = 'flex';
    }

    const mins = Math.max(1, Math.round(totalSecs / 60));
    state.timer.totalDuration = totalSecs;
    state.timer.timeLeft = totalSecs;

    if (state.timer.subMode === 'focus') {
      state.settings.focusMinutes = mins;
      el.btnSubFocus.textContent = `تمرکز (${JalaliDate.toPersianDigits(mins)} دقیقه)`;
    } else if (state.timer.subMode === 'shortBreak') {
      state.settings.shortBreak = mins;
      el.btnSubShort.textContent = `استراحت کوتاه (${JalaliDate.toPersianDigits(mins)} دقیقه)`;
    } else if (state.timer.subMode === 'longBreak') {
      state.settings.longBreak = mins;
      el.btnSubLong.textContent = `استراحت طولانی (${JalaliDate.toPersianDigits(mins)} دقیقه)`;
    }

    saveState();
    el.timerClock.textContent = formatClock(state.timer.timeLeft);
    el.timerProgressFill.style.width = '0%';
  }

  function cancelTimerEdit() {
    if (!state.timer.isEditing) return;
    state.timer.isEditing = false;
    el.timerClockInput.style.display = 'none';
    el.timerClock.style.display = 'block';
    el.timerEditHint.textContent = '✏️ برای ویرایش مستقیم زمان، روی عدد کلیک کنید';
    el.timerEditHint.style.color = '';
    el.timerClock.textContent = formatClock(state.timer.timeLeft);
  }

  function recordSession(durationMinutes, mode = 'classic', customOptions = {}) {
    if (durationMinutes <= 0) return;

    const isManualEntry = mode === 'manual';
    const absences = isManualEntry
      ? []
      : (Array.isArray(state.timer.sessionAbsences) ? [...state.timer.sessionAbsences] : []);
    const totalAbsentMinutes = absences.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
    const absentMinutes = Math.min(durationMinutes, totalAbsentMinutes);
    const verifiedMinutes = Math.max(0, durationMinutes - absentMinutes);

    const noteText = customOptions.note !== undefined
      ? String(customOptions.note).trim()
      : (el.sessionNoteInput ? el.sessionNoteInput.value.trim() : '');

    const session = {
      id: (!isManualEntry && state.timer.currentSessionId) ? state.timer.currentSessionId : ('sess-' + Date.now()),
      subjectId: customOptions.subjectId || state.activeSubjectId || 'general',
      durationMinutes: Math.round(durationMinutes), // ساعت غیرواقعی (ثبت‌شده با تایمر یا کرنومتر)
      verifiedMinutes: Math.round(verifiedMinutes), // ساعت واقعی (تأییدشده با وبکم)
      absentMinutes: Math.round(absentMinutes),
      absences,
      mode,
      note: noteText,
      dateKey: customOptions.dateKey || JalaliDate.getJalaliDateKey(),
      timestamp: Date.now()
    };

    state.sessions.unshift(session);
    if (!isManualEntry) {
      state.timer.currentSessionId = null;
      state.timer.sessionStartTime = null;
      state.timer.sessionAbsences = [];
      state.timer.lastCheckTime = null;
      if (el.sessionNoteInput) el.sessionNoteInput.value = '';
    }

    saveState();
    updateStatsAndCharts();
    renderHeatmap();
  }

  // Save reverse mode session
  function saveCurrentReverseSession() {
    if (state.timer.mode === 'reverse' && state.timer.reverseElapsed >= 60) {
      const minutes = Math.floor(state.timer.reverseElapsed / 60);
      recordSession(minutes, 'reverse');
      pauseTimer();
      state.timer.reverseElapsed = 0;
      resetTimerDisplay();
      SoundManager.playNotification('complete');
    }
  }

  // --- Streaks and Stats Calculation ---
  function calculateStreaks() {
    return StudyUtils.calculateStreaksFromSessions(state.sessions, JalaliDate, new Date(), 10);
  }

  function updateStatsAndCharts() {
    const todayKey = JalaliDate.getJalaliDateKey();
    const todaySessions = state.sessions.filter(s => s.dateKey === todayKey);
    const todayNominalMinutes = todaySessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    const todayVerifiedMinutes = todaySessions.reduce((acc, s) => acc + (s.verifiedMinutes !== undefined ? s.verifiedMinutes : s.durationMinutes), 0);

    // Today display: Real Verified Time (ساعت واقعی با تأیید وبکم)
    const vHours = Math.floor(todayVerifiedMinutes / 60);
    const vMins = todayVerifiedMinutes % 60;
    el.todayStudyTime.textContent = vHours > 0
      ? `${JalaliDate.toPersianDigits(vHours)} ساعت و ${JalaliDate.toPersianDigits(vMins)} دقیقه`
      : `${JalaliDate.toPersianDigits(vMins)} دقیقه`;

    // Today display: Nominal Time (ساعت غیرواقعی تایمر / کرنومتر)
    if (el.todayNominalTime) {
      const nHours = Math.floor(todayNominalMinutes / 60);
      const nMins = todayNominalMinutes % 60;
      el.todayNominalTime.textContent = nHours > 0
        ? `${JalaliDate.toPersianDigits(nHours)} ساعت و ${JalaliDate.toPersianDigits(nMins)} دقیقه`
        : `${JalaliDate.toPersianDigits(nMins)} دقیقه`;
    }

    // Sessions & Attendance percentage
    const attendancePct = todayNominalMinutes > 0 ? Math.round((todayVerifiedMinutes / todayNominalMinutes) * 100) : 100;
    el.todaySessionsCount.textContent = `${JalaliDate.toPersianDigits(todaySessions.length)} جلسه • ${JalaliDate.toPersianDigits(attendancePct)}٪ حضور مفید`;

    // Daily Goal (measured against verified study time)
    const goalMinutes = state.settings.dailyGoalHours * 60;
    const goalPercent = Math.min(100, Math.round((todayVerifiedMinutes / goalMinutes) * 100));
    el.goalTargetText.textContent = `${JalaliDate.toPersianDigits(state.settings.dailyGoalHours)} ساعت`;
    el.goalPercentText.textContent = `${JalaliDate.toPersianDigits(goalPercent)}٪ محقق شده`;
    el.goalProgressFill.style.width = `${goalPercent}%`;

    // Streaks
    const streaks = calculateStreaks();
    el.streakCurrentCount.textContent = JalaliDate.toPersianDigits(streaks.current);
    el.heatmapStreakRecord.textContent = `بهترین زنجیره: ${JalaliDate.toPersianDigits(streaks.best)} روز`;

    if (streaks.current > 0) {
      el.streakSubtext.textContent = `عالیه! زنجیره ${JalaliDate.toPersianDigits(streaks.current)} روزه شما فعال است.`;
    } else {
      el.streakSubtext.textContent = 'برای روشن نگه داشتن آتش، امروز حداقل ۱ جلسه بخوانید!';
    }

    renderCharts();
    renderSubjectsLegend();
  }

  // --- Charts Rendering ---
  function renderCharts() {
    const isDark = document.body.getAttribute('data-theme') !== 'light';

    // 1. Weekly Chart (Saturday to Friday)
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const persianDayIdx = (currentDayOfWeek + 1) % 7;

    const satDate = new Date(now);
    satDate.setDate(now.getDate() - persianDayIdx);
    satDate.setHours(0, 0, 0, 0);

    const weekLabels = ['شنبه', '۱شنبه', '۲شنبه', '۳شنبه', '۴شنبه', '۵شنبه', 'جمعه'];
    const weekData = [];
    let weekVerifiedMinutes = 0;
    let weekTotalMinutes = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(satDate);
      d.setDate(satDate.getDate() + i);
      const dateKey = JalaliDate.getJalaliDateKey(d);

      const daySessions = state.sessions.filter(s => s.dateKey === dateKey);
      const dayVerifiedMins = daySessions.reduce((sum, s) => sum + (s.verifiedMinutes !== undefined ? s.verifiedMinutes : s.durationMinutes), 0);
      const dayTotalMins = daySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

      weekVerifiedMinutes += dayVerifiedMins;
      weekTotalMinutes += dayTotalMins;
      const isToday = i === persianDayIdx;

      weekData.push({
        label: weekLabels[i],
        hours: dayVerifiedMins / 60,
        isToday
      });
    }

    const weekVerifiedHours = (weekVerifiedMinutes / 60).toFixed(1);
    const weekTotalHours = (weekTotalMinutes / 60).toFixed(1);
    el.weeklyTotalText.textContent = `واقعی: ${JalaliDate.toPersianDigits(weekVerifiedHours)}h | اسمی: ${JalaliDate.toPersianDigits(weekTotalHours)}h`;

    ChartRenderer.drawWeeklyChart(el.weeklyChartCanvas, weekData, state.settings.dailyGoalHours, isDark);

    // 2. Subject Distribution Donut
    const subjectMap = {};
    state.subjects.forEach(s => {
      subjectMap[s.id] = { name: s.name, color: s.color, minutes: 0 };
    });

    state.sessions.forEach(s => {
      if (subjectMap[s.subjectId]) {
        subjectMap[s.subjectId].minutes += (s.verifiedMinutes !== undefined ? s.verifiedMinutes : s.durationMinutes);
      }
    });

    const subjectsData = Object.values(subjectMap);
    ChartRenderer.drawSubjectDonut(el.subjectDonutCanvas, subjectsData, isDark);
  }

  function renderSubjectsLegend() {
    el.subjectsLegendList.innerHTML = '';
    if (!state.subjects.length) {
      el.subjectsLegendList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 18px; font-size: 12.5px;">
          هیچ درسی برای نمایش وجود ندارد.
        </div>
      `;
      return;
    }

    const subjectMap = {};
    state.subjects.forEach(s => {
      subjectMap[s.id] = { name: s.name, color: s.color, minutes: 0 };
    });
    state.sessions.forEach(s => {
      if (subjectMap[s.subjectId]) {
        const vMins = s.verifiedMinutes !== undefined ? s.verifiedMinutes : (s.durationMinutes || 0);
        subjectMap[s.subjectId].minutes += vMins;
      }
    });

    const totalMinutes = Object.values(subjectMap).reduce((acc, s) => acc + s.minutes, 0) || 1;

    state.subjects.forEach(sub => {
      const mins = subjectMap[sub.id]?.minutes || 0;
      const pct = Math.round((mins / totalMinutes) * 100);
      const targetPct = StudyUtils.computeSubjectProgress(mins, sub.targetHours);

      const wrap = document.createElement('div');
      wrap.className = 'legend-item-wrap';
      wrap.innerHTML = `
        <div class="legend-item">
          <div class="legend-name">
            <div class="legend-dot" style="background: ${sub.color};"></div>
            <span>${escapeHTML(sub.name)}</span>
          </div>
          <div class="legend-time">${JalaliDate.toPersianDigits(Math.round(mins / 60 * 10) / 10)}h (${JalaliDate.toPersianDigits(pct)}٪)${targetPct !== null ? ` • هدف ${JalaliDate.toPersianDigits(targetPct)}٪` : ''}</div>
        </div>
        ${targetPct !== null ? `
          <div class="subject-target-bar" title="پیشرفت هدف: ${JalaliDate.toPersianDigits(targetPct)}٪ از ${JalaliDate.toPersianDigits(sub.targetHours)} ساعت">
            <div class="subject-target-fill" style="width: ${targetPct}%; background: ${sub.color};"></div>
          </div>
        ` : ''}
      `;
      el.subjectsLegendList.appendChild(wrap);
    });
  }

  // --- Heatmap Activity Matrix ---
  function renderHeatmap() {
    el.heatmapGrid.innerHTML = '';
    const totalDays = 16 * 7; // 16 weeks
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayMap = {};
    state.sessions.forEach(s => {
      const vMins = s.verifiedMinutes !== undefined ? s.verifiedMinutes : (s.durationMinutes || 0);
      dayMap[s.dateKey] = (dayMap[s.dateKey] || 0) + vMins;
    });

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateKey = JalaliDate.getJalaliDateKey(d);
      const mins = dayMap[dateKey] || 0;

      let level = 0;
      if (mins > 0 && mins < 45) level = 1;
      else if (mins >= 45 && mins < 120) level = 2;
      else if (mins >= 120 && mins < 240) level = 3;
      else if (mins >= 240) level = 4;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.setAttribute('data-level', level);

      const jDate = JalaliDate.gregorianToJalali(d.getFullYear(), d.getMonth(), d.getDate());
      const dateTitle = `${JalaliDate.toPersianDigits(jDate.jd)} ${JalaliDate.PERSIAN_MONTHS[jDate.jm - 1]}: ${JalaliDate.toPersianDigits(Math.round(mins))} دقیقه مطالعه`;
      cell.title = dateTitle;

      el.heatmapGrid.appendChild(cell);
    }
  }

  // --- Tasks / Checklist Management ---
  function renderTasks() {
    el.tasksList.innerHTML = '';
    const completedCount = state.tasks.filter(t => t.completed).length;
    el.taskCompletionCount.textContent = `${JalaliDate.toPersianDigits(completedCount)} از ${JalaliDate.toPersianDigits(state.tasks.length)} انجام شده`;

    if (!state.tasks.length) {
      el.tasksList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 24px; font-size: 13px;">
          هیچ کاری برای امروز ثبت نشده است. تسک جدید اضافه کنید!
        </div>
      `;
      return;
    }

    state.tasks.forEach(task => {
      const sub = state.subjects.find(s => s.id === task.subjectId);
      const subName = sub ? sub.name : 'عمومی';
      const subColor = sub ? sub.color : '#ff6b35';

      const item = document.createElement('div');
      item.className = `task-item ${task.completed ? 'completed' : ''}`;
      item.innerHTML = `
        <div class="task-left">
          <input type="checkbox" class="task-checkbox" data-taskid="${task.id}" ${task.completed ? 'checked' : ''}>
          <span class="task-title">${escapeHTML(task.text)}</span>
          <span class="task-tag" style="background: ${subColor}20; color: ${subColor};">${escapeHTML(subName)}</span>
        </div>
        <button class="task-delete" data-taskid="${task.id}" title="حذف تسک">✕</button>
      `;
      el.tasksList.appendChild(item);
    });

    el.tasksList.querySelectorAll('.task-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-taskid');
        const task = state.tasks.find(t => t.id === id);
        if (task) {
          task.completed = e.target.checked;
          saveState();
          renderTasks();
        }
      });
    });

    el.tasksList.querySelectorAll('.task-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-taskid');
        state.tasks = state.tasks.filter(t => t.id !== id);
        saveState();
        renderTasks();
      });
    });
  }

  function addNewTask() {
    const text = el.taskInput.value.trim();
    if (!text) return;

    state.tasks.unshift({
      id: 'task-' + Date.now(),
      text,
      subjectId: state.activeSubjectId || null,
      completed: false,
      dateKey: JalaliDate.getJalaliDateKey()
    });

    el.taskInput.value = '';
    saveState();
    renderTasks();
  }

  function openEvidenceModal(absence, session = null, subjectName = 'عمومی') {
    if (!el.evidenceModal || !el.evidenceImageDisplay) return;

    el.evidenceImageDisplay.src = absence.evidenceSnapshot || '';
    if (el.evidenceMetaBox) {
      el.evidenceMetaBox.innerHTML = `
        <div><strong>📚 مبحث / درس:</strong> ${escapeHTML(subjectName)}</div>
        <div><strong>⏱️ بازه عدم حضور:</strong> از ساعت <strong>${JalaliDate.toPersianDigits(absence.fromTime || '')}</strong> تا <strong>${JalaliDate.toPersianDigits(absence.toTime || '')}</strong> (${JalaliDate.toPersianDigits(absence.durationMinutes || 5)} دقیقه)</div>
        <div><strong>👤 تشخیص هوش مصنوعی:</strong> در ۵ فریم متوالی وبکم، هیچ شخصی در برابر دوربین شناسایی نشد (تأیید خالی بودن کادر).</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 6px;">💡 در طول این بازه تایمر متوقف نشد، ولی برای شفافیت در گزارش، این ۵ دقیقه از ساعت واقعی مطالعه تفکیک گردید.</div>
      `;
    }
    el.evidenceModal.classList.add('open');
  }

  // --- Session History Log ---
  function renderHistorySessions() {
    el.historySessionsList.innerHTML = '';
    const rangeVal = el.historyRangeFilter ? el.historyRangeFilter.value : 'all';
    const subjectVal = el.historySubjectFilter ? el.historySubjectFilter.value : 'all';
    const filtered = StudyUtils.filterSessions(state.sessions, {
      rangeDays: rangeVal === 'all' ? 'all' : parseInt(rangeVal, 10),
      subjectId: subjectVal,
      nowDate: new Date(),
      jalaliLib: JalaliDate
    });

    if (el.historyFilteredSummary) {
      const totalVerified = filtered.reduce((acc, s) => acc + (s.verifiedMinutes !== undefined ? s.verifiedMinutes : (s.durationMinutes || 0)), 0);
      const hrs = (totalVerified / 60).toFixed(1);
      el.historyFilteredSummary.textContent = `${JalaliDate.toPersianDigits(filtered.length)} جلسه • ${JalaliDate.toPersianDigits(hrs)} ساعت واقعی`;
    }

    if (!filtered.length) {
      el.historySessionsList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 30px;">
          هیچ جلسه مطالعه‌ای با این فیلتر یافت نشد.
        </div>
      `;
      return;
    }

    filtered.forEach(sess => {
      const sub = state.subjects.find(s => s.id === sess.subjectId) || { name: 'عمومی', color: '#ff6b35' };
      const [jy, jm, jd] = (sess.dateKey || '').split('-');
      const dateStr = jd ? `${JalaliDate.toPersianDigits(jd)} ${JalaliDate.PERSIAN_MONTHS[+jm - 1]} ${JalaliDate.toPersianDigits(jy)}` : '';

      const nominalMinutes = sess.durationMinutes || 0;
      const verifiedMinutes = sess.verifiedMinutes !== undefined ? sess.verifiedMinutes : nominalMinutes;
      const absentMinutes = sess.absentMinutes !== undefined ? sess.absentMinutes : Math.max(0, nominalMinutes - verifiedMinutes);
      const absences = Array.isArray(sess.absences) ? sess.absences : [];

      const card = document.createElement('div');
      card.className = 'history-session-card';

      let absenceBadgeHtml = '';
      let drawerHtml = '';

      if (absences.length > 0) {
        absenceBadgeHtml = `
          <span class="history-pill history-pill-absence">
            ⚠️ ${JalaliDate.toPersianDigits(absences.length)} بار عدم حضور (${JalaliDate.toPersianDigits(absentMinutes)} دقیقه)
          </span>
          <button class="btn-toggle-absence" data-sessid="${sess.id}">
            📷 مدارک عدم حضور (${JalaliDate.toPersianDigits(absences.length)}) ▾
          </button>
        `;

        let intervalsHtml = '';
        absences.forEach((a, idx) => {
          const thumbHtml = a.evidenceSnapshot
            ? `<button class="absence-thumb-btn" data-abidx="${idx}" data-sessid="${sess.id}" title="مشاهده بزرگ‌تر عکس">
                 <img src="${a.evidenceSnapshot}" class="absence-thumb-img" alt="مدرک عدم حضور" />
                 <span>مشاهده عکس 🔍</span>
               </button>`
            : `<span style="color: var(--text-dim); font-size: 11px;">(بدون عکس)</span>`;

          intervalsHtml += `
            <div class="absence-interval-row">
              <div class="absence-interval-text">
                <span>⏱️</span>
                <span>بازه غیبت: از ساعت <strong>${JalaliDate.toPersianDigits(a.fromTime)}</strong> تا <strong>${JalaliDate.toPersianDigits(a.toTime)}</strong> (${JalaliDate.toPersianDigits(a.durationMinutes || 5)} دقیقه)</span>
              </div>
              ${thumbHtml}
            </div>
          `;
        });

        drawerHtml = `
          <div class="absence-drawer" id="drawer-${sess.id}" style="display: none;">
            <div style="font-size: 11px; color: #f87171; font-weight: 700; margin-bottom: 4px;">
              📌 بازه‌های عدم تشخیص شخص پشت سیستم در این جلسه:
            </div>
            ${intervalsHtml}
          </div>
        `;
      } else {
        absenceBadgeHtml = `<span class="history-pill history-pill-full">✅ ۱۰۰٪ حضور کامل در تمام مدت</span>`;
      }

      card.innerHTML = `
        <div class="history-card-top">
          <div class="history-meta-group">
            <div class="history-subject-indicator" style="background: ${sub.color};"></div>
            <div>
              <div style="font-weight: 700; font-size: 14px;">${escapeHTML(sub.name)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${dateStr} • حالت: ${sess.mode === 'classic' ? 'کلاسیک' : (sess.mode === 'manual' ? 'ثبت دستی' : 'معکوس')}</div>
            </div>
          </div>
          <button class="task-delete" data-sessid="${sess.id}" title="حذف این جلسه">✕</button>
        </div>

        ${sess.note ? `<div class="history-session-note">📝 ${escapeHTML(sess.note)}</div>` : ''}

        <div class="history-time-badges">
          <span class="history-pill history-pill-verified" title="ساعت واقعی با تایید وبکم">
            🟢 ساعت واقعی: ${JalaliDate.toPersianDigits(verifiedMinutes)} دقیقه
          </span>
          <span class="history-pill history-pill-nominal" title="ساعت غیرواقعی (ثبت‌شده با تایمر/کرنومتر)">
            ⏱️ ساعت غیرواقعی (تایمر): ${JalaliDate.toPersianDigits(nominalMinutes)} دقیقه
          </span>
          ${absenceBadgeHtml}
        </div>

        ${drawerHtml}
      `;

      el.historySessionsList.appendChild(card);
    });

    el.historySessionsList.querySelectorAll('.task-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-sessid');
        state.sessions = state.sessions.filter(s => s.id !== id);
        saveState();
        renderHistorySessions();
        updateStatsAndCharts();
        renderHeatmap();
      });
    });

    el.historySessionsList.querySelectorAll('.btn-toggle-absence').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessId = e.currentTarget.getAttribute('data-sessid');
        const drawer = document.getElementById(`drawer-${sessId}`);
        if (drawer) {
          const isHidden = drawer.style.display === 'none';
          drawer.style.display = isHidden ? 'flex' : 'none';
          e.currentTarget.textContent = isHidden ? 'بستن مدارک ▴' : `📷 مدارک عدم حضور ▾`;
        }
      });
    });

    el.historySessionsList.querySelectorAll('.absence-thumb-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessId = e.currentTarget.getAttribute('data-sessid');
        const abIdx = parseInt(e.currentTarget.getAttribute('data-abidx'), 10);
        const sess = state.sessions.find(s => s.id === sessId);
        if (sess && sess.absences && sess.absences[abIdx]) {
          const sub = state.subjects.find(s => s.id === sess.subjectId) || { name: 'عمومی' };
          openEvidenceModal(sess.absences[abIdx], sess, sub.name);
        }
      });
    });
  }

  // --- Backup / Restore Functions ---
  function exportData() {
    const backup = {
      app: 'Changiz',
      version: '1.1.1',
      exportedAt: new Date().toISOString(),
      state: {
        settings: state.settings,
        subjects: state.subjects,
        sessions: state.sessions,
        tasks: state.tasks,
        presence: state.presence
      }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `changiz-study-backup-${JalaliDate.getJalaliDateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const csvContent = StudyUtils.buildSessionsCSV(state.sessions, state.subjects);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `changiz-study-sessions-${JalaliDate.getJalaliDateKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.state) {
          if (data.state.settings) state.settings = { ...DEFAULT_SETTINGS, ...data.state.settings };
          if (Array.isArray(data.state.subjects)) state.subjects = data.state.subjects;
          if (data.state.sessions) state.sessions = data.state.sessions;
          if (data.state.tasks) state.tasks = data.state.tasks;
          if (data.state.presence) {
            state.presence = { ...DEFAULT_PRESENCE, ...data.state.presence };
            if (presenceServiceInstance) {
              presenceServiceInstance.updateConfig({
                enabled: state.presence.enabled,
                scoreThreshold: state.presence.scoreThreshold
              });
            }
          }

          saveState();
          init();
          el.backupModal.classList.remove('open');
          alert('اطلاعات با موفقیت بازیابی شد!');
        } else {
          alert('فرمت فایل پشتیبان معتبر نیست.');
        }
      } catch (err) {
        alert('خطا در خواندن فایل: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // --- Periodic Human Presence Detection Integration ---
  let presenceServiceInstance = null;

  function initPresenceService() {
    if (typeof PresenceService === 'undefined') {
      console.warn('PresenceService is not available in global scope.');
      return;
    }

    if (presenceServiceInstance) {
      presenceServiceInstance.dispose();
      presenceServiceInstance = null;
    }

    presenceServiceInstance = new PresenceService({
      isSessionActive: () => isFocusSessionActive(),
      getCurrentSessionId: () => state.timer.currentSessionId || ('sess-' + Date.now()),
      onCheckStart: () => {
        if (el.presenceCamLive) el.presenceCamLive.style.display = 'inline-flex';
        if (el.presenceStatusBadge) {
          el.presenceStatusBadge.textContent = 'در حال بررسی وب‌کم...';
          el.presenceStatusBadge.className = 'presence-badge-status badge-checking';
        }
        if (el.presenceDot) {
          el.presenceDot.className = 'presence-dot dot-checking';
        }
        if (el.btnPresenceCheckNow) {
          el.btnPresenceCheckNow.disabled = true;
        }
      },
      onStatusChange: (status) => {
        state.presence.latestStatus = status;
        updatePresenceUI();
      },
      onCheckComplete: (observation) => {
        if (el.presenceCamLive) el.presenceCamLive.style.display = 'none';
        if (el.btnPresenceCheckNow) el.btnPresenceCheckNow.disabled = false;
        state.presence.latestStatus = observation.status;
        state.presence.observations.unshift(observation);
        if (state.presence.observations.length > 200) {
          state.presence.observations = state.presence.observations.slice(0, 200);
        }

        // If person was NOT detected during active study session:
        if (observation.status === 'NOT_DETECTED' && isFocusSessionActive()) {
          const nowTime = new Date(observation.checkedAt).getTime();
          const lastTime = state.timer.lastCheckTime || (nowTime - 5 * 60 * 1000);
          const intervalMinutes = Math.max(1, Math.min(15, Math.round((nowTime - lastTime) / (60 * 1000)))) || 5;
          const fromDate = new Date(nowTime - intervalMinutes * 60 * 1000);
          const toDate = new Date(nowTime);

          const fromTime = `${String(fromDate.getHours()).padStart(2, '0')}:${String(fromDate.getMinutes()).padStart(2, '0')}`;
          const toTime = `${String(toDate.getHours()).padStart(2, '0')}:${String(toDate.getMinutes()).padStart(2, '0')}`;

          const absenceItem = {
            id: observation.id,
            fromTime,
            toTime,
            durationMinutes: intervalMinutes,
            evidenceSnapshot: observation.evidenceSnapshot || null,
            checkedAt: observation.checkedAt,
            timestamp: nowTime
          };

          if (!Array.isArray(state.timer.sessionAbsences)) {
            state.timer.sessionAbsences = [];
          }
          state.timer.sessionAbsences.push(absenceItem);
          state.timer.lastCheckTime = nowTime;

          if (el.presenceSubtext) {
            el.presenceSubtext.textContent = `ثبت عدم حضور از ساعت ${JalaliDate.toPersianDigits(fromTime)} تا ${JalaliDate.toPersianDigits(toTime)} (${JalaliDate.toPersianDigits(intervalMinutes)} دقیقه) • تایمر ادامه دارد`;
          }
        } else if (observation.status === 'PRESENT') {
          state.timer.lastCheckTime = new Date(observation.checkedAt).getTime();
        }

        saveState();
        updatePresenceUI();
        renderPresenceLogs();
      },
      onCheckError: (err) => {
        if (el.presenceCamLive) el.presenceCamLive.style.display = 'none';
        if (el.btnPresenceCheckNow) el.btnPresenceCheckNow.disabled = false;
        console.warn('Presence check error:', err);
        updatePresenceUI();
      }
    }, {
      enabled: state.presence.enabled,
      scoreThreshold: state.presence.scoreThreshold,
      persistSessionStream: state.presence.persistSessionStream !== false
    });

    updatePresenceUI();
    renderPresenceLogs();
  }

  function updatePresenceUI() {
    if (!el.presenceBar) return;

    const enabled = state.presence.enabled;
    const isRunning = isFocusSessionActive();
    const status = state.presence.latestStatus || 'PENDING';

    if (el.presenceToggleCheckbox) {
      el.presenceToggleCheckbox.checked = enabled;
    }
    if (el.settingPresenceToggle) {
      el.settingPresenceToggle.checked = enabled;
    }
    if (el.settingPresenceThreshold) {
      el.settingPresenceThreshold.value = state.presence.scoreThreshold;
    }
    if (el.settingPresenceThresholdVal) {
      el.settingPresenceThresholdVal.textContent = JalaliDate.toPersianDigits(state.presence.scoreThreshold.toFixed(2));
    }

    if (!enabled) {
      if (el.presenceDot) el.presenceDot.className = 'presence-dot dot-disabled';
      if (el.presenceStatusBadge) {
        el.presenceStatusBadge.className = 'presence-badge-status badge-disabled';
        el.presenceStatusBadge.textContent = 'پایش غیرفعال';
      }
      if (el.presenceSubtext) {
        el.presenceSubtext.textContent = 'پایش هوشمند حضور خاموش است (از دکمه روبرو فعال کنید)';
      }
      return;
    }

    if (!isRunning) {
      if (el.presenceDot) el.presenceDot.className = 'presence-dot';
      if (el.presenceStatusBadge) {
        el.presenceStatusBadge.className = 'presence-badge-status';
        el.presenceStatusBadge.textContent = 'در انتظار شروع مطالعه';
      }
      if (el.presenceSubtext) {
        el.presenceSubtext.textContent = 'بررسی ۵ فریم هر ۵ دقیقه • پردازش ۱۰۰٪ محلی آفلاین';
      }
      return;
    }

    // Session is active
    let badgeClass = 'presence-badge-status';
    let dotClass = 'presence-dot';
    let badgeText = 'در حال پایش...';

    if (status === 'PRESENT') {
      badgeClass = 'presence-badge-status badge-present';
      dotClass = 'presence-dot dot-present';
      badgeText = 'حضور تأیید شد';
    } else if (status === 'NOT_DETECTED') {
      badgeClass = 'presence-badge-status badge-not-detected';
      dotClass = 'presence-dot dot-not-detected';
      badgeText = 'عدم تشخیص در کادر';
    } else if (status === 'UNKNOWN') {
      badgeClass = 'presence-badge-status badge-unknown';
      dotClass = 'presence-dot dot-unknown';
      badgeText = 'خطای فنی / بدون دسترسی دوربین';
    } else {
      badgeClass = 'presence-badge-status badge-checking';
      dotClass = 'presence-dot dot-checking';
      badgeText = 'در انتظار اولین بررسی ۵ دقیقه';
    }

    if (el.presenceStatusBadge) {
      el.presenceStatusBadge.className = badgeClass;
      el.presenceStatusBadge.textContent = badgeText;
    }
    if (el.presenceDot) {
      el.presenceDot.className = dotClass;
    }

    if (el.presenceSubtext) {
      if (state.presence.observations.length > 0) {
        const lastObs = state.presence.observations[0];
        const dt = new Date(lastObs.checkedAt);
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;
        el.presenceSubtext.textContent = `آخرین بررسی: ${JalaliDate.toPersianDigits(timeStr)} • ${JalaliDate.toPersianDigits(lastObs.positiveFrames)}/${JalaliDate.toPersianDigits(lastObs.totalFrames)} فریم مثبت`;
      } else {
        el.presenceSubtext.textContent = 'بررسی ۵ فریم هر ۵ دقیقه • پردازش ۱۰۰٪ محلی آفلاین';
      }
    }
  }

  function renderPresenceLogs() {
    if (!el.presenceLogsList) return;

    const logs = state.presence.observations || [];
    if (el.presenceLogCount) {
      el.presenceLogCount.textContent = `${JalaliDate.toPersianDigits(logs.length)} ثبت`;
    }

    if (!logs.length) {
      el.presenceLogsList.innerHTML = `
        <div class="presence-empty-logs">
          هنوز هیچ بررسی حضوری ثبت نشده است.<br>
          با شروع مطالعه یا کلیک روی «بررسی اکنون»، نتایج پایش اینجا ثبت می‌شوند.
        </div>
      `;
      return;
    }

    let html = '';
    logs.forEach(obs => {
      const dt = new Date(obs.checkedAt);
      const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;
      const jalaliStr = JalaliDate.getJalaliDateKey(dt);

      let badgeHtml = '';
      if (obs.status === 'PRESENT') {
        badgeHtml = `<span class="presence-log-badge badge-present">🟢 حضور تایید شد</span>`;
      } else if (obs.status === 'NOT_DETECTED') {
        badgeHtml = `<span class="presence-log-badge badge-not-detected">🟡 عدم تشخیص</span>`;
      } else {
        badgeHtml = `<span class="presence-log-badge badge-unknown">⚪ نامشخص (${obs.errorReason || 'خطا'})</span>`;
      }

      const confText = obs.confidence > 0 ? `اطمینان: ${JalaliDate.toPersianDigits(Math.round(obs.confidence * 100))}٪` : '';
      const modeText = obs.isManual ? 'تست دستی' : 'خودکار ۵دقیقه';

      let evidenceBtnHtml = '';
      if (obs.evidenceSnapshot) {
        evidenceBtnHtml = `
          <button class="absence-thumb-btn log-evidence-btn" data-obsid="${obs.id}" style="margin-top: 6px;">
            <img src="${obs.evidenceSnapshot}" class="absence-thumb-img" alt="مدرک" />
            <span>مشاهده عکس مدرک عدم حضور 🔍</span>
          </button>
        `;
      }

      html += `
        <div class="presence-log-entry">
          <div class="presence-log-meta">
            ${badgeHtml}
            <span class="presence-log-time">${JalaliDate.toPersianDigits(jalaliStr)} ${JalaliDate.toPersianDigits(timeStr)}</span>
          </div>
          <div class="presence-log-detail">
            <span>${JalaliDate.toPersianDigits(obs.positiveFrames)}/${JalaliDate.toPersianDigits(obs.totalFrames)} فریم</span>
            ${confText ? `<span>• ${confText}</span>` : ''}
            <span>• ${modeText}</span>
          </div>
          ${evidenceBtnHtml}
        </div>
      `;
    });

    el.presenceLogsList.innerHTML = html;

    el.presenceLogsList.querySelectorAll('.log-evidence-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const obsId = e.currentTarget.getAttribute('data-obsid');
        const obs = logs.find(o => o.id === obsId);
        if (obs && obs.evidenceSnapshot) {
          const dt = new Date(obs.checkedAt);
          const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
          openEvidenceModal({
            fromTime: timeStr,
            toTime: timeStr,
            durationMinutes: 5,
            evidenceSnapshot: obs.evidenceSnapshot
          }, null, 'پایش هوشمند وبکم');
        }
      });
    });
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Theme
    el.btnThemeToggle.addEventListener('click', cycleTheme);

    // Mode Toggle (Classic / Reverse)
    el.btnModeClassic.addEventListener('click', () => {
      if (state.timer.mode === 'classic') return;
      pauseTimer();
      state.timer.mode = 'classic';
      el.btnModeClassic.classList.add('active');
      el.btnModeReverse.classList.remove('active');
      el.classicSubModes.style.display = 'flex';
      setSubMode('focus');
    });

    el.btnModeReverse.addEventListener('click', () => {
      if (state.timer.mode === 'reverse') return;
      pauseTimer();
      state.timer.mode = 'reverse';
      el.btnModeReverse.classList.add('active');
      el.btnModeClassic.classList.remove('active');
      el.classicSubModes.style.display = 'none';
      resetTimerDisplay();
    });

    // Submodes
    el.btnSubFocus.addEventListener('click', () => setSubMode('focus'));
    el.btnSubShort.addEventListener('click', () => setSubMode('shortBreak'));
    el.btnSubLong.addEventListener('click', () => setSubMode('longBreak'));

    // Timer Controls
    el.btnTogglePlay.addEventListener('click', toggleTimer);
    el.btnResetTimer.addEventListener('click', () => {
      pauseTimer();
      resetTimerDisplay();
    });

    el.btnSkipTimer.addEventListener('click', () => {
      if (state.timer.mode === 'classic') {
        pauseTimer();
        if (state.timer.subMode === 'focus') {
          setSubMode('shortBreak');
        } else {
          setSubMode('focus');
        }
      }
    });

    el.btnSaveSessionManual.addEventListener('click', () => {
      const elapsedMins = StudyUtils.computeManualSaveMinutes(
        state.timer.mode,
        state.timer.subMode,
        state.timer.totalDuration,
        state.timer.timeLeft,
        state.timer.reverseElapsed
      );
      if (state.timer.mode === 'classic' && state.timer.subMode !== 'focus') {
        alert('ثبت جلسه تنها در حالت تمرکز امکان‌پذیر است.');
        return;
      }
      if (elapsedMins < 1) {
        alert('حداقل ۱ دقیقه از زمان مطالعه باید گذشته باشد تا جلسه ثبت شود.');
        return;
      }
      if (state.timer.mode === 'reverse') {
        saveCurrentReverseSession();
      } else {
        recordSession(elapsedMins, 'classic');
        pauseTimer();
        resetTimerDisplay();
        SoundManager.playNotification('complete');
      }
    });

    // Timer Direct Click-to-Edit
    el.timerClock.addEventListener('click', enterTimerEditMode);
    el.timerEditHint.addEventListener('click', enterTimerEditMode);

    el.timerClockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commitTimerEdit();
      } else if (e.key === 'Escape') {
        cancelTimerEdit();
      }
    });

    el.timerClockInput.addEventListener('blur', () => {
      if (state.timer.isEditing) {
        commitTimerEdit();
      }
    });

    // Active Subject Select
    el.activeSubjectSelect.addEventListener('change', (e) => {
      state.activeSubjectId = e.target.value;
      saveState();
    });

    // Tasks
    el.btnAddTask.addEventListener('click', addNewTask);
    el.taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addNewTask();
    });

    // Modals
    // Settings
    el.btnOpenSettings.addEventListener('click', () => {
      el.settingFocusMinutes.value = state.settings.focusMinutes;
      el.settingShortBreak.value = state.settings.shortBreak;
      el.settingLongBreak.value = state.settings.longBreak;
      el.settingDailyGoal.value = state.settings.dailyGoalHours;
      el.settingSoundToggle.checked = state.settings.soundEnabled;
      if (el.settingAutoStartBreak) el.settingAutoStartBreak.checked = !!state.settings.autoStartBreak;
      if (el.settingAutoStartFocus) el.settingAutoStartFocus.checked = !!state.settings.autoStartFocus;
      if (el.settingPresenceToggle) el.settingPresenceToggle.checked = state.presence.enabled;
      if (el.settingPresenceThreshold) el.settingPresenceThreshold.value = state.presence.scoreThreshold;
      if (el.settingPresenceThresholdVal) el.settingPresenceThresholdVal.textContent = JalaliDate.toPersianDigits(state.presence.scoreThreshold.toFixed(2));
      el.settingsModal.classList.add('open');
    });
    el.btnCloseSettings.addEventListener('click', () => el.settingsModal.classList.remove('open'));
    el.btnSaveSettings.addEventListener('click', () => {
      state.settings.focusMinutes = Math.max(1, parseInt(el.settingFocusMinutes.value) || 25);
      state.settings.shortBreak = Math.max(1, parseInt(el.settingShortBreak.value) || 5);
      state.settings.longBreak = Math.max(1, parseInt(el.settingLongBreak.value) || 15);
      state.settings.dailyGoalHours = Math.max(0.5, parseFloat(el.settingDailyGoal.value) || 4);
      state.settings.soundEnabled = el.settingSoundToggle.checked;
      if (el.settingAutoStartBreak) state.settings.autoStartBreak = el.settingAutoStartBreak.checked;
      if (el.settingAutoStartFocus) state.settings.autoStartFocus = el.settingAutoStartFocus.checked;
      SoundManager.setSoundEnabled(state.settings.soundEnabled);

      if (el.settingPresenceToggle) {
        handlePresenceToggle(el.settingPresenceToggle.checked);
      }
      if (el.settingPresenceThreshold) {
        const thresh = parseFloat(el.settingPresenceThreshold.value) || 0.5;
        state.presence.scoreThreshold = thresh;
        if (presenceServiceInstance) {
          presenceServiceInstance.updateConfig({ scoreThreshold: thresh });
        }
      }

      saveState();
      resetTimerDisplay();
      updateStatsAndCharts();
      updatePresenceUI();
      el.settingsModal.classList.remove('open');
    });

    // --- Presence Monitoring Events ---
    const handlePresenceToggle = (enabled) => {
      state.presence.enabled = enabled;
      if (presenceServiceInstance) {
        presenceServiceInstance.setEnabled(enabled);
        if (enabled && isFocusSessionActive()) {
          presenceServiceInstance.start();
        } else {
          presenceServiceInstance.stop();
        }
      }
      saveState();
      updatePresenceUI();
    };

    if (el.presenceToggleCheckbox) {
      el.presenceToggleCheckbox.addEventListener('change', (e) => {
        handlePresenceToggle(e.target.checked);
      });
    }

    if (el.settingPresenceToggle) {
      el.settingPresenceToggle.addEventListener('change', (e) => {
        handlePresenceToggle(e.target.checked);
      });
    }

    if (el.settingPresenceThreshold) {
      el.settingPresenceThreshold.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0.5;
        state.presence.scoreThreshold = val;
        if (el.settingPresenceThresholdVal) {
          el.settingPresenceThresholdVal.textContent = JalaliDate.toPersianDigits(val.toFixed(2));
        }
        if (presenceServiceInstance) {
          presenceServiceInstance.updateConfig({ scoreThreshold: val });
        }
        saveState();
      });
    }

    if (el.btnPresenceCheckNow) {
      el.btnPresenceCheckNow.addEventListener('click', async () => {
        if (!presenceServiceInstance) return;
        try {
          await presenceServiceInstance.checkNow();
        } catch (err) {
          alert('خطا در ارزیابی حضور با وب‌کم: ' + (err.message || err));
        }
      });
    }

    if (el.btnOpenPresenceInfo) {
      el.btnOpenPresenceInfo.addEventListener('click', () => {
        renderPresenceLogs();
        if (el.presenceInfoModal) el.presenceInfoModal.classList.add('open');
      });
    }

    if (el.btnClosePresenceInfo) {
      el.btnClosePresenceInfo.addEventListener('click', () => {
        if (el.presenceInfoModal) el.presenceInfoModal.classList.remove('open');
      });
    }

    if (el.btnClearPresenceLogs) {
      el.btnClearPresenceLogs.addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام تاریخچه بررسی‌های حضور را پاک کنید؟')) {
          state.presence.observations = [];
          saveState();
          renderPresenceLogs();
          updatePresenceUI();
        }
      });
    }

    // Subjects Modal Open/Close
    const openSubjectsModal = () => {
      renderManagedSubjects();
      el.subjectsModal.classList.add('open');
    };

    el.btnManageSubjects.addEventListener('click', openSubjectsModal);
    if (el.btnManageSubjectsFromDonut) {
      el.btnManageSubjectsFromDonut.addEventListener('click', openSubjectsModal);
    }
    el.btnCloseSubjects.addEventListener('click', () => el.subjectsModal.classList.remove('open'));

    // Color options in add form
    let selectedColor = '#ff6b35';
    el.colorPickerRow.querySelectorAll('.color-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        el.colorPickerRow.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
        opt.classList.add('selected');
        selectedColor = opt.getAttribute('data-color');
      });
    });

    // Add subject submit
    el.btnAddSubjectSubmit.addEventListener('click', () => {
      const name = el.newSubjectName.value.trim();
      if (!name) {
        alert('لطفاً نام درس را وارد کنید.');
        el.newSubjectName.focus();
        return;
      }
      const parsedTarget = el.newSubjectTargetHours ? parseFloat(el.newSubjectTargetHours.value) : 0;
      const newSub = {
        id: 'sub-' + Date.now(),
        name,
        color: selectedColor,
        targetHours: (!isNaN(parsedTarget) && parsedTarget > 0) ? parsedTarget : 0
      };
      state.subjects.push(newSub);
      if (!state.activeSubjectId) {
        state.activeSubjectId = newSub.id;
      }
      el.newSubjectName.value = '';
      if (el.newSubjectTargetHours) el.newSubjectTargetHours.value = '';
      saveState();
      populateSubjectsSelect();
      renderManagedSubjects();
      renderSubjectsLegend();
      renderCharts();
    });

    el.newSubjectName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        el.btnAddSubjectSubmit.click();
      }
    });

    // Clear all subjects (to customize cleanly)
    if (el.btnClearDefaultSubjects) {
      el.btnClearDefaultSubjects.addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام دروس فعلی را حذف کنید تا دروس اختصاصی خود را وارد نمایید؟')) {
          state.subjects = [];
          state.activeSubjectId = '';
          saveState();
          populateSubjectsSelect();
          renderManagedSubjects();
          renderSubjectsLegend();
          renderCharts();
          renderTasks();
        }
      });
    }

    // Restore default sample subjects
    if (el.btnRestoreDefaultSubjects) {
      el.btnRestoreDefaultSubjects.addEventListener('click', () => {
        state.subjects = JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
        state.activeSubjectId = state.subjects[0]?.id || '';
        saveState();
        populateSubjectsSelect();
        renderManagedSubjects();
        renderSubjectsLegend();
        renderCharts();
        renderTasks();
      });
    }

    // History
    el.btnOpenHistory.addEventListener('click', () => {
      populateHistorySubjectSelects();
      renderHistorySessions();
      el.historyModal.classList.add('open');
    });
    el.btnCloseHistory.addEventListener('click', () => el.historyModal.classList.remove('open'));

    if (el.historyRangeFilter) {
      el.historyRangeFilter.addEventListener('change', renderHistorySessions);
    }
    if (el.historySubjectFilter) {
      el.historySubjectFilter.addEventListener('change', renderHistorySessions);
    }
    if (el.btnAddManualSession) {
      el.btnAddManualSession.addEventListener('click', () => {
        const mins = parseInt(el.manualSessionMinutes ? el.manualSessionMinutes.value : '0', 10);
        if (!mins || mins < 1 || mins > 720) {
          alert('لطفاً مدت زمان معتبر بین ۱ تا ۷۲۰ دقیقه وارد کنید.');
          return;
        }
        const subId = (el.manualSessionSubject && el.manualSessionSubject.value) || state.activeSubjectId || 'general';
        const note = el.manualSessionNote ? el.manualSessionNote.value.trim() : '';
        recordSession(mins, 'manual', { subjectId: subId, note });
        if (el.manualSessionNote) el.manualSessionNote.value = '';
        renderHistorySessions();
      });
    }

    // Evidence Photo Modal
    if (el.btnCloseEvidence) {
      el.btnCloseEvidence.addEventListener('click', () => el.evidenceModal.classList.remove('open'));
    }
    if (el.btnCloseEvidenceBtn) {
      el.btnCloseEvidenceBtn.addEventListener('click', () => el.evidenceModal.classList.remove('open'));
    }

    // Backup
    el.btnOpenBackup.addEventListener('click', () => el.backupModal.classList.add('open'));
    el.btnCloseBackup.addEventListener('click', () => el.backupModal.classList.remove('open'));
    el.btnExportJSON.addEventListener('click', exportData);
    if (el.btnExportCSV) {
      el.btnExportCSV.addEventListener('click', exportCSV);
    }
    el.btnImportJSON.addEventListener('click', () => el.importFileInput.click());
    el.importFileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        importData(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Ambient Focus Audio Controls
    if (el.ambientSoundBar) {
      el.ambientSoundBar.querySelectorAll('.ambient-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-ambient');
          const isNowActive = SoundManager.toggleAmbient(type);
          el.ambientSoundBar.querySelectorAll('.ambient-pill').forEach(p => {
            p.classList.toggle('active', isNowActive && p.getAttribute('data-ambient') === type);
          });
        });
      });
    }

    if (el.ambientVolumeSlider) {
      el.ambientVolumeSlider.addEventListener('input', (e) => {
        const vol = SoundManager.setAmbientVolume(parseFloat(e.target.value));
        state.settings.ambientVolume = vol;
        saveState();
      });
    }

    // Global Keyboard Shortcuts (Space: Play/Pause, R: Reset, S: Skip, Esc: Close Modals)
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);

      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        return;
      }
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      } else if (e.key === 'r' || e.key === 'R') {
        pauseTimer();
        resetTimerDisplay();
      } else if (e.key === 's' || e.key === 'S') {
        el.btnSkipTimer.click();
      }
    });

    // Close modals on clicking overlay background
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });

    // Window Resize -> Re-draw Canvas charts with high-DPI clarity
    window.addEventListener('resize', () => {
      renderCharts();
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // Initialize on load
  document.addEventListener('DOMContentLoaded', init);
})();
