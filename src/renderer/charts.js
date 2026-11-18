/**
 * Pure Canvas Chart Renderer - 100% Offline, Zero-Dependency
 * Renders high-DPI weekly study charts and subject distribution donuts
 */
const ChartRenderer = (() => {
  function setupHiDPICanvas(canvas) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const rect = typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : { width: canvas.width || 400, height: canvas.height || 200 };
    const width = rect.width || canvas.width || 400;
    const height = rect.height || canvas.height || 200;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (typeof ctx.scale === 'function') {
      ctx.scale(dpr, dpr);
    }
    return { ctx, width, height };
  }

  function toFa(val) {
    if (typeof JalaliDate !== 'undefined' && JalaliDate.toPersianDigits) {
      return JalaliDate.toPersianDigits(val);
    }
    return String(val);
  }

  // Draw weekly bar chart (Saturday to Friday in Persian calendar)
  function drawWeeklyChart(canvas, daysData, targetHours = 4, isDark = false) {
    if (!canvas) return;
    const { ctx, width, height } = setupHiDPICanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    if (!Array.isArray(daysData) || daysData.length === 0) {
      ctx.font = '13px Vazirmatn, Segoe UI, sans-serif';
      ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('داده‌ای برای نمایش وجود ندارد', width / 2, height / 2);
      return;
    }

    const padding = { top: 35, bottom: 35, left: 20, right: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Max hours to scale
    const safeTarget = Math.max(0.5, Number(targetHours) || 4);
    const maxVal = Math.max(safeTarget * 1.3, ...daysData.map(d => d.hours || 0), 2);

    const barCount = daysData.length;
    const barWidth = Math.min(38, (chartW / barCount) * 0.55);
    const gap = chartW / barCount;

    // Colors
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const textBoldColor = isDark ? '#f3f4f6' : '#1f2937';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const targetLineColor = '#ff6b35';

    // Target Line
    const targetY = padding.top + chartH - (safeTarget / maxVal) * chartH;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = targetLineColor;
    ctx.lineWidth = 1.5;
    ctx.moveTo(padding.left, targetY);
    ctx.lineTo(width - padding.right, targetY);
    ctx.stroke();

    // Target label
    ctx.font = '10px Vazirmatn, Segoe UI, sans-serif';
    ctx.fillStyle = targetLineColor;
    ctx.textAlign = 'right';
    ctx.fillText(`هدف: ${toFa(safeTarget)}h`, width - padding.right, targetY - 4);
    ctx.restore();

    // Baseline
    ctx.beginPath();
    ctx.strokeStyle = gridLineColor;
    ctx.lineWidth = 1;
    ctx.moveTo(padding.left, padding.top + chartH);
    ctx.lineTo(width - padding.right, padding.top + chartH);
    ctx.stroke();

    // Draw bars
    daysData.forEach((day, i) => {
      const centerX = padding.left + i * gap + gap / 2;
      const x = centerX - barWidth / 2;
      const hours = Math.max(0, day.hours || 0);
      const barH = (hours / maxVal) * chartH;
      const y = padding.top + chartH - barH;

      // Draw background slot
      ctx.beginPath();
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
      roundRect(ctx, x, padding.top, barWidth, chartH, 6);
      ctx.fill();

      if (barH > 2) {
        // Bar Gradient
        const grad = ctx.createLinearGradient(0, y, 0, padding.top + chartH);
        if (day.isToday) {
          grad.addColorStop(0, '#ff6b35');
          grad.addColorStop(1, '#ff9566');
        } else if (hours >= safeTarget) {
          grad.addColorStop(0, '#10b981');
          grad.addColorStop(1, '#34d399');
        } else {
          grad.addColorStop(0, isDark ? '#4b5563' : '#9ca3af');
          grad.addColorStop(1, isDark ? '#374151' : '#d1d5db');
        }

        ctx.beginPath();
        roundRect(ctx, x, y, barWidth, barH, 6);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Hour text on top of bar
      ctx.font = 'bold 11px Vazirmatn, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = day.isToday ? '#ff6b35' : (hours > 0 ? textBoldColor : textColor);
      const displayTime = hours >= 1
        ? `${toFa(hours.toFixed(1))}h`
        : (hours > 0 ? `${toFa(Math.round(hours * 60))}m` : '۰');
      ctx.fillText(displayTime, centerX, Math.max(14, y - 6));

      // Day name at bottom
      ctx.font = day.isToday ? 'bold 12px Vazirmatn, Segoe UI, sans-serif' : '11px Vazirmatn, Segoe UI, sans-serif';
      ctx.fillStyle = day.isToday ? '#ff6b35' : textColor;
      ctx.fillText(day.label || '', centerX, height - 12);
    });
  }

  // Draw subject distribution donut chart
  function drawSubjectDonut(canvas, subjectsData, isDark = false) {
    if (!canvas) return;
    const { ctx, width, height } = setupHiDPICanvas(canvas);
    ctx.clearRect(0, 0, width, height);

    const safeSubjects = Array.isArray(subjectsData) ? subjectsData : [];
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(10, Math.min(centerX, centerY) - 15);
    const innerRadius = radius * 0.62;

    const totalMinutes = safeSubjects.reduce((acc, cur) => acc + Math.max(0, cur.minutes || 0), 0);

    if (totalMinutes === 0) {
      // Empty placeholder circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.arc(centerX, centerY, innerRadius, Math.PI * 2, 0, true);
      ctx.fillStyle = isDark ? '#262933' : '#e5e7eb';
      ctx.fill();

      ctx.font = '13px Vazirmatn, Segoe UI, sans-serif';
      ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('هنوز مطالعه‌ای نیست', centerX, centerY);
      return;
    }

    let startAngle = -Math.PI / 2;

    safeSubjects.forEach(sub => {
      const mins = Math.max(0, sub.minutes || 0);
      if (mins <= 0) return;
      const sliceAngle = (mins / totalMinutes) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = sub.color || '#ff6b35';
      ctx.fill();

      startAngle = endAngle;
    });

    // Inner cutout text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const totalHours = (totalMinutes / 60).toFixed(1);
    ctx.font = 'bold 18px Vazirmatn, Segoe UI, sans-serif';
    ctx.fillStyle = isDark ? '#f9fafb' : '#111827';
    ctx.fillText(`${toFa(totalHours)} ساعت`, centerX, centerY - 6);

    ctx.font = '11px Vazirmatn, Segoe UI, sans-serif';
    ctx.fillStyle = isDark ? '#9ca3af' : '#6b7280';
    ctx.fillText('مجموع مطالعه', centerX, centerY + 14);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    if (height < radius * 2) radius = height / 2;
    if (width < radius * 2) radius = width / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  return {
    drawWeeklyChart,
    drawSubjectDonut
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChartRenderer;
}
