/**
 * App-wide date/time display helpers.
 * Standard: dd/mm/yyyy and HH:mm (24-hour).
 * Storage / <input type="date"> values stay ISO YYYY-MM-DD.
 */
(function (global) {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
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

    // Already dd/mm/yyyy or dd/mm/yyyy HH:mm
    var dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/);
    if (dmy) {
      return {
        y: Number(dmy[3]),
        m: Number(dmy[2]),
        d: Number(dmy[1]),
        h: dmy[4] != null ? Number(dmy[4]) : 0,
        min: dmy[5] != null ? Number(dmy[5]) : 0,
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

    // ISO datetime or other parseable strings
    var iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (iso) {
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
        h: Number(iso[4]),
        min: Number(iso[5]),
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
      hasTime: raw.indexOf('T') !== -1 || raw.indexOf(' ') !== -1
    };
  }

  function formatDate(value) {
    var p = parseDateParts(value);
    if (!p) return '';
    return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
  }

  function formatTime(value) {
    if (value == null || value === '') return '';
    var raw = String(value).trim();
    // Already HH:mm or HH:mm:ss
    var hm = raw.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
    if (hm) return pad2(Number(hm[1])) + ':' + pad2(Number(hm[2]));

    var p = parseDateParts(value);
    if (!p) return '';
    if (!p.hasTime && !/T|\d{2}:\d{2}/.test(raw)) return '';
    return pad2(p.h) + ':' + pad2(p.min);
  }

  function formatDateTime(value) {
    var p = parseDateParts(value);
    if (!p) return '';
    var date = pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
    if (!p.hasTime) return date;
    return date + ' ' + pad2(p.h) + ':' + pad2(p.min);
  }

  function toISODate(value) {
    var p = parseDateParts(value);
    if (!p) return '';
    return p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
  }

  function todayISO() {
    var now = new Date();
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  }

  global.AndecoDate = {
    formatDate: formatDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    toISODate: toISODate,
    todayISO: todayISO,
    parseDateParts: parseDateParts
  };

  // Convenience globals used across older modules
  global.formatAppDate = formatDate;
  global.formatAppTime = formatTime;
  global.formatAppDateTime = formatDateTime;
})(typeof window !== 'undefined' ? window : globalThis);
