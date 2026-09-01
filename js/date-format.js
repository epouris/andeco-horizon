/**
 * App-wide date/time display helpers.
 * Standard: dd/mm/yyyy and HH:mm (24-hour — no AM/PM).
 * Storage / <input type="date"> values stay ISO YYYY-MM-DD.
 * Datetime storage (e.g. project board): YYYY-MM-DDTHH:mm
 */
(function (global) {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseAmPmHour(h12, ap) {
    var h = Number(h12);
    if (!Number.isFinite(h) || h < 1 || h > 12) return null;
    var isPm = String(ap || '').toLowerCase().indexOf('p') === 0;
    h = h % 12;
    if (isPm) h += 12;
    return h;
  }

  function parseDateParts(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return {
        y: value.getFullYear(),
        m: value.getMonth() + 1,
        d: value.getDate(),
        h: value.getHours(),
        min: value.getMinutes(),
        hasTime: true
      };
    }

    var raw = String(value).trim();
    if (!raw) return null;

    // Time-only with optional AM/PM (e.g. 14:30, 2:30 PM)
    var timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?$/);
    if (timeOnly && !/\d{4}/.test(raw)) {
      var th = Number(timeOnly[1]);
      var tm = Number(timeOnly[2]);
      if (timeOnly[4]) {
        th = parseAmPmHour(th, timeOnly[4]);
        if (th == null) return null;
      }
      if (!Number.isFinite(th) || th < 0 || th > 23 || tm < 0 || tm > 59) return null;
      return { y: 1970, m: 1, d: 1, h: th, min: tm, hasTime: true, timeOnly: true };
    }

    // dd/mm/yyyy or dd/mm/yyyy HH:mm [AM/PM]
    var dmy = raw.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)?)?$/
    );
    if (dmy) {
      var dh = dmy[4] != null ? Number(dmy[4]) : 0;
      var dmin = dmy[5] != null ? Number(dmy[5]) : 0;
      if (dmy[6]) {
        dh = parseAmPmHour(dh, dmy[6]);
        if (dh == null) return null;
      }
      return {
        y: Number(dmy[3]),
        m: Number(dmy[2]),
        d: Number(dmy[1]),
        h: dh,
        min: dmin,
        hasTime: dmy[4] != null
      };
    }

    // Date-only YYYY-MM-DD — parse as local calendar day (avoid UTC off-by-one).
    var ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
      return {
        y: Number(ymd[1]),
        m: Number(ymd[2]),
        d: Number(ymd[3]),
        h: 0,
        min: 0,
        hasTime: false
      };
    }

    // ISO datetime or YYYY-MM-DD HH:mm / with optional AM/PM
    var iso = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?/
    );
    if (iso) {
      var ih = Number(iso[4]);
      var im = Number(iso[5]);
      if (iso[7]) {
        ih = parseAmPmHour(ih, iso[7]);
        if (ih == null) return null;
      }
      if (iso[7]) {
        return {
          y: Number(iso[1]),
          m: Number(iso[2]),
          d: Number(iso[3]),
          h: ih,
          min: im,
          hasTime: true
        };
      }
      var dt = new Date(raw);
      if (!Number.isNaN(dt.getTime())) {
        return {
          y: dt.getFullYear(),
          m: dt.getMonth() + 1,
          d: dt.getDate(),
          h: dt.getHours(),
          min: dt.getMinutes(),
          hasTime: true
        };
      }
      return {
        y: Number(iso[1]),
        m: Number(iso[2]),
        d: Number(iso[3]),
        h: ih,
        min: im,
        hasTime: true
      };
    }

    var fallback = new Date(raw);
    if (Number.isNaN(fallback.getTime())) return null;
    return {
      y: fallback.getFullYear(),
      m: fallback.getMonth() + 1,
      d: fallback.getDate(),
      h: fallback.getHours(),
      min: fallback.getMinutes(),
      hasTime: raw.indexOf('T') !== -1 || raw.indexOf(' ') !== -1 || /:/.test(raw)
    };
  }

  function formatDate(value) {
    var p = parseDateParts(value);
    if (!p || p.timeOnly) return '';
    return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
  }

  /** Normalize any time-like value to HH:mm (24-hour). */
  function normalizeTime(value) {
    if (value == null || value === '') return '';
    var p = parseDateParts(value);
    if (!p) return '';
    var raw = String(value).trim();
    if (!p.hasTime && !p.timeOnly && !/T|\d{1,2}:\d{2}/.test(raw)) return '';
    return pad2(p.h) + ':' + pad2(p.min);
  }

  function formatTime(value) {
    return normalizeTime(value);
  }

  function formatDateTime(value) {
    var p = parseDateParts(value);
    if (!p || p.timeOnly) return '';
    var date = pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
    if (!p.hasTime) return date;
    return date + ' ' + pad2(p.h) + ':' + pad2(p.min);
  }

  function toISODate(value) {
    var p = parseDateParts(value);
    if (!p || p.timeOnly) return '';
    return p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
  }

  /** Storage form for datetime fields: YYYY-MM-DDTHH:mm */
  function toLocalDateTime(value) {
    var p = parseDateParts(value);
    if (!p || p.timeOnly) return '';
    var h = p.hasTime ? p.h : 0;
    var min = p.hasTime ? p.min : 0;
    return p.y + '-' + pad2(p.m) + '-' + pad2(p.d) + 'T' + pad2(h) + ':' + pad2(min);
  }

  function todayISO() {
    var now = new Date();
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  }

  function bindTimeInputs() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener(
      'blur',
      function (e) {
        var el = e.target;
        if (!el || !el.classList) return;
        if (el.classList.contains('app-time-input')) {
          var t = normalizeTime(el.value);
          if (t) el.value = t;
          return;
        }
        if (el.classList.contains('app-datetime-input')) {
          var dt = toLocalDateTime(el.value);
          if (dt) el.value = formatDateTime(dt);
        }
      },
      true
    );
  }

  global.AndecoDate = {
    formatDate: formatDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    normalizeTime: normalizeTime,
    toISODate: toISODate,
    toLocalDateTime: toLocalDateTime,
    todayISO: todayISO,
    parseDateParts: parseDateParts
  };

  // Convenience globals used across older modules
  global.formatAppDate = formatDate;
  global.formatAppTime = formatTime;
  global.formatAppDateTime = formatDateTime;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindTimeInputs);
    } else {
      bindTimeInputs();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
