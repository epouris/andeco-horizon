/**
 * Andeco Learning Portal — modern learner/instructor experience,
 * visually independent from the CRM shell.
 */
(function () {
  'use strict';

  var view = 'home';
  var playerState = {
    enrollmentId: null,
    lessonId: null,
    mode: 'list' // list | player | exam
  };

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getSession() {
    try {
      var raw = localStorage.getItem('andeco_crm_session');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function getData() {
    if (window.LmsModule && typeof window.LmsModule.getData === 'function') {
      return window.LmsModule.getData();
    }
    try {
      var raw = localStorage.getItem('andeco_lms_data');
      return raw ? JSON.parse(raw) : { courses: [], enrollments: [], certificates: [], announcements: [], attempts: [], learnerProfiles: [], settings: {} };
    } catch (e) {
      return { courses: [], enrollments: [], certificates: [], announcements: [], attempts: [], learnerProfiles: [], settings: {} };
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem('andeco_lms_data', JSON.stringify(data));
    } catch (e) {}
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e2) {}
  }

  function currentUser() {
    var s = getSession();
    if (!s) return null;
    return {
      id: s.userId || s.username || 'unknown',
      name: s.displayName || s.username || 'Learner',
      username: s.username || '',
      isAdmin: s.isAdmin === true
    };
  }

  function getProfile(userId) {
    var data = getData();
    return (data.learnerProfiles || []).filter(function (p) { return p.userId === userId; })[0] || null;
  }

  function portalRole() {
    var u = currentUser();
    if (!u) return 'learner';
    if (u.isAdmin) return 'instructor';
    var profile = getProfile(u.id);
    if (profile && profile.role === 'instructor') return 'instructor';
    return 'learner';
  }

  function isInstructor() {
    return portalRole() === 'instructor';
  }

  function initials(name) {
    var parts = String(name || 'U').trim().split(/\s+/);
    return ((parts[0] || 'U').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }

  function myEnrollments() {
    var u = currentUser();
    if (!u) return [];
    return getData().enrollments.filter(function (e) { return e.userId === u.id; });
  }

  function findCourse(id) {
    return getData().courses.filter(function (c) { return c.id === id; })[0] || null;
  }

  function findEnrollment(id) {
    return getData().enrollments.filter(function (e) { return e.id === id; })[0] || null;
  }

  function badge(status) {
    var cls = 'lp-badge';
    if (status === 'completed' || status === 'passed' || status === 'published') cls += ' lp-badge-ok';
    else if (status === 'failed' || status === 'rejected') cls += ' lp-badge-warn';
    else if (status === 'in_progress' || status === 'enrolled') cls += ' lp-badge-accent';
    return '<span class="' + cls + '">' + escapeHtml(status || '—') + '</span>';
  }

  function ensureEnrollment(courseId) {
    var u = currentUser();
    if (!u) return null;
    var data = getData();
    var existing = data.enrollments.filter(function (e) { return e.courseId === courseId && e.userId === u.id; })[0];
    if (existing) return existing;
    var en = {
      id: 'enr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      courseId: courseId,
      userId: u.id,
      userName: u.name,
      source: 'self',
      status: 'enrolled',
      progressPercent: 0,
      completedLessonIds: [],
      startedAt: new Date().toISOString(),
      completedAt: '',
      score: null,
      passed: null
    };
    data.enrollments.push(en);
    saveData(data);
    return en;
  }

  function open() {
    var session = getSession();
    if (!session) return;
    document.body.classList.add('lms-portal-active');
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.add('hidden');
    });
    var screen = document.getElementById('lms-portal-screen');
    if (screen) {
      screen.classList.remove('hidden');
      // Rebuild shell each open so role/name stay correct after user switches.
      screen.removeAttribute('data-shell');
      screen.removeAttribute('data-bound');
    }
    try { sessionStorage.setItem('andeco_crm_route', 'lms-portal'); } catch (e) {}
    if (!isFileProtocol()) {
      try { window.location.hash = 'lms-portal'; } catch (e2) {}
    }
    view = 'home';
    playerState = { enrollmentId: null, lessonId: null, mode: 'list' };
    renderShell();
    render();
  }

  function isFileProtocol() {
    return typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
  }

  function closeToLogin() {
    document.body.classList.remove('lms-portal-active');
    try { localStorage.removeItem('andeco_crm_session'); } catch (e) {}
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.add('hidden');
    });
    var login = document.getElementById('login-screen');
    if (login) login.classList.remove('hidden');
    try { sessionStorage.setItem('andeco_crm_route', 'login'); } catch (e2) {}
    if (!isFileProtocol()) {
      try { window.location.hash = 'login'; } catch (e3) {}
    }
  }

  function canReturnToCrm() {
    var s = getSession();
    if (!s) return false;
    if (typeof window.isLmsOnlySession === 'function') return !window.isLmsOnlySession(s);
    if (s.isAdmin === true) return true;
    var mods = (s.allowedModules || []).filter(Boolean);
    return !(mods.length === 1 && mods[0] === 'lms');
  }

  function returnToCrm(pageId) {
    if (typeof window.returnToCrmFromLmsPortal === 'function') {
      window.returnToCrmFromLmsPortal(pageId || 'home');
      return;
    }
    // Fallback if app helper is unavailable
    document.body.classList.remove('lms-portal-active');
    var portal = document.getElementById('lms-portal-screen');
    if (portal) portal.classList.add('hidden');
    var app = document.getElementById('app-screen');
    if (app) app.classList.remove('hidden');
    try { sessionStorage.setItem('andeco_crm_route', pageId || 'home'); } catch (e) {}
    if (!isFileProtocol()) {
      try { window.location.hash = pageId || 'home'; } catch (e2) {}
    }
  }

  function renderShell() {
    var screen = document.getElementById('lms-portal-screen');
    if (!screen || screen.getAttribute('data-shell') === '1') {
      updateNavActive();
      return;
    }
    var u = currentUser();
    var role = portalRole();
    var settings = getData().settings || {};
    var crmBack = canReturnToCrm();
    screen.innerHTML =
      '<div class="lp-app">' +
        '<aside class="lp-nav">' +
          '<div class="lp-brand">' +
            '<p class="lp-brand-kicker">Andeco Learning</p>' +
            '<h1>' + escapeHtml(settings.companyLmsName || 'Learning Portal') + '</h1>' +
            '<span class="lp-role-pill">' + escapeHtml(role) + '</span>' +
          '</div>' +
          '<nav class="lp-nav-links" id="lp-nav-links"></nav>' +
          '<div class="lp-nav-footer">' +
            (crmBack
              ? '<button type="button" class="lp-btn lp-btn-secondary" id="lp-back-crm">← Back to CRM</button>' +
                '<button type="button" class="lp-btn lp-btn-ghost" id="lp-back-crm-lms">CRM Learning module</button>'
              : '') +
            '<button type="button" class="lp-btn lp-btn-ghost" id="lp-signout">Sign out</button>' +
          '</div>' +
        '</aside>' +
        '<div class="lp-main">' +
          '<header class="lp-top">' +
            '<div>' +
              '<h2 id="lp-page-title">Dashboard</h2>' +
              '<p id="lp-page-sub">Welcome back</p>' +
            '</div>' +
            '<div class="lp-top-actions">' +
              (crmBack ? '<button type="button" class="lp-btn lp-btn-secondary" id="lp-back-crm-top">← Back to CRM</button>' : '') +
              '<div class="lp-userchip">' +
                '<div><strong id="lp-user-name">' + escapeHtml(u ? u.name : 'User') + '</strong>' +
                '<span id="lp-user-role">' + escapeHtml(role === 'instructor' ? 'Instructor workspace' : 'Learner workspace') + '</span></div>' +
                '<div class="lp-avatar" aria-hidden="true">' + escapeHtml(initials(u ? u.name : 'U')) + '</div>' +
              '</div>' +
            '</div>' +
          '</header>' +
          '<div id="lms-portal-root"></div>' +
        '</div>' +
      '</div>';
    screen.setAttribute('data-shell', '1');
    bindShell();
    renderNav();
  }

  function renderNav() {
    var nav = document.getElementById('lp-nav-links');
    if (!nav) return;
    var links = isInstructor()
      ? [
          { id: 'home', label: 'Instructor home' },
          { id: 'courses', label: 'Courses' },
          { id: 'learners', label: 'Learners' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'reports', label: 'Reports' },
          { id: 'certificates', label: 'Certificates' }
        ]
      : [
          { id: 'home', label: 'My dashboard' },
          { id: 'courses', label: 'My courses' },
          { id: 'catalog', label: 'Browse training' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'certificates', label: 'Certificates' }
        ];
    nav.innerHTML = links.map(function (l) {
      return '<button type="button" class="lp-nav-link' + (view === l.id ? ' active' : '') +
        '" data-lp-view="' + l.id + '">' + escapeHtml(l.label) + '</button>';
    }).join('');
  }

  function updateNavActive() {
    document.querySelectorAll('#lp-nav-links .lp-nav-link').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lp-view') === view);
    });
  }

  function setTitle(title, sub) {
    var t = document.getElementById('lp-page-title');
    var s = document.getElementById('lp-page-sub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub || '';
  }

  function render() {
    renderShell();
    renderNav();
    var root = document.getElementById('lms-portal-root');
    if (!root) return;
    if (playerState.mode === 'player' || playerState.mode === 'exam') {
      setTitle(playerState.mode === 'exam' ? 'Assessment' : 'Learning', 'Focus mode');
      root.innerHTML = renderPlayerHtml();
      return;
    }
    if (view === 'home') {
      if (isInstructor()) renderInstructorHome(root);
      else renderLearnerHome(root);
    } else if (view === 'courses') {
      if (isInstructor()) renderInstructorCourses(root);
      else renderLearnerCourses(root);
    } else if (view === 'catalog') renderCatalog(root);
    else if (view === 'learners') renderInstructorLearners(root);
    else if (view === 'announcements') renderAnnouncements(root);
    else if (view === 'reports') renderReports(root);
    else if (view === 'certificates') renderCertificates(root);
    else renderLearnerHome(root);
  }

  function renderLearnerHome(root) {
    var data = getData();
    var u = currentUser();
    var mine = myEnrollments();
    var completed = mine.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
    var inProgress = mine.filter(function (e) { return e.status === 'in_progress' || e.status === 'enrolled'; }).length;
    var certs = (data.certificates || []).filter(function (c) { return u && c.userId === u.id; });
    var announcements = (data.announcements || []).filter(function (a) {
      return !a.audience || a.audience === 'all' || a.audience === 'employees';
    }).slice(0, 3);
    var continueItems = mine.filter(function (e) { return e.status !== 'completed'; }).slice(0, 4);

    setTitle('My dashboard', 'Pick up where you left off');
    root.innerHTML =
      '<section class="lp-hero">' +
        '<h3>Keep building your skills</h3>' +
        '<p>Your personal learning space for courses, inductions, procedures, and certificates.</p>' +
        '<div class="lp-hero-actions">' +
          '<button type="button" class="lp-btn lp-btn-primary" data-lp-view="courses">Continue learning</button>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-view="catalog">Browse training</button>' +
        '</div>' +
      '</section>' +
      '<div class="lp-metrics">' +
        metric(mine.length, 'Enrolled') +
        metric(inProgress, 'In progress') +
        metric(completed, 'Completed') +
        metric(certs.length, 'Certificates') +
      '</div>' +
      '<div class="lp-grid">' +
        '<div class="lp-card lp-span-8"><h3>Continue</h3>' + renderEnrollmentList(continueItems) + '</div>' +
        '<div class="lp-card lp-span-4"><h3>Announcements</h3>' + renderAnnounceList(announcements) + '</div>' +
      '</div>';
  }

  function renderInstructorHome(root) {
    var data = getData();
    var published = data.courses.filter(function (c) { return c.published; }).length;
    var completed = data.enrollments.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
    var active = data.enrollments.filter(function (e) { return e.status === 'in_progress' || e.status === 'enrolled'; }).length;
    var recent = data.enrollments.slice().reverse().slice(0, 6);

    setTitle('Instructor home', 'Guide learners and track outcomes');
    root.innerHTML =
      '<section class="lp-hero">' +
        '<h3>Teach with clarity</h3>' +
        '<p>Monitor progress, communicate updates, and keep your training library moving.</p>' +
        '<div class="lp-hero-actions">' +
          '<button type="button" class="lp-btn lp-btn-primary" data-lp-view="courses">Review courses</button>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-view="reports">Open reports</button>' +
        '</div>' +
      '</section>' +
      '<div class="lp-metrics">' +
        metric(published, 'Published courses') +
        metric(data.enrollments.length, 'Enrollments') +
        metric(active, 'Active learners') +
        metric(completed, 'Completions') +
      '</div>' +
      '<div class="lp-grid">' +
        '<div class="lp-card lp-span-8"><h3>Recent learner activity</h3>' + renderEnrollmentTable(recent, true) + '</div>' +
        '<div class="lp-card lp-span-4"><h3>Pinned notes</h3>' +
          renderAnnounceList((data.announcements || []).filter(function (a) { return a.pinned; }).slice(0, 4)) +
        '</div>' +
      '</div>';
  }

  function metric(value, label) {
    return '<div class="lp-metric"><strong>' + escapeHtml(String(value)) + '</strong><span>' + escapeHtml(label) + '</span></div>';
  }

  function renderEnrollmentList(items) {
    if (!items.length) return '<p class="lp-empty">No active courses yet. Browse training to get started.</p>';
    var data = getData();
    return '<div class="lp-list">' + items.map(function (en) {
      var course = data.courses.filter(function (c) { return c.id === en.courseId; })[0];
      return '<div class="lp-item">' +
        '<div style="flex:1"><h4>' + escapeHtml(course ? course.title : 'Training') + '</h4>' +
        '<p>' + badge(en.status) + ' · ' + escapeHtml(String(en.progressPercent || 0)) + '% complete</p>' +
        '<div class="lp-progress"><span style="width:' + (en.progressPercent || 0) + '%"></span></div></div>' +
        '<button type="button" class="lp-btn lp-btn-primary" data-lp-open-enroll="' + escapeHtml(en.id) + '">Open</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderEnrollmentTable(items, showLearner) {
    if (!items.length) return '<p class="lp-empty">No activity yet.</p>';
    var data = getData();
    return '<div style="overflow:auto"><table class="lp-table"><thead><tr>' +
      (showLearner ? '<th>Learner</th>' : '') +
      '<th>Course</th><th>Progress</th><th>Status</th><th>Score</th></tr></thead><tbody>' +
      items.map(function (en) {
        var course = data.courses.filter(function (c) { return c.id === en.courseId; })[0];
        return '<tr>' +
          (showLearner ? '<td>' + escapeHtml(en.userName) + '</td>' : '') +
          '<td>' + escapeHtml(course ? course.title : '—') + '</td>' +
          '<td>' + escapeHtml(String(en.progressPercent || 0)) + '%</td>' +
          '<td>' + badge(en.status) + '</td>' +
          '<td>' + (en.score != null ? escapeHtml(String(en.score)) + '%' : '—') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderAnnounceList(items) {
    if (!items.length) return '<p class="lp-empty">No announcements.</p>';
    return '<div class="lp-list">' + items.map(function (a) {
      return '<div class="lp-item"><div><h4>' + escapeHtml(a.title) + '</h4><p>' + escapeHtml(a.body) + '</p></div></div>';
    }).join('') + '</div>';
  }

  function renderLearnerCourses(root) {
    setTitle('My courses', 'Everything assigned to you');
    root.innerHTML = '<div class="lp-card lp-span-12">' + renderEnrollmentList(myEnrollments()) + '</div>';
  }

  function renderCatalog(root) {
    var data = getData();
    var courses = data.courses.filter(function (c) {
      return c.published && (c.audience === 'employee' || c.audience === 'all');
    });
    setTitle('Browse training', 'Enroll in available company courses');
    root.innerHTML = '<div class="lp-card"><div class="lp-list">' +
      (courses.length ? courses.map(function (c) {
        return '<div class="lp-item"><div><h4>' + escapeHtml(c.title) + '</h4>' +
          '<p>' + escapeHtml(c.category || 'General') + ' · ' + escapeHtml(c.type) +
          (c.description ? ' — ' + escapeHtml(c.description.slice(0, 100)) : '') + '</p></div>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-enroll="' + escapeHtml(c.id) + '">Start</button></div>';
      }).join('') : '<p class="lp-empty">No published employee courses yet.</p>') +
    '</div></div>';
  }

  function renderInstructorCourses(root) {
    var data = getData();
    setTitle('Courses', 'Library overview for instructors');
    root.innerHTML =
      '<div class="lp-card"><div style="overflow:auto"><table class="lp-table"><thead><tr>' +
        '<th>Title</th><th>Type</th><th>Audience</th><th>Lessons</th><th>Exam</th><th>Status</th><th>Enrolled</th>' +
      '</tr></thead><tbody>' +
      (data.courses.length ? data.courses.map(function (c) {
        var count = data.enrollments.filter(function (e) { return e.courseId === c.id; }).length;
        return '<tr><td><strong>' + escapeHtml(c.title) + '</strong></td>' +
          '<td>' + escapeHtml(c.type) + '</td><td>' + escapeHtml(c.audience) + '</td>' +
          '<td>' + (c.lessons || []).length + '</td>' +
          '<td>' + (c.exam && c.exam.enabled ? (c.exam.questions || []).length + ' Q' : '—') + '</td>' +
          '<td>' + badge(c.published ? 'published' : 'draft') + '</td>' +
          '<td>' + count + '</td></tr>';
      }).join('') : '<tr><td colspan="7">No courses yet. Ask an administrator to create training in the CRM LMS library.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="lp-empty" style="margin-top:0.8rem">Course authoring stays in the admin CRM Learning module. This portal is for teaching and learning.</p></div>';
  }

  function renderInstructorLearners(root) {
    var data = getData();
    setTitle('Learners', 'People and progress');
    root.innerHTML = '<div class="lp-card">' + renderEnrollmentTable(data.enrollments.slice().reverse(), true) + '</div>';
  }

  function renderAnnouncements(root) {
    var data = getData();
    var list = (data.announcements || []).slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    setTitle('Announcements', 'Stay aligned with your team');
    var form = isInstructor()
      ? '<div class="lp-card" style="margin-bottom:1rem"><h3>Post update</h3><form id="lp-announce-form" class="lp-form">' +
          '<label>Title<input name="title" required></label>' +
          '<label>Message<textarea name="body" rows="3" required></textarea></label>' +
          '<label>Audience<select name="audience"><option value="employees">Employees</option><option value="all">Everyone</option></select></label>' +
          '<label><input type="checkbox" name="pinned"> Pin to dashboards</label>' +
          '<div class="lp-form-actions"><button class="lp-btn lp-btn-primary" type="submit">Publish</button></div>' +
        '</form></div>'
      : '';
    root.innerHTML = form + '<div class="lp-card"><h3>Board</h3>' + renderAnnounceList(list) + '</div>';
  }

  function renderReports(root) {
    if (!isInstructor()) {
      view = 'home';
      render();
      return;
    }
    var data = getData();
    var completed = data.enrollments.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
    var failed = data.enrollments.filter(function (e) { return e.status === 'failed'; }).length;
    setTitle('Reports', 'Tracking and evaluation');
    root.innerHTML =
      '<div class="lp-metrics">' +
        metric(data.enrollments.length, 'Enrollments') +
        metric(completed, 'Completed') +
        metric(failed, 'Failed') +
        metric((data.attempts || []).length, 'Exam attempts') +
      '</div>' +
      '<div class="lp-card">' + renderEnrollmentTable(data.enrollments.slice().reverse().slice(0, 30), true) + '</div>';
  }

  function renderCertificates(root) {
    var data = getData();
    var u = currentUser();
    var certs = isInstructor()
      ? (data.certificates || [])
      : (data.certificates || []).filter(function (c) { return u && c.userId === u.id; });
    setTitle('Certificates', 'Recognise completed learning');
    root.innerHTML = '<div class="lp-card"><div class="lp-list">' +
      (certs.length ? certs.slice().reverse().map(function (c) {
        return '<div class="lp-item"><div><h4>' + escapeHtml(c.courseTitle) + '</h4>' +
          '<p>' + escapeHtml(c.userName) + ' · ' + escapeHtml((c.issuedAt || '').slice(0, 10)) +
          ' · ' + escapeHtml(c.certificateNo) + '</p></div>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-cert="' + escapeHtml(c.id) + '">Open</button></div>';
      }).join('') : '<p class="lp-empty">No certificates yet.</p>') +
    '</div></div>';
  }

  function formatContent(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
  }

  function mediaHtml(lesson) {
    var type = lesson.contentType || 'text';
    var url = lesson.mediaUrl || '';
    if (!url || type === 'text') return '';
    if (type === 'video') {
      var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);
      var vim = url.match(/vimeo\.com\/(\d+)/);
      if (yt) return '<div class="lp-media"><iframe src="https://www.youtube.com/embed/' + escapeHtml(yt[1]) + '" allowfullscreen loading="lazy"></iframe></div>';
      if (vim) return '<div class="lp-media"><iframe src="https://player.vimeo.com/video/' + escapeHtml(vim[1]) + '" allowfullscreen loading="lazy"></iframe></div>';
      return '<div class="lp-media"><video controls src="' + escapeHtml(url) + '"></video></div>';
    }
    return '<p><a class="lp-btn lp-btn-secondary" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' +
      (type === 'document' ? 'Open document' : 'Open resource') + '</a></p>';
  }

  function renderPlayerHtml() {
    var en = findEnrollment(playerState.enrollmentId);
    var course = en ? findCourse(en.courseId) : null;
    if (!en || !course) {
      playerState.mode = 'list';
      return '<div class="lp-card"><p class="lp-empty">Course unavailable.</p><button class="lp-btn lp-btn-secondary" data-lp-view="courses">Back</button></div>';
    }
    if (playerState.mode === 'exam') return renderExamHtml(course, en);

    var lesson = course.lessons.filter(function (l) { return l.id === playerState.lessonId; })[0] || course.lessons[0];
    var completed = en.completedLessonIds || [];
    return '<button type="button" class="lp-btn lp-btn-ghost" data-lp-exit-player style="margin-bottom:0.8rem">← Back to courses</button>' +
      '<div class="lp-player">' +
        '<aside class="lp-player-nav"><h4>Contents</h4><ol>' +
          course.lessons.map(function (l) {
            var done = completed.indexOf(l.id) !== -1;
            return '<li><button type="button" class="lp-lesson-link' + (lesson && lesson.id === l.id ? ' active' : '') +
              '" data-lp-lesson="' + escapeHtml(l.id) + '">' + (done ? '✓ ' : '') + escapeHtml(l.title) + '</button></li>';
          }).join('') +
        '</ol>' +
        (course.exam && course.exam.enabled ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-start-exam style="width:100%;margin-top:1rem">Take exam</button>' : '') +
        '</aside>' +
        '<section class="lp-player-content">' +
          (lesson ? '<h3>' + escapeHtml(lesson.title) + '</h3>' + mediaHtml(lesson) +
            '<div class="lp-lesson-body">' + formatContent(lesson.content) + '</div>' +
            '<button type="button" class="lp-btn lp-btn-primary" data-lp-complete-lesson="' + escapeHtml(lesson.id) + '">Mark complete &amp; continue</button>'
            : '<p class="lp-empty">No lessons in this course.</p>') +
        '</section>' +
      '</div>';
  }

  function renderExamHtml(course, enrollment) {
    var questions = ((course.exam && course.exam.questions) || []).slice();
    return '<button type="button" class="lp-btn lp-btn-ghost" data-lp-back-player style="margin-bottom:0.8rem">← Back to lessons</button>' +
      '<div class="lp-card"><h3>Exam: ' + escapeHtml(course.title) + '</h3>' +
      '<p class="lp-empty">Pass score: ' + escapeHtml(String((course.exam && course.exam.passScore) || 70)) + '%</p>' +
      '<form id="lp-exam-form">' +
        questions.map(function (q, qi) {
          return '<div class="lp-exam-q"><p><strong>Q' + (qi + 1) + '.</strong> ' + escapeHtml(q.prompt) + '</p>' +
            (q.options || []).map(function (o) {
              var type = q.type === 'multi' ? 'checkbox' : 'radio';
              return '<label class="lp-option"><input type="' + type + '" name="q_' + escapeHtml(q.id) +
                '" value="' + escapeHtml(o.id) + '"> <span>' + escapeHtml(o.text) + '</span></label>';
            }).join('') +
          '</div>';
        }).join('') +
        '<div class="lp-form-actions"><button class="lp-btn lp-btn-primary" type="submit">Submit exam</button></div>' +
      '</form></div>';
  }

  function scoreAttempt(course, answers) {
    var questions = (course.exam && course.exam.questions) || [];
    var earned = 0;
    var max = 0;
    questions.forEach(function (q) {
      max += Number(q.points) || 1;
      var selected = Array.isArray(answers[q.id]) ? answers[q.id].slice().sort() : [];
      var correct = (q.correctOptionIds || []).slice().sort();
      if (selected.length === correct.length && selected.every(function (v, i) { return v === correct[i]; })) {
        earned += Number(q.points) || 1;
      }
    });
    var percent = max ? Math.round((earned / max) * 100) : 0;
    var passScore = (course.exam && course.exam.passScore) || course.passScore || 70;
    return { percent: percent, passed: percent >= passScore, passScore: passScore };
  }

  function maybeIssueCertificate(data, enrollment, course) {
    if (!data.settings || data.settings.autoIssueCertificates === false) return;
    var exists = (data.certificates || []).some(function (c) {
      return c.enrollmentId === enrollment.id || (c.userId === enrollment.userId && c.courseId === course.id);
    });
    if (exists) return;
    data.certificates = data.certificates || [];
    data.certificates.push({
      id: 'cert' + Date.now().toString(36),
      userId: enrollment.userId,
      userName: enrollment.userName,
      courseId: course.id,
      courseTitle: course.title,
      enrollmentId: enrollment.id,
      issuedAt: new Date().toISOString(),
      certificateNo: 'AND-' + String(Date.now()).slice(-8),
      score: enrollment.score != null ? enrollment.score : null
    });
  }

  function bindShell() {
    var screen = document.getElementById('lms-portal-screen');
    if (!screen || screen.getAttribute('data-bound') === '1') return;
    screen.setAttribute('data-bound', '1');
    screen.addEventListener('click', onClick);
    screen.addEventListener('submit', onSubmit);
    var signout = document.getElementById('lp-signout');
    if (signout) {
      signout.addEventListener('click', function () {
        var ds = window.AccountingData;
        var p = (ds && typeof ds.signOutFromSupabase === 'function') ? ds.signOutFromSupabase() : Promise.resolve();
        p.finally(closeToLogin);
      });
    }
    function bindCrmBack(id, pageId) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', function () {
        returnToCrm(pageId);
      });
    }
    bindCrmBack('lp-back-crm', 'home');
    bindCrmBack('lp-back-crm-top', 'home');
    bindCrmBack('lp-back-crm-lms', 'lms');
  }

  function onClick(e) {
    var t = e.target.closest('[data-lp-view],[data-lp-open-enroll],[data-lp-enroll],[data-lp-lesson],[data-lp-complete-lesson],[data-lp-start-exam],[data-lp-exit-player],[data-lp-back-player],[data-lp-cert]');
    if (!t) return;
    if (t.hasAttribute('data-lp-view')) {
      view = t.getAttribute('data-lp-view');
      playerState.mode = 'list';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-open-enroll')) {
      playerState.enrollmentId = t.getAttribute('data-lp-open-enroll');
      playerState.lessonId = null;
      playerState.mode = 'player';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-enroll')) {
      var en = ensureEnrollment(t.getAttribute('data-lp-enroll'));
      if (en) {
        playerState.enrollmentId = en.id;
        playerState.lessonId = null;
        playerState.mode = 'player';
        render();
      }
      return;
    }
    if (t.hasAttribute('data-lp-lesson')) {
      playerState.lessonId = t.getAttribute('data-lp-lesson');
      render();
      return;
    }
    if (t.hasAttribute('data-lp-complete-lesson')) {
      completeLesson(t.getAttribute('data-lp-complete-lesson'));
      return;
    }
    if (t.hasAttribute('data-lp-start-exam')) {
      playerState.mode = 'exam';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-exit-player')) {
      playerState.mode = 'list';
      view = 'courses';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-back-player')) {
      playerState.mode = 'player';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-cert')) {
      if (window.LmsModule && typeof window.LmsModule.getData === 'function') {
        // Reuse print helper if available via temporary DOM hook
        var certId = t.getAttribute('data-lp-cert');
        var data = getData();
        var cert = (data.certificates || []).filter(function (c) { return c.id === certId; })[0];
        if (!cert) return;
        var s = data.settings || {};
        var w = window.open('', '_blank');
        if (!w) {
          alert('Certificate: ' + cert.courseTitle + ' / ' + cert.certificateNo);
          return;
        }
        w.document.write('<html><head><title>Certificate</title><style>body{font-family:Georgia,serif;padding:40px;text-align:center}h1{margin-top:24px}</style></head><body>' +
          '<p>' + escapeHtml(s.companyLmsName || 'Andeco Learning') + '</p>' +
          '<h1>' + escapeHtml(s.certificateTitle || 'Certificate of Completion') + '</h1>' +
          '<p>This certifies that</p><h2>' + escapeHtml(cert.userName) + '</h2>' +
          '<p>has successfully completed</p><h3>' + escapeHtml(cert.courseTitle) + '</h3>' +
          '<p>' + escapeHtml(cert.certificateNo) + ' · ' + escapeHtml((cert.issuedAt || '').slice(0, 10)) + '</p>' +
          '<p>' + escapeHtml(s.certificateSigner || 'Training Manager') + '</p>' +
          '</body></html>');
        w.document.close();
        w.focus();
        w.print();
      }
    }
  }

  function completeLesson(lessonId) {
    var data = getData();
    var en = data.enrollments.filter(function (e) { return e.id === playerState.enrollmentId; })[0];
    var course = en ? data.courses.filter(function (c) { return c.id === en.courseId; })[0] : null;
    if (!en || !course) return;
    var done = (en.completedLessonIds || []).slice();
    if (done.indexOf(lessonId) === -1) done.push(lessonId);
    en.completedLessonIds = done;
    var total = (course.lessons || []).length;
    en.progressPercent = total ? Math.round((done.length / total) * 100) : en.progressPercent;
    if (en.status === 'enrolled') en.status = 'in_progress';
    if (total && done.length >= total && !(course.exam && course.exam.enabled)) {
      en.status = 'completed';
      en.progressPercent = 100;
      en.completedAt = new Date().toISOString();
      en.passed = true;
      maybeIssueCertificate(data, en, course);
    }
    saveData(data);
    var idx = course.lessons.findIndex(function (l) { return l.id === lessonId; });
    if (idx >= 0 && idx < course.lessons.length - 1) playerState.lessonId = course.lessons[idx + 1].id;
    render();
  }

  function onSubmit(e) {
    if (e.target && e.target.id === 'lp-announce-form') {
      e.preventDefault();
      if (!isInstructor()) return;
      var fd = new FormData(e.target);
      var data = getData();
      var u = currentUser();
      data.announcements = data.announcements || [];
      data.announcements.push({
        id: 'ann' + Date.now().toString(36),
        title: String(fd.get('title') || '').trim(),
        body: String(fd.get('body') || '').trim(),
        audience: String(fd.get('audience') || 'employees'),
        pinned: !!e.target.querySelector('[name="pinned"]').checked,
        createdAt: new Date().toISOString(),
        createdBy: u ? u.name : 'Instructor'
      });
      saveData(data);
      render();
      return;
    }
    if (e.target && e.target.id === 'lp-exam-form') {
      e.preventDefault();
      var en = findEnrollment(playerState.enrollmentId);
      var course = en ? findCourse(en.courseId) : null;
      if (!course) return;
      var answers = {};
      (course.exam.questions || []).forEach(function (q) {
        var nodes = e.target.querySelectorAll('[name="q_' + q.id + '"]:checked');
        answers[q.id] = Array.prototype.map.call(nodes, function (n) { return n.value; });
      });
      var result = scoreAttempt(course, answers);
      var data = getData();
      data.attempts = data.attempts || [];
      data.attempts.push({
        id: 'att' + Date.now().toString(36),
        enrollmentId: en.id,
        courseId: course.id,
        userId: en.userId,
        answers: answers,
        score: result.percent,
        passed: result.passed,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      });
      var target = data.enrollments.filter(function (x) { return x.id === en.id; })[0];
      if (target) {
        target.score = result.percent;
        target.passed = result.passed;
        target.status = result.passed ? 'completed' : 'failed';
        target.progressPercent = 100;
        target.completedAt = new Date().toISOString();
        if (result.passed) maybeIssueCertificate(data, target, course);
      }
      saveData(data);
      alert(result.passed
        ? ('Passed with ' + result.percent + '%')
        : ('Score ' + result.percent + '%. Required ' + result.passScore + '%.'));
      playerState.mode = 'list';
      view = 'courses';
      render();
    }
  }

  function init() {
    // shell binds on open
  }

  window.LmsPortal = {
    open: open,
    render: render,
    closeToLogin: closeToLogin,
    returnToCrm: returnToCrm,
    canReturnToCrm: canReturnToCrm,
    portalRole: portalRole,
    isOpen: function () {
      var el = document.getElementById('lms-portal-screen');
      return !!(el && !el.classList.contains('hidden'));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
