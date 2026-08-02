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
    mode: 'list', // list | course | exam
    panel: 'overview' // overview | lesson | discussion | exam
  };
  var discussionState = {
    tab: 'course', // course | private
    courseId: null,
    threadId: null,
    composingPrivate: false
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
      return raw ? JSON.parse(raw) : {
        courses: [], enrollments: [], certificates: [], announcements: [],
        attempts: [], learnerProfiles: [], discussions: [], settings: {}
      };
    } catch (e) {
      return {
        courses: [], enrollments: [], certificates: [], announcements: [],
        attempts: [], learnerProfiles: [], discussions: [], settings: {}
      };
    }
  }

  function saveData(data) {
    var payload = data;
    if (window.LmsModule && typeof window.LmsModule.normalizeData === 'function') {
      payload = window.LmsModule.normalizeData(data);
    }
    if (window.LmsModule && typeof window.LmsModule.saveData === 'function') {
      window.LmsModule.saveData(payload);
      return;
    }
    try {
      localStorage.setItem('andeco_lms_data', JSON.stringify(payload));
    } catch (e) {}
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e2) {}
  }

  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function formatWhen(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0, 16);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return String(iso).slice(0, 16);
    }
  }

  function discussions() {
    return getData().discussions || [];
  }

  function accessibleCoursesForDiscussion() {
    var data = getData();
    if (isInstructor()) {
      return data.courses.filter(function (c) { return c.published !== false; });
    }
    var mine = myEnrollments().map(function (e) { return e.courseId; });
    return data.courses.filter(function (c) {
      return c.published !== false && mine.indexOf(c.id) !== -1;
    });
  }

  function getCourseDiscussion(courseId) {
    return discussions().filter(function (d) {
      return d.kind === 'course' && d.courseId === courseId;
    })[0] || null;
  }

  function ensureCourseDiscussion(courseId) {
    var existing = getCourseDiscussion(courseId);
    if (existing) return existing;
    var data = getData();
    data.discussions = data.discussions || [];
    // Re-check on the mutable payload in case of races between reads.
    existing = data.discussions.filter(function (d) {
      return d.kind === 'course' && d.courseId === courseId;
    })[0];
    if (existing) return existing;
    var course = data.courses.filter(function (c) { return c.id === courseId; })[0];
    var u = currentUser();
    var thread = {
      id: newId('dsc'),
      kind: 'course',
      courseId: courseId,
      learnerId: '',
      learnerName: '',
      title: course ? (course.title + ' — general discussion') : 'Course discussion',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: u ? u.id : '',
      createdByName: u ? u.name : 'System',
      messages: []
    };
    data.discussions.push(thread);
    saveData(data);
    return getCourseDiscussion(courseId) || thread;
  }

  function visiblePrivateThreads() {
    var u = currentUser();
    if (!u) return [];
    var list = discussions().filter(function (d) { return d.kind === 'private'; });
    if (isInstructor()) return list.slice().sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return list.filter(function (d) { return d.learnerId === u.id; }).sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function findDiscussion(id) {
    return discussions().filter(function (d) { return d.id === id; })[0] || null;
  }

  function canAccessDiscussion(thread) {
    var u = currentUser();
    if (!u || !thread) return false;
    if (isInstructor()) return true;
    if (thread.kind === 'private') return thread.learnerId === u.id;
    return myEnrollments().some(function (e) { return e.courseId === thread.courseId; });
  }

  function postDiscussionMessage(threadId, body) {
    var u = currentUser();
    var text = String(body || '').trim();
    if (!u || !text) return false;
    var data = getData();
    var thread = (data.discussions || []).filter(function (d) { return d.id === threadId; })[0];
    if (!thread || !canAccessDiscussion(thread)) return false;
    thread.messages = thread.messages || [];
    thread.messages.push({
      id: newId('msg'),
      authorId: u.id,
      authorName: u.name,
      authorRole: isInstructor() ? 'instructor' : 'learner',
      body: text,
      createdAt: new Date().toISOString()
    });
    thread.updatedAt = new Date().toISOString();
    saveData(data);
    return true;
  }

  function createPrivateDiscussion(opts) {
    var u = currentUser();
    if (!u) return null;
    var title = String(opts.title || '').trim();
    var body = String(opts.body || '').trim();
    if (!title || !body) return null;
    var learnerId = opts.learnerId || u.id;
    var learnerName = opts.learnerName || u.name;
    if (isInstructor() && opts.learnerId) {
      learnerId = opts.learnerId;
      learnerName = opts.learnerName || learnerId;
    } else if (!isInstructor()) {
      learnerId = u.id;
      learnerName = u.name;
    }
    var data = getData();
    data.discussions = data.discussions || [];
    var thread = {
      id: newId('dsc'),
      kind: 'private',
      courseId: opts.courseId || '',
      learnerId: learnerId,
      learnerName: learnerName,
      title: title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: u.id,
      createdByName: u.name,
      messages: [{
        id: newId('msg'),
        authorId: u.id,
        authorName: u.name,
        authorRole: isInstructor() ? 'instructor' : 'learner',
        body: body,
        createdAt: new Date().toISOString()
      }]
    };
    data.discussions.push(thread);
    saveData(data);
    return thread;
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

  function courseDuration(course) {
    var mins = Number(course && course.durationMinutes) || 0;
    if (!mins && course && Array.isArray(course.lessons)) {
      mins = course.lessons.reduce(function (sum, lesson) {
        return sum + (Number(lesson && lesson.durationMinutes) || 0);
      }, 0);
    }
    if (!mins) return 'Self-paced';
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m ? (h + 'h ' + m + 'm') : (h + 'h');
  }

  function courseCoverHtml(course) {
    var title = escapeHtml((course && course.title) || 'Course');
    if (course && course.coverImage) {
      return '<div class="lp-course-cover"><img src="' + escapeHtml(course.coverImage) + '" alt="' + title + '" loading="lazy"></div>';
    }
    var letter = escapeHtml(String((course && course.title) || 'C').charAt(0).toUpperCase());
    return '<div class="lp-course-cover lp-course-cover--placeholder" aria-hidden="true"><span>' + letter + '</span></div>';
  }

  function courseCardHtml(course, opts) {
    opts = opts || {};
    var progress = opts.progress;
    var pct = progress != null ? Math.round(Number(progress.progressPercent != null ? progress.progressPercent : progress.percent) || 0) : null;
    var cta = opts.cta || (progress ? 'Open' : 'Start');
    var actionAttr = opts.enrollId
      ? (' data-lp-open-enroll="' + escapeHtml(opts.enrollId) + '"')
      : (' data-lp-enroll="' + escapeHtml(course.id) + '"');
    var foot = pct != null
      ? ('<div class="lp-course-card__progress"><div class="lp-progress"><span style="width:' + pct + '%"></span></div><span>' + pct + '%</span></div>')
      : '';
    return '<article class="lp-course-card"' + actionAttr + ' role="button" tabindex="0">' +
      courseCoverHtml(course) +
      '<div class="lp-course-card__body">' +
        '<h3>' + escapeHtml(course.title || 'Untitled') + '</h3>' +
        '<div class="lp-course-card__meta">' +
          '<span>' + escapeHtml(course.category || 'General') + '</span>' +
          '<span>' + escapeHtml(courseDuration(course)) + '</span>' +
        '</div>' +
        foot +
        '<div class="lp-course-card__cta">' + escapeHtml(cta) + '</div>' +
      '</div>' +
    '</article>';
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
    playerState = { enrollmentId: null, lessonId: null, mode: 'list', panel: 'overview' };
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
          { id: 'discussions', label: 'Discussions' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'reports', label: 'Reports' },
          { id: 'certificates', label: 'Certificates' }
        ]
      : [
          { id: 'home', label: 'My dashboard' },
          { id: 'courses', label: 'My courses' },
          { id: 'catalog', label: 'Browse training' },
          { id: 'discussions', label: 'Discussions' },
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

  function greetingPrefix() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function displayName() {
    var u = currentUser();
    return (u && u.name) ? u.name : 'there';
  }

  function greetingHtml(supporting) {
    return '<div class="lp-greeting">' +
      '<p class="lp-greeting-hello">' + escapeHtml(greetingPrefix()) + ', <strong>' + escapeHtml(displayName()) + '</strong></p>' +
      (supporting ? '<p class="lp-greeting-sub">' + escapeHtml(supporting) + '</p>' : '') +
    '</div>';
  }

  function render() {
    renderShell();
    renderNav();
    var root = document.getElementById('lms-portal-root');
    if (!root) return;
    if (playerState.mode === 'course' || playerState.mode === 'player' || playerState.mode === 'exam') {
      var enTitle = findEnrollment(playerState.enrollmentId);
      var courseTitle = enTitle ? findCourse(enTitle.courseId) : null;
      setTitle(courseTitle ? courseTitle.title : 'Course', playerState.panel === 'exam' ? 'Assessment' : 'Course workspace');
      root.innerHTML = renderCoursePage();
      return;
    }
    if (view === 'home') {
      if (isInstructor()) renderInstructorHome(root);
      else renderLearnerHome(root);
    } else if (view === 'courses') {
      if (isInstructor()) renderInstructorCourses(root);
      else renderLearnerCourses(root);
    } else if (view === 'catalog') renderCatalog(root);
    else if (view === 'discussions') renderDiscussions(root);
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

    setTitle('My dashboard', greetingPrefix() + ', ' + displayName());
    root.innerHTML =
      greetingHtml('Welcome to Andeco Learning. Pick up where you left off.') +
      '<section class="lp-hero">' +
        '<h3>Keep building your skills</h3>' +
        '<p>Your personal learning space for courses, inductions, procedures, and certificates.</p>' +
        '<div class="lp-hero-actions">' +
          '<button type="button" class="lp-btn lp-btn-primary" data-lp-view="courses">Continue learning</button>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-view="discussions">Open discussions</button>' +
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

    setTitle('Instructor home', greetingPrefix() + ', ' + displayName());
    root.innerHTML =
      greetingHtml('Welcome to Andeco Learning. Guide learners and track outcomes.') +
      '<section class="lp-hero">' +
        '<h3>Teach with clarity</h3>' +
        '<p>Monitor progress, communicate updates, and keep your training library moving.</p>' +
        '<div class="lp-hero-actions">' +
          '<button type="button" class="lp-btn lp-btn-primary" data-lp-view="courses">Review courses</button>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-view="discussions">Discussions</button>' +
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
    var mine = myEnrollments();
    var data = getData();
    setTitle('My courses', 'Everything assigned to you');
    root.innerHTML = mine.length
      ? ('<div class="lp-course-grid">' + mine.map(function (en) {
          var course = data.courses.filter(function (c) { return c.id === en.courseId; })[0];
          if (!course) return '';
          return courseCardHtml(course, {
            progress: en,
            enrollId: en.id,
            cta: (en.status === 'completed' || en.passed === true) ? 'Review' : 'Continue'
          });
        }).filter(Boolean).join('') + '</div>')
      : '<div class="lp-card"><p class="lp-empty">You are not enrolled in any courses yet. Browse training to get started.</p></div>';
  }

  function renderCatalog(root) {
    var data = getData();
    var mine = myEnrollments();
    var courses = data.courses.filter(function (c) {
      return c.published && (c.audience === 'employee' || c.audience === 'all');
    });
    setTitle('Browse training', 'Enroll in available company courses');
    root.innerHTML = courses.length
      ? ('<div class="lp-course-grid">' + courses.map(function (c) {
          var enrolled = mine.filter(function (e) { return e.courseId === c.id; })[0];
          if (enrolled) {
            return courseCardHtml(c, {
              progress: enrolled,
              enrollId: enrolled.id,
              cta: 'Continue'
            });
          }
          return courseCardHtml(c, { cta: 'Start' });
        }).join('') + '</div>')
      : '<div class="lp-card"><p class="lp-empty">No published employee courses yet.</p></div>';
  }

  function renderInstructorCourses(root) {
    var data = getData();
    setTitle('Courses', 'Library overview for instructors');
    root.innerHTML =
      '<div class="lp-card"><div style="overflow:auto"><table class="lp-table"><thead><tr>' +
        '<th>Title</th><th>Type</th><th>Audience</th><th>Lessons</th><th>Exam</th><th>Status</th><th>Enrolled</th><th></th>' +
      '</tr></thead><tbody>' +
      (data.courses.length ? data.courses.map(function (c) {
        var count = data.enrollments.filter(function (e) { return e.courseId === c.id; }).length;
        return '<tr><td><strong>' + escapeHtml(c.title) + '</strong></td>' +
          '<td>' + escapeHtml(c.type) + '</td><td>' + escapeHtml(c.audience) + '</td>' +
          '<td>' + (c.lessons || []).length + '</td>' +
          '<td>' + (c.exam && c.exam.enabled ? (c.exam.questions || []).length + ' Q' : '—') + '</td>' +
          '<td>' + badge(c.published ? 'published' : 'draft') + '</td>' +
          '<td>' + count + '</td>' +
          '<td><button type="button" class="lp-btn lp-btn-secondary" data-lp-enroll="' + escapeHtml(c.id) + '">Open</button></td></tr>';
      }).join('') : '<tr><td colspan="8">No courses yet. Ask an administrator to create training in the CRM LMS library.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="lp-empty" style="margin-top:0.8rem">Course authoring stays in the admin CRM Learning module. Open a course page to review content, progress context, and discussion.</p></div>';
  }

  function renderInstructorLearners(root) {
    var data = getData();
    setTitle('Learners', 'People and progress');
    root.innerHTML = '<div class="lp-card">' + renderEnrollmentTable(data.enrollments.slice().reverse(), true) + '</div>';
  }

  function renderDiscussionMessages(thread) {
    var messages = (thread && thread.messages) || [];
    if (!messages.length) {
      return '<p class="lp-empty">No messages yet. Start the conversation below.</p>';
    }
    var u = currentUser();
    return '<div class="lp-discussion-messages">' + messages.map(function (m) {
      var mine = u && m.authorId === u.id;
      return '<article class="lp-discussion-msg' + (mine ? ' is-mine' : '') + '">' +
        '<header>' +
          '<strong>' + escapeHtml(m.authorName || 'User') + '</strong>' +
          '<span class="lp-badge' + (m.authorRole === 'instructor' ? ' lp-badge-accent' : '') + '">' +
            escapeHtml(m.authorRole === 'instructor' ? 'Tutor' : 'Learner') +
          '</span>' +
          '<time>' + escapeHtml(formatWhen(m.createdAt)) + '</time>' +
        '</header>' +
        '<p>' + escapeHtml(m.body) + '</p>' +
      '</article>';
    }).join('') + '</div>';
  }

  function renderMessageComposer(threadId) {
    return '<form id="lp-discussion-reply" class="lp-discussion-composer" data-thread-id="' + escapeHtml(threadId) + '">' +
      '<label>Write a message<textarea name="body" rows="3" required placeholder="Share an update or ask a question…"></textarea></label>' +
      '<div class="lp-form-actions"><button type="submit" class="lp-btn lp-btn-primary">Post message</button></div>' +
    '</form>';
  }

  function renderPrivateComposeForm() {
    var courses = accessibleCoursesForDiscussion();
    var learners = [];
    if (isInstructor()) {
      var seen = {};
      getData().enrollments.forEach(function (e) {
        if (!e.userId || seen[e.userId]) return;
        seen[e.userId] = true;
        learners.push({ id: e.userId, name: e.userName || e.userId });
      });
      learners.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    }
    return '<div class="lp-card">' +
      '<h3>New private discussion</h3>' +
      '<form id="lp-private-new" class="lp-form">' +
        (isInstructor()
          ? '<label>Learner<select name="learnerId" required>' +
              '<option value="">Select learner…</option>' +
              learners.map(function (l) {
                return '<option value="' + escapeHtml(l.id) + '">' + escapeHtml(l.name) + '</option>';
              }).join('') +
            '</select></label>'
          : '') +
        '<label>Subject<input name="title" required maxlength="120" placeholder="What do you need help with?"></label>' +
        '<label>Related course (optional)<select name="courseId">' +
          '<option value="">None</option>' +
          courses.map(function (c) {
            return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.title) + '</option>';
          }).join('') +
        '</select></label>' +
        '<label>Message<textarea name="body" rows="4" required placeholder="Write your message to the tutors…"></textarea></label>' +
        '<div class="lp-form-actions">' +
          '<button type="submit" class="lp-btn lp-btn-primary">Start discussion</button>' +
          '<button type="button" class="lp-btn lp-btn-ghost" data-lp-discuss-cancel-private>Cancel</button>' +
        '</div>' +
      '</form></div>';
  }

  function renderDiscussions(root) {
    var tab = discussionState.tab === 'private' ? 'private' : 'course';
    setTitle('Discussions', tab === 'private'
      ? (isInstructor() ? 'Private learner conversations' : 'Private chats with tutors')
      : 'General discussion for each course');

    var tabs =
      '<div class="lp-discuss-tabs" role="tablist">' +
        '<button type="button" class="lp-discuss-tab' + (tab === 'course' ? ' active' : '') + '" data-lp-discuss-tab="course">Course discussions</button>' +
        '<button type="button" class="lp-discuss-tab' + (tab === 'private' ? ' active' : '') + '" data-lp-discuss-tab="private">' +
          (isInstructor() ? 'Private with learners' : 'Private with tutors') +
        '</button>' +
      '</div>';

    if (tab === 'private' && discussionState.composingPrivate) {
      root.innerHTML = tabs + renderPrivateComposeForm();
      return;
    }

    if (tab === 'course') {
      var courses = accessibleCoursesForDiscussion();
      if (!discussionState.courseId && courses[0]) discussionState.courseId = courses[0].id;
      if (discussionState.courseId && !courses.some(function (c) { return c.id === discussionState.courseId; })) {
        discussionState.courseId = courses[0] ? courses[0].id : null;
      }
      var activeCourse = courses.filter(function (c) { return c.id === discussionState.courseId; })[0] || null;
      var thread = activeCourse ? ensureCourseDiscussion(activeCourse.id) : null;
      root.innerHTML = tabs +
        '<div class="lp-discuss-layout">' +
          '<aside class="lp-discuss-sidebar">' +
            '<h3>Courses</h3>' +
            (courses.length
              ? '<div class="lp-discuss-list">' + courses.map(function (c) {
                  var count = ((getCourseDiscussion(c.id) || {}).messages || []).length;
                  return '<button type="button" class="lp-discuss-item' + (activeCourse && activeCourse.id === c.id ? ' active' : '') +
                    '" data-lp-discuss-course="' + escapeHtml(c.id) + '">' +
                    '<strong>' + escapeHtml(c.title) + '</strong>' +
                    '<span>' + escapeHtml(c.category || 'General') + (count ? ' · ' + count + ' messages' : '') + '</span>' +
                  '</button>';
                }).join('') + '</div>'
              : '<p class="lp-empty">' + (isInstructor()
                  ? 'No published courses yet.'
                  : 'Enroll in a course to join its discussion.') + '</p>') +
          '</aside>' +
          '<section class="lp-discuss-panel">' +
            (thread && activeCourse
              ? '<div class="lp-card lp-discuss-thread">' +
                  '<div class="lp-discuss-thread-head">' +
                    '<h3>' + escapeHtml(activeCourse.title) + '</h3>' +
                    '<p>General course discussion — visible to tutors and enrolled learners.</p>' +
                  '</div>' +
                  renderDiscussionMessages(thread) +
                  renderMessageComposer(thread.id) +
                '</div>'
              : '<div class="lp-card"><p class="lp-empty">Select a course to open its discussion.</p></div>') +
          '</section>' +
        '</div>';
      return;
    }

    // Private tab
    var threads = visiblePrivateThreads();
    if (discussionState.threadId && !threads.some(function (t) { return t.id === discussionState.threadId; })) {
      discussionState.threadId = null;
    }
    if (!discussionState.threadId && threads[0]) discussionState.threadId = threads[0].id;
    var active = threads.filter(function (t) { return t.id === discussionState.threadId; })[0] || null;
    var data = getData();

    root.innerHTML = tabs +
      '<div class="lp-discuss-layout">' +
        '<aside class="lp-discuss-sidebar">' +
          '<div class="lp-discuss-sidebar-head">' +
            '<h3>Private threads</h3>' +
            '<button type="button" class="lp-btn lp-btn-primary" data-lp-discuss-new-private>New</button>' +
          '</div>' +
          (threads.length
            ? '<div class="lp-discuss-list">' + threads.map(function (t) {
                var course = t.courseId ? data.courses.filter(function (c) { return c.id === t.courseId; })[0] : null;
                return '<button type="button" class="lp-discuss-item' + (active && active.id === t.id ? ' active' : '') +
                  '" data-lp-discuss-thread="' + escapeHtml(t.id) + '">' +
                  '<strong>' + escapeHtml(t.title) + '</strong>' +
                  '<span>' + escapeHtml(isInstructor() ? (t.learnerName || 'Learner') : 'Tutors') +
                    (course ? ' · ' + escapeHtml(course.title) : '') +
                    ' · ' + escapeHtml(formatWhen(t.updatedAt)) +
                  '</span>' +
                '</button>';
              }).join('') + '</div>'
            : '<p class="lp-empty">' + (isInstructor()
                ? 'No private learner discussions yet.'
                : 'Start a private discussion with a tutor when you need help.') + '</p>') +
        '</aside>' +
        '<section class="lp-discuss-panel">' +
          (active
            ? '<div class="lp-card lp-discuss-thread">' +
                '<div class="lp-discuss-thread-head">' +
                  '<h3>' + escapeHtml(active.title) + '</h3>' +
                  '<p>Private discussion' +
                    (isInstructor() ? ' with ' + escapeHtml(active.learnerName || 'learner') : ' with tutors') +
                    ' — only participants and tutors can see this.</p>' +
                '</div>' +
                renderDiscussionMessages(active) +
                renderMessageComposer(active.id) +
              '</div>'
            : '<div class="lp-card"><p class="lp-empty">Select a thread, or start a new private discussion.</p></div>') +
        '</section>' +
      '</div>';
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

  function courseDurationLabel(course) {
    var mins = Number(course && course.durationMinutes) || 0;
    if (!mins && course && Array.isArray(course.lessons)) {
      mins = course.lessons.reduce(function (sum, lesson) {
        return sum + (Number(lesson && lesson.durationMinutes) || 0);
      }, 0);
    }
    if (!mins) return 'Self-paced';
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m ? (h + 'h ' + m + 'm') : (h + 'h');
  }

  function courseInstructorInfo(course) {
    if (course && course.instructorName) {
      return {
        name: course.instructorName,
        title: course.instructorTitle || 'Instructor',
        bio: course.instructorBio || ''
      };
    }
    var profiles = (getData().learnerProfiles || []).filter(function (p) { return p.role === 'instructor'; });
    if (profiles[0]) {
      var en = getData().enrollments.filter(function (e) { return e.userId === profiles[0].userId; })[0];
      return {
        name: (en && en.userName) || profiles[0].userId,
        title: 'Instructor',
        bio: profiles[0].notes || ''
      };
    }
    var settings = getData().settings || {};
    return {
      name: settings.companyLmsName || 'Andeco Learning',
      title: 'Course tutor',
      bio: ''
    };
  }

  function enrollmentProgress(en, course) {
    var total = (course.lessons || []).length;
    var done = (en.completedLessonIds || []).length;
    var pct = en.progressPercent != null
      ? Math.round(Number(en.progressPercent) || 0)
      : (total ? Math.round((done / total) * 100) : 0);
    return {
      percent: pct,
      done: done,
      total: total,
      status: en.status || 'enrolled'
    };
  }

  function statusPretty(status) {
    var map = {
      enrolled: 'Enrolled',
      in_progress: 'In progress',
      completed: 'Completed',
      failed: 'Needs retry',
      passed: 'Passed'
    };
    return map[status] || status || 'Enrolled';
  }

  function renderCoursePage() {
    var en = findEnrollment(playerState.enrollmentId);
    var course = en ? findCourse(en.courseId) : null;
    if (!en || !course) {
      playerState.mode = 'list';
      return '<div class="lp-card"><p class="lp-empty">Course unavailable.</p><button class="lp-btn lp-btn-secondary" data-lp-view="courses">Back</button></div>';
    }

    if (playerState.mode === 'exam' || playerState.panel === 'exam') {
      playerState.panel = 'exam';
      playerState.mode = 'course';
    }

    var panel = playerState.panel || 'overview';
    if (panel === 'lesson' && !playerState.lessonId && course.lessons[0]) {
      playerState.lessonId = course.lessons[0].id;
    }

    var instructor = courseInstructorInfo(course);
    var progress = enrollmentProgress(en, course);
    var completed = en.completedLessonIds || [];
    var activeLesson = course.lessons.filter(function (l) { return l.id === playerState.lessonId; })[0] || null;
    var discussCount = ((getCourseDiscussion(course.id) || {}).messages || []).length;

    return '<div class="lp-course-page">' +
      '<button type="button" class="lp-btn lp-btn-ghost lp-course-back" data-lp-exit-player>← Back to courses</button>' +
      renderCourseHeader(course, instructor, progress, en) +
      '<div class="lp-course-body">' +
        renderCourseSideMenu(course, panel, activeLesson, completed, discussCount) +
        '<section class="lp-course-main">' +
          renderCoursePanel(course, en, panel, activeLesson, instructor, progress) +
        '</section>' +
      '</div>' +
    '</div>';
  }

  function renderCourseHeader(course, instructor, progress, en) {
    var cover = course.coverImage
      ? '<div class="lp-course-hero-media"><img src="' + escapeHtml(course.coverImage) + '" alt=""></div>'
      : '<div class="lp-course-hero-media lp-course-hero-media--plain" aria-hidden="true"></div>';
    return '<header class="lp-course-hero">' +
      cover +
      '<div class="lp-course-hero-content">' +
        '<div class="lp-course-hero-top">' +
          '<span class="lp-badge lp-badge-accent">' + escapeHtml(course.category || 'Course') + '</span>' +
          '<span class="lp-badge">' + escapeHtml(statusPretty(progress.status)) + '</span>' +
        '</div>' +
        '<h2>' + escapeHtml(course.title) + '</h2>' +
        '<div class="lp-course-instructor">' +
          '<div class="lp-avatar" aria-hidden="true">' + escapeHtml(initials(instructor.name)) + '</div>' +
          '<div>' +
            '<strong>' + escapeHtml(instructor.name) + '</strong>' +
            '<span>' + escapeHtml(instructor.title) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="lp-course-hero-stats">' +
          '<div class="lp-course-stat">' +
            '<span class="lp-course-stat-label">Overall progress</span>' +
            '<div class="lp-course-stat-progress">' +
              '<div class="lp-progress"><span style="width:' + progress.percent + '%"></span></div>' +
              '<strong>' + progress.percent + '%</strong>' +
            '</div>' +
          '</div>' +
          '<div class="lp-course-stat"><span class="lp-course-stat-label">Lessons</span><strong>' + progress.done + ' / ' + progress.total + '</strong></div>' +
          '<div class="lp-course-stat"><span class="lp-course-stat-label">Duration</span><strong>' + escapeHtml(courseDurationLabel(course)) + '</strong></div>' +
          '<div class="lp-course-stat"><span class="lp-course-stat-label">Score</span><strong>' +
            (en.score != null ? escapeHtml(String(en.score)) + '%' : '—') +
          '</strong></div>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function renderCourseSideMenu(course, panel, activeLesson, completed, discussCount) {
    var lessonItems = (course.lessons || []).map(function (l, idx) {
      var done = completed.indexOf(l.id) !== -1;
      var active = panel === 'lesson' && activeLesson && activeLesson.id === l.id;
      return '<button type="button" class="lp-course-nav-lesson' + (active ? ' active' : '') + (done ? ' is-done' : '') +
        '" data-lp-lesson="' + escapeHtml(l.id) + '">' +
        '<span class="lp-course-nav-index">' + (done ? '✓' : (idx + 1)) + '</span>' +
        '<span>' + escapeHtml(l.title) + '</span>' +
      '</button>';
    }).join('');

    return '<aside class="lp-course-side">' +
      '<p class="lp-course-side-label">Course menu</p>' +
      '<button type="button" class="lp-course-nav-link' + (panel === 'overview' ? ' active' : '') + '" data-lp-course-panel="overview">Overview</button>' +
      '<div class="lp-course-nav-group">' +
        '<button type="button" class="lp-course-nav-link' + (panel === 'lesson' ? ' active' : '') + '" data-lp-course-panel="lesson">Lessons</button>' +
        '<div class="lp-course-nav-lessons">' + (lessonItems || '<p class="lp-empty">No lessons yet.</p>') + '</div>' +
      '</div>' +
      '<button type="button" class="lp-course-nav-link' + (panel === 'discussion' ? ' active' : '') + '" data-lp-course-panel="discussion">' +
        'Discussion' + (discussCount ? ' <em>' + discussCount + '</em>' : '') +
      '</button>' +
      (course.exam && course.exam.enabled
        ? '<button type="button" class="lp-course-nav-link' + (panel === 'exam' ? ' active' : '') + '" data-lp-course-panel="exam">Exam</button>'
        : '') +
      '<div class="lp-course-side-cta">' +
        (panel === 'overview' && course.lessons[0]
          ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml(course.lessons[0].id) + '">Start learning</button>'
          : '') +
      '</div>' +
    '</aside>';
  }

  function renderCoursePanel(course, en, panel, lesson, instructor, progress) {
    if (panel === 'exam') return renderExamHtml(course, en);
    if (panel === 'discussion') return renderCourseDiscussionPanel(course);
    if (panel === 'lesson') return renderLessonPanel(course, en, lesson);
    return renderOverviewPanel(course, en, instructor, progress);
  }

  function renderOverviewPanel(course, en, instructor, progress) {
    var nextLesson = null;
    var completed = en.completedLessonIds || [];
    (course.lessons || []).some(function (l) {
      if (completed.indexOf(l.id) === -1) {
        nextLesson = l;
        return true;
      }
      return false;
    });
    if (!nextLesson && course.lessons[0]) nextLesson = course.lessons[0];

    return '<div class="lp-card lp-course-panel">' +
      '<h3>About this course</h3>' +
      '<p class="lp-course-desc">' + escapeHtml(course.description || 'No description provided yet.') + '</p>' +
      '<div class="lp-course-overview-grid">' +
        '<div>' +
          '<h4>Your progress</h4>' +
          '<div class="lp-progress"><span style="width:' + progress.percent + '%"></span></div>' +
          '<p class="lp-muted-line">' + progress.percent + '% complete · ' + progress.done + ' of ' + progress.total + ' lessons · ' + escapeHtml(statusPretty(progress.status)) + '</p>' +
          (nextLesson
            ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml(nextLesson.id) + '">' +
                (progress.done ? 'Continue: ' : 'Begin: ') + escapeHtml(nextLesson.title) +
              '</button>'
            : '') +
          (course.exam && course.exam.enabled
            ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="exam" style="margin-left:0.5rem">Go to exam</button>'
            : '') +
        '</div>' +
        '<div class="lp-course-instructor-card">' +
          '<h4>Instructor</h4>' +
          '<div class="lp-course-instructor">' +
            '<div class="lp-avatar" aria-hidden="true">' + escapeHtml(initials(instructor.name)) + '</div>' +
            '<div><strong>' + escapeHtml(instructor.name) + '</strong><span>' + escapeHtml(instructor.title) + '</span></div>' +
          '</div>' +
          (instructor.bio ? '<p>' + escapeHtml(instructor.bio) + '</p>' : '<p class="lp-empty">Your tutor is available in the course discussion and private messages.</p>') +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="discussion">Ask in discussion</button>' +
        '</div>' +
      '</div>' +
      '<h4 style="margin-top:1.25rem">Syllabus</h4>' +
      '<ol class="lp-course-syllabus">' +
        (course.lessons || []).map(function (l, i) {
          var done = completed.indexOf(l.id) !== -1;
          return '<li class="' + (done ? 'is-done' : '') + '">' +
            '<button type="button" data-lp-lesson="' + escapeHtml(l.id) + '">' +
              '<strong>' + (i + 1) + '. ' + escapeHtml(l.title) + '</strong>' +
              '<span>' + escapeHtml(l.durationMinutes ? (l.durationMinutes + ' min') : 'Lesson') + (done ? ' · Completed' : '') + '</span>' +
            '</button></li>';
        }).join('') +
      '</ol>' +
    '</div>';
  }

  function renderLessonPanel(course, en, lesson) {
    if (!lesson) {
      return '<div class="lp-card lp-course-panel"><p class="lp-empty">No lessons in this course yet.</p></div>';
    }
    var completed = en.completedLessonIds || [];
    var done = completed.indexOf(lesson.id) !== -1;
    var idx = course.lessons.findIndex(function (l) { return l.id === lesson.id; });
    var prev = idx > 0 ? course.lessons[idx - 1] : null;
    var next = idx >= 0 && idx < course.lessons.length - 1 ? course.lessons[idx + 1] : null;
    return '<div class="lp-card lp-course-panel">' +
      '<div class="lp-course-lesson-head">' +
        '<p class="lp-muted-line">Lesson ' + (idx + 1) + ' of ' + course.lessons.length + (done ? ' · Completed' : '') + '</p>' +
        '<h3>' + escapeHtml(lesson.title) + '</h3>' +
      '</div>' +
      mediaHtml(lesson) +
      '<div class="lp-lesson-body">' + formatContent(lesson.content) + '</div>' +
      '<div class="lp-form-actions">' +
        (prev ? '<button type="button" class="lp-btn lp-btn-ghost" data-lp-lesson="' + escapeHtml(prev.id) + '">← Previous</button>' : '') +
        '<button type="button" class="lp-btn lp-btn-primary" data-lp-complete-lesson="' + escapeHtml(lesson.id) + '">' +
          (done ? 'Completed · Continue' : 'Mark complete &amp; continue') +
        '</button>' +
        (next ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-lesson="' + escapeHtml(next.id) + '">Next →</button>' : '') +
        (!next && course.exam && course.exam.enabled
          ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="exam">Take exam</button>'
          : '') +
      '</div>' +
    '</div>';
  }

  function renderCourseDiscussionPanel(course) {
    var thread = ensureCourseDiscussion(course.id);
    return '<div class="lp-card lp-course-panel">' +
      '<h3>Course discussion</h3>' +
      '<p class="lp-muted-line">General discussion for this course — visible to tutors and enrolled learners.</p>' +
      renderDiscussionMessages(thread) +
      renderMessageComposer(thread.id) +
    '</div>';
  }

  function renderExamHtml(course, enrollment) {
    var questions = ((course.exam && course.exam.questions) || []).slice();
    return '<div class="lp-card lp-course-panel">' +
      '<h3>Exam: ' + escapeHtml(course.title) + '</h3>' +
      '<p class="lp-muted-line">Pass score: ' + escapeHtml(String((course.exam && course.exam.passScore) || 70)) + '%' +
        (enrollment.score != null ? ' · Your latest score: ' + escapeHtml(String(enrollment.score)) + '%' : '') +
      '</p>' +
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
    screen.addEventListener('keydown', onKeydown);
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

  function onKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.lp-course-card[data-lp-enroll], .lp-course-card[data-lp-open-enroll]');
    if (!card || !e.currentTarget.contains(card)) return;
    e.preventDefault();
    card.click();
  }

  function onClick(e) {
    var t = e.target.closest('[data-lp-view],[data-lp-open-enroll],[data-lp-enroll],[data-lp-lesson],[data-lp-complete-lesson],[data-lp-start-exam],[data-lp-exit-player],[data-lp-back-player],[data-lp-cert],[data-lp-course-panel],[data-lp-discuss-tab],[data-lp-discuss-course],[data-lp-discuss-thread],[data-lp-discuss-new-private],[data-lp-discuss-cancel-private]');
    if (!t) return;
    if (t.hasAttribute('data-lp-view')) {
      view = t.getAttribute('data-lp-view');
      playerState.mode = 'list';
      playerState.panel = 'overview';
      if (view === 'discussions') discussionState.composingPrivate = false;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-course-panel')) {
      var panel = t.getAttribute('data-lp-course-panel');
      playerState.mode = 'course';
      playerState.panel = panel || 'overview';
      if (panel === 'lesson' && !playerState.lessonId) {
        var enPanel = findEnrollment(playerState.enrollmentId);
        var coursePanel = enPanel ? findCourse(enPanel.courseId) : null;
        if (coursePanel && coursePanel.lessons[0]) playerState.lessonId = coursePanel.lessons[0].id;
      }
      if (panel === 'exam') playerState.mode = 'course';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-tab')) {
      discussionState.tab = t.getAttribute('data-lp-discuss-tab') === 'private' ? 'private' : 'course';
      discussionState.composingPrivate = false;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-course')) {
      discussionState.tab = 'course';
      discussionState.courseId = t.getAttribute('data-lp-discuss-course');
      discussionState.composingPrivate = false;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-thread')) {
      discussionState.tab = 'private';
      discussionState.threadId = t.getAttribute('data-lp-discuss-thread');
      discussionState.composingPrivate = false;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-new-private')) {
      discussionState.tab = 'private';
      discussionState.composingPrivate = true;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-cancel-private')) {
      discussionState.composingPrivate = false;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-open-enroll')) {
      playerState.enrollmentId = t.getAttribute('data-lp-open-enroll');
      playerState.lessonId = null;
      playerState.mode = 'course';
      playerState.panel = 'overview';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-enroll')) {
      var en = ensureEnrollment(t.getAttribute('data-lp-enroll'));
      if (en) {
        playerState.enrollmentId = en.id;
        playerState.lessonId = null;
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
      }
      return;
    }
    if (t.hasAttribute('data-lp-lesson')) {
      playerState.lessonId = t.getAttribute('data-lp-lesson');
      playerState.mode = 'course';
      playerState.panel = 'lesson';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-complete-lesson')) {
      completeLesson(t.getAttribute('data-lp-complete-lesson'));
      return;
    }
    if (t.hasAttribute('data-lp-start-exam')) {
      playerState.mode = 'course';
      playerState.panel = 'exam';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-exit-player')) {
      playerState.mode = 'list';
      playerState.panel = 'overview';
      view = 'courses';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-back-player')) {
      playerState.mode = 'course';
      playerState.panel = 'lesson';
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
    if (idx >= 0 && idx < course.lessons.length - 1) {
      playerState.lessonId = course.lessons[idx + 1].id;
      playerState.panel = 'lesson';
    } else if (course.exam && course.exam.enabled) {
      playerState.panel = 'exam';
    } else {
      playerState.panel = 'overview';
    }
    playerState.mode = 'course';
    render();
  }

  function onSubmit(e) {
    if (e.target && e.target.id === 'lp-discussion-reply') {
      e.preventDefault();
      var threadId = e.target.getAttribute('data-thread-id');
      var body = String(new FormData(e.target).get('body') || '').trim();
      if (!postDiscussionMessage(threadId, body)) {
        alert('Unable to post message. Check that you still have access to this discussion.');
        return;
      }
      render();
      return;
    }
    if (e.target && e.target.id === 'lp-private-new') {
      e.preventDefault();
      var fdPriv = new FormData(e.target);
      var opts = {
        title: String(fdPriv.get('title') || '').trim(),
        body: String(fdPriv.get('body') || '').trim(),
        courseId: String(fdPriv.get('courseId') || '').trim()
      };
      if (isInstructor()) {
        opts.learnerId = String(fdPriv.get('learnerId') || '').trim();
        var en = getData().enrollments.filter(function (x) { return x.userId === opts.learnerId; })[0];
        opts.learnerName = en ? en.userName : opts.learnerId;
        if (!opts.learnerId) {
          alert('Select a learner for the private discussion.');
          return;
        }
      }
      var created = createPrivateDiscussion(opts);
      if (!created) {
        alert('Please enter a subject and message.');
        return;
      }
      discussionState.tab = 'private';
      discussionState.threadId = created.id;
      discussionState.composingPrivate = false;
      render();
      return;
    }
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
      playerState.mode = 'course';
      playerState.panel = 'overview';
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
