/**
 * Andeco Learning Portal — modern learner/instructor experience,
 * visually independent from the CRM shell.
 */
(function () {
  'use strict';

  var view = 'home';
  var playerState = {
    enrollmentId: null,
    previewCourseId: null,
    lessonId: null,
    slideIndex: 0,
    mode: 'list', // list | course | exam
    panel: 'overview' // overview | lesson | discussion | exam
  };
  var discussionState = {
    tab: 'course', // course | private
    courseId: null,
    threadId: null,
    composingPrivate: false
  };
  var examTimerHandle = null;
  var examSubmitLock = false;
  var courseEditor = {
    open: false,
    courseId: null,
    draft: null,
    coverCleared: false
  };

  var COURSE_TYPES = {
    course: 'Training course',
    induction: 'Induction',
    procedure: 'Procedure training',
    exam: 'Exam only'
  };

  var COURSE_AUDIENCES = {
    employee: 'Employees only',
    public: 'Public (for sale)',
    applicant: 'Hiring applicants',
    all: 'Employees + public'
  };

  var LESSON_CONTENT_TYPES = {
    text: 'Text / procedure',
    video: 'Video URL',
    link: 'Web link',
    document: 'Document link',
    slideshow: 'Slideshow'
  };

  var SLIDE_KINDS = {
    video: 'Video',
    pptx: 'PowerPoint'
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
    var uid = String(userId || '');
    return (data.learnerProfiles || []).filter(function (p) { return String(p.userId) === uid; })[0] || null;
  }

  function portalRole() {
    var u = currentUser();
    if (!u) return 'learner';
    if (u.isAdmin) return 'instructor';
    var profile = getProfile(u.id);
    var role = profile && String(profile.role || '').trim().toLowerCase();
    if (role === 'instructor') return 'instructor';
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

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function courseCoverHtml(course) {
    var title = escapeHtml((course && course.title) || 'Course');
    if (course && course.coverImage) {
      return '<div class="lp-course-cover"><img src="' + escapeAttr(course.coverImage) + '" alt="' + title + '" loading="lazy"></div>';
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
    // Instructors / admins may view courses without becoming enrolled learners.
    if (isInstructor()) return null;
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

  function isCoursePreview() {
    return !!playerState.previewCourseId && !playerState.enrollmentId;
  }

  function previewEnrollmentStub(course) {
    return {
      id: 'preview',
      courseId: course ? course.id : '',
      userId: (currentUser() || {}).id || '',
      userName: (currentUser() || {}).name || '',
      source: 'preview',
      status: 'preview',
      progressPercent: 0,
      completedLessonIds: [],
      startedAt: '',
      completedAt: '',
      score: null,
      passed: null
    };
  }

  function openCoursePreview(courseId) {
    if (!courseId || !findCourse(courseId)) return;
    playerState.enrollmentId = null;
    playerState.previewCourseId = courseId;
    playerState.lessonId = null;
    playerState.slideIndex = 0;
    playerState.mode = 'course';
    playerState.panel = 'overview';
    render();
  }

  function clearCoursePlayerState() {
    playerState.enrollmentId = null;
    playerState.previewCourseId = null;
    playerState.lessonId = null;
    playerState.slideIndex = 0;
    playerState.mode = 'list';
    playerState.panel = 'overview';
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
    playerState = { enrollmentId: null, previewCourseId: null, lessonId: null, mode: 'list', panel: 'overview', slideIndex: 0 };
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
          { id: 'certificates', label: 'Certificates' },
          { id: 'profile', label: 'My profile' }
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

  function isCourseFocus() {
    return playerState.mode === 'course' || playerState.mode === 'player' || playerState.mode === 'exam';
  }

  function syncCourseFocusShell() {
    var screen = document.getElementById('lms-portal-screen');
    var app = screen && screen.querySelector('.lp-app');
    var focus = isCourseFocus();
    if (screen) screen.classList.toggle('is-course-focus', focus);
    if (app) app.classList.toggle('is-course-focus', focus);
    document.body.classList.toggle('lms-course-focus', focus);
  }

  function render() {
    clearExamTimer();
    renderShell();
    renderNav();
    syncCourseFocusShell();
    var root = document.getElementById('lms-portal-root');
    if (!root) return;
    if (isCourseFocus()) {
      var previewFocus = isCoursePreview();
      var enTitle = previewFocus ? null : findEnrollment(playerState.enrollmentId);
      var courseTitle = previewFocus
        ? findCourse(playerState.previewCourseId)
        : (enTitle ? findCourse(enTitle.courseId) : null);
      if (enTitle && courseTitle && isExamExpiredPending(courseTitle, enTitle)) {
        finishExamAttempt(courseTitle, enTitle, {}, true);
        return;
      }
      setTitle(
        courseTitle ? courseTitle.title : 'Course',
        previewFocus ? 'Instructor preview' : (playerState.panel === 'exam' ? 'Assessment' : 'Course workspace')
      );
      root.innerHTML = renderCoursePage();
      setupExamTimerIfNeeded();
      return;
    }
    if (view === 'home') {
      if (isInstructor()) renderInstructorHome(root);
      else renderLearnerHome(root);
    } else if (view === 'courses') {
      if (isInstructor() && courseEditor.open) renderInstructorCourseEditor(root);
      else if (isInstructor()) renderInstructorCourses(root);
      else renderLearnerCourses(root);
    } else if (view === 'catalog') renderCatalog(root);
    else if (view === 'discussions') renderDiscussions(root);
    else if (view === 'learners') renderInstructorLearners(root);
    else if (view === 'announcements') renderAnnouncements(root);
    else if (view === 'reports') renderReports(root);
    else if (view === 'certificates') renderCertificates(root);
    else if (view === 'profile' && isInstructor()) renderInstructorProfile(root);
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
          '<button type="button" class="lp-btn lp-btn-primary" data-lp-create-course>Create course</button>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-view="courses">Review courses</button>' +
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
        '<button type="button" class="lp-btn lp-btn-primary" data-lp-open-enroll="' + escapeHtml(en.id) + '">' +
          (isEnrollmentContentLocked(en) ? 'View summary' : 'Open') +
        '</button>' +
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
            cta: isEnrollmentContentLocked(en) ? 'View summary' : 'Continue'
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
              cta: isEnrollmentContentLocked(enrolled) ? 'View summary' : 'Continue'
            });
          }
          return courseCardHtml(c, { cta: 'Start' });
        }).join('') + '</div>')
      : '<div class="lp-card"><p class="lp-empty">No published employee courses yet.</p></div>';
  }

  function blankCourseDraft() {
    var u = currentUser();
    return {
      id: newId('crs'),
      title: '',
      description: '',
      coverImage: '',
      instructorName: u ? u.name : '',
      instructorTitle: 'Course Instructor',
      instructorBio: '',
      type: 'course',
      category: 'General',
      audience: 'employee',
      price: 0,
      currency: 'EUR',
      published: false,
      durationMinutes: 0,
      passScore: 70,
      lessons: [{
        id: newId('lsn'),
        title: 'Introduction',
        content: '',
        contentType: 'text',
        mediaUrl: '',
        slides: [],
        order: 0,
        durationMinutes: 0
      }],
      exam: {
        enabled: false,
        timeLimitMinutes: 0,
        passScore: 70,
        shuffle: false,
        questions: []
      },
      certificateValidMonths: 0,
      referenceMaterialsEnabled: false,
      referenceMaterials: [],
      ownerId: u ? u.id : '',
      createdBy: u ? u.id : '',
      createdByName: u ? u.name : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function openCourseEditor(courseId) {
    if (!isInstructor()) return;
    if (courseId) {
      var existing = findCourse(courseId);
      if (!existing) {
        alert('Course not found.');
        return;
      }
      if (!canManageCourse(existing)) {
        alert('You can only edit courses you created.');
        return;
      }
      courseEditor.draft = JSON.parse(JSON.stringify(existing));
      courseEditor.courseId = existing.id;
    } else {
      courseEditor.draft = blankCourseDraft();
      courseEditor.courseId = courseEditor.draft.id;
    }
    courseEditor.open = true;
    courseEditor.coverCleared = false;
    view = 'courses';
    playerState.mode = 'list';
    render();
  }

  function closeCourseEditor() {
    courseEditor.open = false;
    courseEditor.courseId = null;
    courseEditor.draft = null;
    courseEditor.coverCleared = false;
  }

  function canManageCourse(course) {
    if (!isInstructor() || !course) return false;
    var u = currentUser();
    var session = getSession();
    if (session && session.isAdmin) return true;
    if (!course.ownerId && !course.createdBy) return true;
    return !!(u && (course.ownerId === u.id || course.createdBy === u.id));
  }

  function syncPortalCourseDraft() {
    var form = document.getElementById('lp-course-form');
    if (!form || !courseEditor.draft) return courseEditor.draft;
    var fd = new FormData(form);
    var draft = courseEditor.draft;
    draft.title = String(fd.get('title') || '').trim();
    draft.description = String(fd.get('description') || '').trim();
    draft.type = String(fd.get('type') || 'course');
    draft.audience = String(fd.get('audience') || 'employee');
    draft.category = String(fd.get('category') || 'General').trim() || 'General';
    draft.durationMinutes = Number(fd.get('durationMinutes')) || 0;
    draft.price = Number(fd.get('price')) || 0;
    draft.currency = String(fd.get('currency') || 'EUR').trim() || 'EUR';
    draft.published = !!form.querySelector('[name="published"]').checked;
    draft.instructorName = String(fd.get('instructorName') || '').trim();
    draft.instructorTitle = String(fd.get('instructorTitle') || '').trim();
    draft.instructorBio = String(fd.get('instructorBio') || '').trim();
    var typedCover = String(fd.get('coverImage') || '').trim();
    if (typedCover) draft.coverImage = typedCover;
    else if (courseEditor.coverCleared) draft.coverImage = '';
    draft.exam = draft.exam || {};
    draft.exam.enabled = !!form.querySelector('[name="examEnabled"]').checked || draft.type === 'exam';
    draft.exam.passScore = Number(fd.get('passScore')) || 70;
    draft.passScore = draft.exam.passScore;
    draft.exam.timeLimitMinutes = Number(fd.get('timeLimitMinutes')) || 0;
    draft.exam.shuffle = !!form.querySelector('[name="shuffle"]').checked;
    draft.certificateValidMonths = Math.max(0, Number(fd.get('certificateValidMonths')) || 0);
    draft.referenceMaterialsEnabled = !!(form.querySelector('[name="referenceMaterialsEnabled"]') && form.querySelector('[name="referenceMaterialsEnabled"]').checked);
    draft.referenceMaterials = [];
    form.querySelectorAll('[data-lp-reference-block]').forEach(function (block, i) {
      draft.referenceMaterials.push({
        id: block.getAttribute('data-reference-id') || newId('ref'),
        title: (block.querySelector('[data-ref-field="title"]') || {}).value || ('Reference ' + (i + 1)),
        url: (block.querySelector('[data-ref-field="url"]') || {}).value || '',
        kind: (block.querySelector('[data-ref-field="kind"]') || {}).value || 'file'
      });
    });

    draft.lessons = [];
    form.querySelectorAll('[data-lp-lesson-block]').forEach(function (block, i) {
      var slides = [];
      block.querySelectorAll('[data-lp-slide-block]').forEach(function (sb, si) {
        slides.push({
          id: sb.getAttribute('data-slide-id') || newId('sld'),
          title: (sb.querySelector('[data-slide-field="title"]') || {}).value || ('Slide ' + (si + 1)),
          kind: (sb.querySelector('[data-slide-field="kind"]') || {}).value || 'video',
          mediaUrl: (sb.querySelector('[data-slide-field="mediaUrl"]') || {}).value || '',
          notes: (sb.querySelector('[data-slide-field="notes"]') || {}).value || ''
        });
      });
      draft.lessons.push({
        id: block.getAttribute('data-lesson-id') || newId('lsn'),
        title: (block.querySelector('[data-lesson-field="title"]') || {}).value || ('Lesson ' + (i + 1)),
        content: (block.querySelector('[data-lesson-field="content"]') || {}).value || '',
        contentType: (block.querySelector('[data-lesson-field="contentType"]') || {}).value || 'text',
        mediaUrl: (block.querySelector('[data-lesson-field="mediaUrl"]') || {}).value || '',
        slides: slides,
        durationMinutes: Number((block.querySelector('[data-lesson-field="durationMinutes"]') || {}).value) || 0,
        order: i
      });
    });

    draft.exam.questions = [];
    form.querySelectorAll('[data-lp-question-block]').forEach(function (block) {
      var options = [];
      var correct = [];
      block.querySelectorAll('[data-q-option]').forEach(function (input) {
        var oi = input.getAttribute('data-q-option');
        var oid = (block.querySelector('[data-q-option-id="' + oi + '"]') || {}).value || newId('opt');
        options.push({ id: oid, text: input.value || '' });
        var cb = block.querySelector('[data-q-correct="' + oi + '"]');
        if (cb && cb.checked) correct.push(oid);
      });
      draft.exam.questions.push({
        id: block.getAttribute('data-question-id') || newId('q'),
        prompt: (block.querySelector('[data-q-field="prompt"]') || {}).value || '',
        image: (block.querySelector('[data-q-field="image"]') || {}).value || '',
        type: (block.querySelector('[data-q-field="type"]') || {}).value || 'single',
        points: Number((block.querySelector('[data-q-field="points"]') || {}).value) || 1,
        options: options,
        correctOptionIds: correct
      });
    });

    courseEditor.draft = draft;
    return draft;
  }

  function savePortalCourse() {
    if (!isInstructor()) return;
    var draft = syncPortalCourseDraft();
    if (!draft || !draft.title) {
      alert('Please enter a course title before saving.');
      return;
    }
    var existing = findCourse(draft.id);
    if (existing && !canManageCourse(existing)) {
      alert('You can only edit courses you created.');
      return;
    }
    var u = currentUser();
    draft.updatedAt = new Date().toISOString();
    if (!existing) {
      draft.createdAt = new Date().toISOString();
      draft.ownerId = u ? u.id : draft.ownerId;
      draft.createdBy = u ? u.id : draft.createdBy;
      draft.createdByName = u ? u.name : draft.createdByName;
    } else {
      draft.ownerId = existing.ownerId || draft.ownerId || (u ? u.id : '');
      draft.createdBy = existing.createdBy || draft.createdBy || (u ? u.id : '');
      draft.createdByName = existing.createdByName || draft.createdByName || (u ? u.name : '');
      draft.createdAt = existing.createdAt || draft.createdAt;
    }
    // Certificates use the course creator as Course Instructor.
    if (!draft.instructorName) {
      draft.instructorName = draft.createdByName || (u ? u.name : '');
    }
    if (!draft.instructorTitle) draft.instructorTitle = 'Course Instructor';
    if (window.LmsModule && typeof window.LmsModule.normalizeData === 'function') {
      // Normalize shape against the shared LMS course schema.
      draft = window.LmsModule.normalizeData({ courses: [draft] }).courses[0] || draft;
    }
    var data = getData();
    var idx = data.courses.findIndex(function (c) { return c.id === draft.id; });
    if (idx >= 0) data.courses[idx] = draft;
    else data.courses.push(draft);
    saveData(data);
    closeCourseEditor();
    view = 'courses';
    alert(draft.published ? 'Course saved and published.' : 'Course saved as draft.');
    render();
  }

  function renderInstructorCourses(root) {
    var data = getData();
    var u = currentUser();
    setTitle('Courses', 'Create and manage training for your learners');
    root.innerHTML =
      '<div class="lp-card">' +
        '<div class="lp-section-head">' +
          '<div>' +
            '<h3>Training library</h3>' +
            '<p class="lp-muted-line">Create courses, add lessons and exams, then publish them for learners.</p>' +
          '</div>' +
          '<button type="button" class="lp-btn lp-btn-primary" data-lp-create-course>+ Create course</button>' +
        '</div>' +
        '<div style="overflow:auto"><table class="lp-table"><thead><tr>' +
          '<th>Title</th><th>Type</th><th>Audience</th><th>Lessons</th><th>Exam</th><th>Status</th><th>Owner</th><th>Enrolled</th><th></th>' +
        '</tr></thead><tbody>' +
        (data.courses.length ? data.courses.map(function (c) {
          var count = data.enrollments.filter(function (e) { return e.courseId === c.id; }).length;
          var mine = u && (c.ownerId === u.id || c.createdBy === u.id);
          return '<tr><td><strong>' + escapeHtml(c.title) + '</strong>' +
            (c.category ? '<div class="lp-muted-line">' + escapeHtml(c.category) + '</div>' : '') +
            '</td>' +
            '<td>' + escapeHtml(COURSE_TYPES[c.type] || c.type) + '</td>' +
            '<td>' + escapeHtml(COURSE_AUDIENCES[c.audience] || c.audience) + '</td>' +
            '<td>' + (c.lessons || []).length + '</td>' +
            '<td>' + (c.exam && c.exam.enabled ? (c.exam.questions || []).length + ' Q' : '—') + '</td>' +
            '<td>' + badge(c.published ? 'published' : 'draft') + '</td>' +
            '<td>' + escapeHtml(c.createdByName || c.instructorName || (mine ? 'You' : '—')) + '</td>' +
            '<td>' + count + '</td>' +
            '<td class="lp-row-actions">' +
              (canManageCourse(c)
                ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-edit-course="' + escapeHtml(c.id) + '">Edit</button>'
                : '') +
              '<button type="button" class="lp-btn lp-btn-ghost" data-lp-preview-course="' + escapeHtml(c.id) + '">View</button>' +
              (canManageCourse(c)
                ? '<button type="button" class="lp-btn lp-btn-danger" data-lp-delete-course="' + escapeHtml(c.id) + '">Delete</button>'
                : '') +
            '</td></tr>';
        }).join('') : '<tr><td colspan="9">No courses yet. Create your first course to get started.</td></tr>') +
        '</tbody></table></div></div>';
  }

  function renderPortalSlideBlocks(slides, lessonIndex) {
    var list = Array.isArray(slides) ? slides : [];
    return '<div class="lp-slides-editor">' +
      '<div class="lp-slides-editor-head">' +
        '<strong>Slideshow slides</strong>' +
        '<p class="lp-muted-line">Add PowerPoint (.pptx URL) or video slides. Learners can view slides in the player only — no download links.</p>' +
      '</div>' +
      (list.length ? list.map(function (s, si) {
        return '<div class="lp-editor-block lp-slide-block" data-lp-slide-block data-slide-id="' + escapeHtml(s.id || '') + '">' +
          '<div class="lp-editor-block-head"><strong>Slide ' + (si + 1) + '</strong>' +
            '<button type="button" class="lp-btn lp-btn-ghost" data-lp-remove-slide="' + lessonIndex + ':' + si + '">Remove</button></div>' +
          '<div class="lp-form-grid">' +
            '<label>Title<input data-slide-field="title" value="' + escapeHtml(s.title || '') + '"></label>' +
            '<label>Media type<select data-slide-field="kind">' +
              Object.keys(SLIDE_KINDS).map(function (k) {
                return '<option value="' + k + '"' + ((s.kind || 'video') === k ? ' selected' : '') + '>' + escapeHtml(SLIDE_KINDS[k]) + '</option>';
              }).join('') +
            '</select></label>' +
            '<label class="lp-span-2">Media URL<input data-slide-field="mediaUrl" value="' + escapeHtml(s.mediaUrl || '') + '" placeholder="https://… video or .pptx link"></label>' +
            '<label class="lp-span-2">Slide notes<textarea data-slide-field="notes" rows="2">' + escapeHtml(s.notes || '') + '</textarea></label>' +
          '</div></div>';
      }).join('') : '<p class="lp-empty">No slides yet.</p>') +
      '<button type="button" class="lp-btn lp-btn-secondary" data-lp-add-slide="' + lessonIndex + '">+ Add slide</button>' +
    '</div>';
  }

  function renderLessonEditorBlocks(lessons) {
    return (lessons || []).map(function (l, i) {
      var isSlideshow = (l.contentType || 'text') === 'slideshow';
      return '<div class="lp-editor-block" data-lp-lesson-block data-lesson-id="' + escapeHtml(l.id) + '">' +
        '<div class="lp-editor-block-head"><strong>Lesson ' + (i + 1) + '</strong>' +
          '<button type="button" class="lp-btn lp-btn-ghost" data-lp-remove-lesson="' + i + '">Remove</button></div>' +
        '<div class="lp-form-grid">' +
          '<label>Title<input data-lesson-field="title" value="' + escapeHtml(l.title || '') + '" required></label>' +
          '<label>Duration (min)<input data-lesson-field="durationMinutes" type="number" min="0" value="' + escapeHtml(String(l.durationMinutes || 0)) + '"></label>' +
          '<label>Content type<select data-lesson-field="contentType" data-lp-lesson-type>' +
            Object.keys(LESSON_CONTENT_TYPES).map(function (k) {
              return '<option value="' + k + '"' + (l.contentType === k ? ' selected' : '') + '>' + escapeHtml(LESSON_CONTENT_TYPES[k]) + '</option>';
            }).join('') +
          '</select></label>' +
          (isSlideshow
            ? ''
            : '<label>Media / link URL<input data-lesson-field="mediaUrl" value="' + escapeHtml(l.mediaUrl || '') + '" placeholder="https://…"></label>') +
          '<label class="lp-span-2">Lesson content<textarea data-lesson-field="content" rows="4">' + escapeHtml(l.content || '') + '</textarea></label>' +
        '</div>' +
        (isSlideshow ? renderPortalSlideBlocks(l.slides, i) : '') +
      '</div>';
    }).join('') || '<p class="lp-empty">No lessons yet. Add your first lesson.</p>';
  }

  function renderQuestionEditorBlocks(questions) {
    return (questions || []).map(function (q, i) {
      var options = q.options && q.options.length
        ? q.options
        : [{ id: newId('opt'), text: 'Option A' }, { id: newId('opt'), text: 'Option B' }];
      var image = q.image || '';
      var imageUrl = image && image.indexOf('data:image') === 0 ? '' : image;
      return '<div class="lp-editor-block" data-lp-question-block data-question-id="' + escapeHtml(q.id) + '">' +
        '<div class="lp-editor-block-head"><strong>Question ' + (i + 1) + '</strong>' +
          '<button type="button" class="lp-btn lp-btn-ghost" data-lp-remove-question="' + i + '">Remove</button></div>' +
        '<div class="lp-form-grid">' +
          '<label class="lp-span-2">Prompt<textarea data-q-field="prompt" rows="2">' + escapeHtml(q.prompt || '') + '</textarea></label>' +
          '<label>Type<select data-q-field="type">' +
            '<option value="single"' + (q.type !== 'multi' ? ' selected' : '') + '>Single answer</option>' +
            '<option value="multi"' + (q.type === 'multi' ? ' selected' : '') + '>Multiple answers</option>' +
          '</select></label>' +
          '<label>Points<input data-q-field="points" type="number" min="1" value="' + escapeHtml(String(q.points || 1)) + '"></label>' +
          '<label class="lp-span-2">Question image URL (optional)<input data-q-image-url value="' + escapeHtml(imageUrl) + '" placeholder="https://… or upload below">' +
            (image && image.indexOf('data:image') === 0
              ? '<span class="lp-muted-line">Uploaded image is saved with this question.</span>'
              : '') +
          '</label>' +
          '<div class="lp-span-2 lp-q-image-controls">' +
            '<label>Upload question image<input type="file" data-q-image-file accept="image/*"></label>' +
            '<div class="lp-q-image-preview' + (image ? ' has-image' : '') + '" data-q-image-preview>' +
              (image ? '<img src="' + escapeHtml(image) + '" alt="Question image preview">' : '<span>No image</span>') +
            '</div>' +
            '<button type="button" class="lp-btn lp-btn-ghost" data-lp-clear-q-image>Remove image</button>' +
          '</div>' +
        '</div>' +
        '<div class="lp-options-editor">' + options.map(function (o, oi) {
          var checked = (q.correctOptionIds || []).indexOf(o.id) !== -1;
          return '<label class="lp-option-edit">' +
            '<input type="checkbox" data-q-correct="' + oi + '"' + (checked ? ' checked' : '') + '> Correct' +
            '<input type="text" data-q-option="' + oi + '" value="' + escapeHtml(o.text || '') + '" placeholder="Option text">' +
            '<input type="hidden" data-q-option-id="' + oi + '" value="' + escapeHtml(o.id) + '">' +
          '</label>';
        }).join('') + '</div>' +
        '<div class="lp-form-actions">' +
          '<button type="button" class="lp-btn lp-btn-ghost" data-lp-add-option="' + i + '">+ Option</button>' +
        '</div>' +
        '<input type="hidden" data-q-field="image" value="' + escapeHtml(image) + '">' +
      '</div>';
    }).join('') || '<p class="lp-empty">No exam questions yet. Add questions after enabling the exam.</p>';
  }

  function renderInstructorCourseEditor(root) {
    var course = courseEditor.draft || blankCourseDraft();
    courseEditor.draft = course;
    var isNew = !findCourse(course.id);
    setTitle(isNew ? 'Create course' : 'Edit course', isNew ? 'Build a new training course' : course.title || 'Update training');
    var coverPreview = course.coverImage
      ? '<div class="lp-cover-preview has-image"><img src="' + escapeHtml(course.coverImage) + '" alt="Course cover"></div>'
      : '<div class="lp-cover-preview"><span>No photo yet</span></div>';

    root.innerHTML =
      '<div class="lp-card lp-course-editor">' +
        '<div class="lp-section-head">' +
          '<div><h3>' + (isNew ? 'New course' : 'Edit course') + '</h3>' +
            '<p class="lp-muted-line">Add the basics, lessons, and optional exam. Publish when ready for learners.</p></div>' +
          '<button type="button" class="lp-btn lp-btn-ghost" data-lp-cancel-course-editor>← Back to courses</button>' +
        '</div>' +
        '<form id="lp-course-form" class="lp-form">' +
          '<section class="lp-editor-section"><h4>Basics</h4><div class="lp-form-grid">' +
            '<label class="lp-span-2">Title<input name="title" required value="' + escapeHtml(course.title || '') + '" placeholder="e.g. Communication skills"></label>' +
            '<label>Type<select name="type">' +
              Object.keys(COURSE_TYPES).map(function (k) {
                return '<option value="' + k + '"' + (course.type === k ? ' selected' : '') + '>' + escapeHtml(COURSE_TYPES[k]) + '</option>';
              }).join('') +
            '</select></label>' +
            '<label>Audience<select name="audience">' +
              Object.keys(COURSE_AUDIENCES).map(function (k) {
                return '<option value="' + k + '"' + (course.audience === k ? ' selected' : '') + '>' + escapeHtml(COURSE_AUDIENCES[k]) + '</option>';
              }).join('') +
            '</select></label>' +
            '<label>Category<input name="category" value="' + escapeHtml(course.category || 'General') + '"></label>' +
            '<label>Duration (minutes)<input name="durationMinutes" type="number" min="0" value="' + escapeHtml(String(course.durationMinutes || 0)) + '"></label>' +
            '<label>Price<input name="price" type="number" min="0" step="0.01" value="' + escapeHtml(String(course.price || 0)) + '"></label>' +
            '<label>Currency<input name="currency" value="' + escapeHtml(course.currency || 'EUR') + '"></label>' +
            '<label class="lp-span-2">Description<textarea name="description" rows="3" placeholder="What will learners gain from this course?">' + escapeHtml(course.description || '') + '</textarea></label>' +
            '<label class="lp-span-2">Course photo URL<input name="coverImage" id="lp-cover-image-input" value="' +
              escapeHtml((course.coverImage && course.coverImage.indexOf('data:image') === 0) ? '' : (course.coverImage || '')) +
              '" placeholder="https://… or upload below"></label>' +
            '<div class="lp-span-2">' +
              '<label>Upload course photo<input type="file" id="lp-cover-image-file" accept="image/*"></label>' +
              coverPreview +
              '<button type="button" class="lp-btn lp-btn-ghost" data-lp-clear-cover style="margin-top:0.5rem">Remove photo</button>' +
            '</div>' +
            '<label class="lp-check"><input type="checkbox" name="published"' + (course.published ? ' checked' : '') + '> Published (visible to learners)</label>' +
          '</div></section>' +
          '<section class="lp-editor-section"><h4>Instructor</h4><div class="lp-form-grid">' +
            '<label>Instructor name<input name="instructorName" value="' + escapeHtml(course.instructorName || '') + '"></label>' +
            '<label>Instructor title<input name="instructorTitle" value="' + escapeHtml(course.instructorTitle || '') + '" placeholder="e.g. Senior Trainer"></label>' +
            '<label class="lp-span-2">Instructor bio<textarea name="instructorBio" rows="2">' + escapeHtml(course.instructorBio || '') + '</textarea></label>' +
          '</div></section>' +
          '<section class="lp-editor-section"><h4>Lessons</h4>' +
            '<p class="lp-muted-line">Lesson media is view-only. Downloads are only available from Reference materials when you allow them.</p>' +
            '<div id="lp-lessons-editor">' + renderLessonEditorBlocks(course.lessons || []) + '</div>' +
            '<button type="button" class="lp-btn lp-btn-secondary" data-lp-add-lesson>+ Add lesson</button>' +
          '</section>' +
          '<section class="lp-editor-section"><h4>Reference materials</h4>' +
            '<label class="lp-check"><input type="checkbox" name="referenceMaterialsEnabled"' +
              (course.referenceMaterialsEnabled ? ' checked' : '') +
              '> Allow learners to download reference materials</label>' +
            '<p class="lp-muted-line">Only files listed here can be downloaded when this option is enabled.</p>' +
            '<div id="lp-reference-editor">' + renderReferenceEditorBlocks(course.referenceMaterials || []) + '</div>' +
            '<button type="button" class="lp-btn lp-btn-secondary" data-lp-add-reference>+ Add reference file</button>' +
          '</section>' +
          '<section class="lp-editor-section"><h4>Exam</h4><div class="lp-form-grid">' +
            '<label class="lp-check"><input type="checkbox" name="examEnabled"' + (course.exam && course.exam.enabled ? ' checked' : '') + '> Enable exam</label>' +
            '<label>Pass score (%)<input name="passScore" type="number" min="0" max="100" value="' + escapeHtml(String((course.exam && course.exam.passScore) || course.passScore || 70)) + '"></label>' +
            '<label>Time limit (minutes)<input name="timeLimitMinutes" type="number" min="0" value="' + escapeHtml(String((course.exam && course.exam.timeLimitMinutes) || 0)) + '"></label>' +
            '<label class="lp-check"><input type="checkbox" name="shuffle"' + (course.exam && course.exam.shuffle ? ' checked' : '') + '> Shuffle questions</label>' +
            '<label>Certificate validity (months)<input name="certificateValidMonths" type="number" min="0" value="' + escapeHtml(String(course.certificateValidMonths || 0)) + '"><span class="lp-muted-line">0 = no expiration</span></label>' +
          '</div>' +
            '<div id="lp-questions-editor">' + renderQuestionEditorBlocks((course.exam && course.exam.questions) || []) + '</div>' +
            '<button type="button" class="lp-btn lp-btn-secondary" data-lp-add-question>+ Add question</button>' +
          '</section>' +
          '<div class="lp-form-actions">' +
            '<button type="submit" class="lp-btn lp-btn-primary">Save course</button>' +
            '<button type="button" class="lp-btn lp-btn-ghost" data-lp-cancel-course-editor>Cancel</button>' +
          '</div>' +
        '</form></div>';

    bindPortalCoverControls();
    bindPortalQuestionImageControls();
  }

  function bindPortalQuestionImageControls() {
    var wrap = document.getElementById('lp-questions-editor');
    if (!wrap) return;
    wrap.querySelectorAll('[data-lp-question-block]').forEach(function (block) {
      var hidden = block.querySelector('[data-q-field="image"]');
      var urlInput = block.querySelector('[data-q-image-url]');
      var fileInput = block.querySelector('[data-q-image-file]');
      var preview = block.querySelector('[data-q-image-preview]');
      var clearBtn = block.querySelector('[data-lp-clear-q-image]');
      if (!hidden || !preview) return;

      function setPreview(src) {
        if (src) {
          preview.className = 'lp-q-image-preview has-image';
          preview.innerHTML = '<img src="' + escapeHtml(src) + '" alt="Question image preview">';
        } else {
          preview.className = 'lp-q-image-preview';
          preview.innerHTML = '<span>No image</span>';
        }
      }

      if (fileInput) {
        fileInput.onchange = function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          if (file.size > 1.5 * 1024 * 1024) {
            alert('Please choose an image under 1.5 MB.');
            fileInput.value = '';
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            var dataUrl = String(reader.result || '');
            hidden.value = dataUrl;
            if (urlInput) urlInput.value = '';
            setPreview(dataUrl);
            syncPortalCourseDraft();
          };
          reader.readAsDataURL(file);
        };
      }

      if (urlInput) {
        urlInput.oninput = function () {
          var typed = urlInput.value.trim();
          hidden.value = typed;
          setPreview(typed);
          syncPortalCourseDraft();
        };
      }

      if (clearBtn) {
        clearBtn.onclick = function () {
          if (fileInput) fileInput.value = '';
          if (urlInput) urlInput.value = '';
          hidden.value = '';
          setPreview('');
          syncPortalCourseDraft();
        };
      }
    });
  }

  function bindPortalCoverControls() {
    var fileInput = document.getElementById('lp-cover-image-file');
    var urlInput = document.getElementById('lp-cover-image-input');
    var preview = document.querySelector('.lp-cover-preview');
    if (!fileInput || !urlInput || !preview || !courseEditor.draft) return;

    function setPreview(src) {
      if (src) {
        preview.className = 'lp-cover-preview has-image';
        preview.innerHTML = '<img src="' + src + '" alt="Course cover">';
      } else {
        preview.className = 'lp-cover-preview';
        preview.innerHTML = '<span>No photo yet</span>';
      }
    }

    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 2.5 * 1024 * 1024) {
        alert('Please choose an image under 2.5 MB.');
        fileInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        courseEditor.draft.coverImage = dataUrl;
        courseEditor.coverCleared = false;
        urlInput.value = '';
        setPreview(dataUrl);
      };
      reader.readAsDataURL(file);
    };

    urlInput.oninput = function () {
      var typed = urlInput.value.trim();
      courseEditor.draft.coverImage = typed;
      courseEditor.coverCleared = !typed;
      setPreview(typed);
    };
  }

  function renderInstructorLearners(root) {
    var data = getData();
    setTitle('Learners', 'People and progress');
    root.innerHTML = '<div class="lp-card">' + renderEnrollmentTable(data.enrollments.slice().reverse(), true) + '</div>';
  }

  function upsertPortalProfile(patch) {
    var u = currentUser();
    if (!u) return null;
    var data = getData();
    data.learnerProfiles = data.learnerProfiles || [];
    var idx = data.learnerProfiles.findIndex(function (p) { return p.userId === u.id; });
    var base = idx >= 0
      ? data.learnerProfiles[idx]
      : { userId: u.id, role: 'instructor', department: '', notes: '', title: '', signatureImage: '' };
    var next = Object.assign({}, base, patch || {}, {
      userId: u.id,
      role: 'instructor'
    });
    if (idx >= 0) data.learnerProfiles[idx] = next;
    else data.learnerProfiles.push(next);
    saveData(data);
    return next;
  }

  function renderInstructorProfile(root) {
    var u = currentUser();
    var profile = (u && getProfile(u.id)) || {
      role: 'instructor',
      department: '',
      notes: '',
      title: 'Course Instructor',
      signatureImage: ''
    };
    setTitle('My profile', 'Your instructor details and certificate signature');
    root.innerHTML =
      '<div class="lp-card lp-course-editor">' +
        '<div class="lp-section-head">' +
          '<div>' +
            '<h3>Instructor profile</h3>' +
            '<p class="lp-muted-line">This name and signature appear on certificates for courses you create.</p>' +
          '</div>' +
        '</div>' +
        '<form id="lp-instructor-profile-form" class="lp-form">' +
          '<section class="lp-editor-section"><h4>Details</h4><div class="lp-form-grid">' +
            '<label>Display name<input value="' + escapeHtml(u ? u.name : '') + '" disabled></label>' +
            '<label>Title<input name="title" value="' + escapeHtml(profile.title || 'Course Instructor') + '" placeholder="Course Instructor"></label>' +
            '<label>Department<input name="department" value="' + escapeHtml(profile.department || '') + '" placeholder="e.g. Training"></label>' +
            '<label class="lp-span-2">Bio / notes<textarea name="notes" rows="3" placeholder="Short intro shown to learners">' + escapeHtml(profile.notes || '') + '</textarea></label>' +
          '</div></section>' +
          '<section class="lp-editor-section"><h4>Certificate signature</h4>' +
            '<p class="lp-muted-line">Upload a clear signature image (PNG or JPG). It is used on certificates as Course Instructor.</p>' +
            '<label>Upload signature<input type="file" id="lp-signature-file" accept="image/*"></label>' +
            '<input type="hidden" name="signatureImage" id="lp-signature-value" value="">' +
            '<div class="lp-signature-preview' + (profile.signatureImage ? ' has-image' : '') + '" id="lp-signature-preview">' +
              (profile.signatureImage
                ? '<img src="' + escapeHtml(profile.signatureImage) + '" alt="Your signature">'
                : '<span>No signature uploaded yet</span>') +
            '</div>' +
            '<div class="lp-form-actions">' +
              '<button type="button" class="lp-btn lp-btn-ghost" data-lp-clear-signature>Remove signature</button>' +
            '</div>' +
          '</section>' +
          '<div class="lp-form-actions">' +
            '<button type="submit" class="lp-btn lp-btn-primary">Save profile</button>' +
          '</div>' +
        '</form></div>';

    var fileInput = document.getElementById('lp-signature-file');
    var hidden = document.getElementById('lp-signature-value');
    var preview = document.getElementById('lp-signature-preview');
    var form = document.getElementById('lp-instructor-profile-form');
    if (fileInput && hidden && preview && form) {
      form.setAttribute('data-signature-current', profile.signatureImage || '');
      fileInput.onchange = function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 1.5 * 1024 * 1024) {
          alert('Please choose a signature image under 1.5 MB.');
          fileInput.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = String(reader.result || '');
          hidden.value = dataUrl;
          form.removeAttribute('data-signature-cleared');
          preview.className = 'lp-signature-preview has-image';
          preview.innerHTML = '<img src="' + dataUrl + '" alt="Your signature">';
        };
        reader.readAsDataURL(file);
      };
    }
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
      '<p class="lp-muted-line">This stays in the Private subsection and is not shown in General.</p>' +
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

  function renderDiscussionSubnav(tab) {
    return '<div class="lp-discuss-subnav" role="tablist" aria-label="Discussion sections">' +
      '<button type="button" class="lp-discuss-subnav-btn' + (tab === 'course' ? ' active' : '') + '" data-lp-discuss-tab="course" role="tab" aria-selected="' + (tab === 'course' ? 'true' : 'false') + '">' +
        '<strong>General</strong>' +
        '<span>Open course discussions for everyone enrolled</span>' +
      '</button>' +
      '<button type="button" class="lp-discuss-subnav-btn' + (tab === 'private' ? ' active' : '') + '" data-lp-discuss-tab="private" role="tab" aria-selected="' + (tab === 'private' ? 'true' : 'false') + '">' +
        '<strong>Private</strong>' +
        '<span>' + (isInstructor() ? 'One-to-one chats with learners' : 'One-to-one chats with tutors') + '</span>' +
      '</button>' +
    '</div>';
  }

  function renderDiscussions(root) {
    var tab = discussionState.tab === 'private' ? 'private' : 'course';
    setTitle('Discussions', 'General course chat and private tutor conversations');

    var subnav = renderDiscussionSubnav(tab);
    var sectionIntro = tab === 'private'
      ? '<div class="lp-discuss-section-head"><h3>Private</h3><p>' +
          (isInstructor()
            ? 'Private threads between tutors and individual learners. Only tutors and that learner can see them.'
            : 'Private threads with tutors. Other learners cannot see these conversations.') +
        '</p></div>'
      : '<div class="lp-discuss-section-head"><h3>General</h3><p>Shared discussion for each course. Visible to tutors and enrolled learners.</p></div>';

    if (tab === 'private' && discussionState.composingPrivate) {
      root.innerHTML = subnav + sectionIntro + renderPrivateComposeForm();
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
      root.innerHTML = subnav + sectionIntro +
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
                    '<p>General discussion for this course.</p>' +
                  '</div>' +
                  renderDiscussionMessages(thread) +
                  renderMessageComposer(thread.id) +
                '</div>'
              : '<div class="lp-card"><p class="lp-empty">Select a course to open its general discussion.</p></div>') +
          '</section>' +
        '</div>';
      return;
    }

    // Private subsection
    var threads = visiblePrivateThreads();
    if (discussionState.threadId && !threads.some(function (t) { return t.id === discussionState.threadId; })) {
      discussionState.threadId = null;
    }
    if (!discussionState.threadId && threads[0]) discussionState.threadId = threads[0].id;
    var active = threads.filter(function (t) { return t.id === discussionState.threadId; })[0] || null;
    var data = getData();

    root.innerHTML = subnav + sectionIntro +
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
                    ' — only you and tutors can see this.</p>' +
                '</div>' +
                renderDiscussionMessages(active) +
                renderMessageComposer(active.id) +
              '</div>'
            : '<div class="lp-card"><p class="lp-empty">Select a private thread, or start a new one.</p></div>') +
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

  function portalCertExpiry(cert) {
    if (cert && cert.expiresAt) return cert.expiresAt;
    var course = findCourse(cert && cert.courseId);
    var months = course ? Number(course.certificateValidMonths) || 0 : Number(cert && cert.validMonths) || 0;
    return computePortalCertificateExpiry(cert && cert.issuedAt, months);
  }

  function portalCertExpired(cert) {
    var expiresAt = portalCertExpiry(cert);
    if (!expiresAt) return false;
    var t = new Date(expiresAt).getTime();
    return !isNaN(t) && t < Date.now();
  }

  function formatPortalCertDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function renderCertificates(root) {
    var data = getData();
    var u = currentUser();
    var certs = isInstructor()
      ? (data.certificates || [])
      : (data.certificates || []).filter(function (c) { return u && c.userId === u.id; });
    setTitle('Certificates', isInstructor() ? 'All learner certifications' : 'Recognise completed learning');
    if (isInstructor()) {
      var sorted = certs.slice().sort(function (a, b) {
        return String(b.issuedAt || '').localeCompare(String(a.issuedAt || ''));
      });
      root.innerHTML =
        '<div class="lp-card">' +
          '<div class="lp-section-head"><div><h3>Certifications obtained</h3>' +
            '<p class="lp-muted-line">Track certificate numbers, scores, and expiration dates for every learner.</p></div></div>' +
          '<div style="overflow:auto"><table class="lp-table"><thead><tr>' +
            '<th>Certification No</th><th>Name</th><th>Course</th><th>Date</th><th>Score</th><th>Expiration Date</th><th>Status</th><th></th>' +
          '</tr></thead><tbody>' +
          (sorted.length ? sorted.map(function (c) {
            var expiresAt = portalCertExpiry(c);
            var expired = portalCertExpired(c);
            return '<tr>' +
              '<td><strong>' + escapeHtml(c.certificateNo || '—') + '</strong></td>' +
              '<td>' + escapeHtml(c.userName || '—') + '</td>' +
              '<td>' + escapeHtml(c.courseTitle || '—') + '</td>' +
              '<td>' + escapeHtml(formatPortalCertDate(c.issuedAt)) + '</td>' +
              '<td>' + (c.score != null ? escapeHtml(String(c.score)) + '%' : '—') + '</td>' +
              '<td>' + escapeHtml(expiresAt ? formatPortalCertDate(expiresAt) : 'Never') + '</td>' +
              '<td><span class="lp-badge ' + (expired ? 'lp-badge-warn' : 'lp-badge-ok') + '">' +
                (expired ? 'Expired' : 'Valid') + '</span></td>' +
              '<td><button type="button" class="lp-btn lp-btn-secondary" data-lp-cert="' + escapeHtml(c.id) + '">Open</button></td></tr>';
          }).join('') : '<tr><td colspan="8">No certificates issued yet.</td></tr>') +
          '</tbody></table></div></div>';
      return;
    }
    root.innerHTML = '<div class="lp-card"><div class="lp-list">' +
      (certs.length ? certs.slice().reverse().map(function (c) {
        var expiresAt = portalCertExpiry(c);
        var expired = portalCertExpired(c);
        return '<div class="lp-item"><div><h4>' + escapeHtml(c.courseTitle) + '</h4>' +
          '<p>' + escapeHtml(c.certificateNo || '') +
          ' · Score ' + (c.score != null ? escapeHtml(String(c.score)) + '%' : '—') +
          ' · Issued ' + escapeHtml(formatPortalCertDate(c.issuedAt)) +
          ' · Expires ' + escapeHtml(expiresAt ? formatPortalCertDate(expiresAt) : 'Never') +
          (expired ? ' · Expired' : '') +
          '</p></div>' +
          '<button type="button" class="lp-btn lp-btn-secondary" data-lp-cert="' + escapeHtml(c.id) + '">Open</button></div>';
      }).join('') : '<p class="lp-empty">No certificates yet.</p>') +
    '</div></div>';
  }

  function formatContent(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
  }

  function wrapPortalProtectedMedia(html) {
    return '<div class="lp-media-protected" oncontextmenu="return false" ondragstart="return false">' + html + '</div>';
  }

  function portalVideoEmbed(url) {
    if (!url) return '';
    var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);
    var vim = url.match(/vimeo\.com\/(\d+)/);
    var inner;
    if (yt) {
      inner = '<div class="lp-media"><iframe src="https://www.youtube.com/embed/' + escapeHtml(yt[1]) +
        '?controls=1&modestbranding=1&rel=0" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div>';
    } else if (vim) {
      inner = '<div class="lp-media"><iframe src="https://player.vimeo.com/video/' + escapeHtml(vim[1]) +
        '" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div>';
    } else {
      inner = '<div class="lp-media"><video controls controlsList="nodownload noplaybackrate" disablePictureInPicture playsinline src="' +
        escapeHtml(url) + '" oncontextmenu="return false"></video></div>';
    }
    return wrapPortalProtectedMedia(inner);
  }

  function portalOfficeEmbed(url, title) {
    if (!url) return '';
    var embed = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url);
    return wrapPortalProtectedMedia(
      '<div class="lp-media lp-media--office"><iframe src="' + escapeHtml(embed) + '" title="' +
        escapeHtml(title || 'Document') + '" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div>' +
      '<p class="lp-muted-line">View only — downloading or copying course materials is disabled.</p>'
    );
  }

  function portalPptxEmbed(url) {
    return portalOfficeEmbed(url, 'PowerPoint presentation');
  }

  function portalDocumentEmbed(url) {
    if (!url) return '';
    var lower = String(url).toLowerCase();
    if (/\.(pptx?|docx?|xlsx?)(\?|#|$)/.test(lower) || /sharepoint\.|onedrive\.|1drv\.ms/.test(lower)) {
      return portalOfficeEmbed(url, 'Course document');
    }
    if (/\.pdf(\?|#|$)/.test(lower)) {
      return wrapPortalProtectedMedia(
        '<div class="lp-media lp-media--pdf"><iframe src="' + escapeHtml(url) +
          '#toolbar=0&navpanes=0" title="Course document" loading="lazy" referrerpolicy="no-referrer"></iframe></div>' +
        '<p class="lp-muted-line">View only — downloading or copying course materials is disabled.</p>'
      );
    }
    return wrapPortalProtectedMedia(
      '<div class="lp-media"><iframe src="' + escapeHtml(url) +
        '" title="Course resource" loading="lazy" referrerpolicy="no-referrer"></iframe></div>' +
      '<p class="lp-muted-line">View only — course materials cannot be downloaded from the lesson player.</p>'
    );
  }

  function renderReferenceMaterials(course) {
    if (!course || !course.referenceMaterialsEnabled) return '';
    var items = (Array.isArray(course.referenceMaterials) ? course.referenceMaterials : []).filter(function (item) {
      return item && item.url;
    });
    if (!items.length) return '';
    return '<div class="lp-reference-materials">' +
      '<h4>Reference materials</h4>' +
      '<p class="lp-muted-line">Approved downloads for this course.</p>' +
      '<ul class="lp-reference-list">' + items.map(function (item) {
        return '<li><a class="lp-btn lp-btn-secondary" href="' + escapeHtml(item.url) +
          '" target="_blank" rel="noopener noreferrer" download>' + escapeHtml(item.title || 'Download') + '</a></li>';
      }).join('') + '</ul></div>';
  }

  function renderReferenceEditorBlocks(items) {
    var list = Array.isArray(items) ? items : [];
    return list.length ? list.map(function (item, i) {
      return '<div class="lp-editor-block" data-lp-reference-block data-reference-id="' + escapeHtml(item.id || '') + '">' +
        '<div class="lp-editor-block-head"><strong>Reference ' + (i + 1) + '</strong>' +
          '<button type="button" class="lp-btn lp-btn-ghost" data-lp-remove-reference="' + i + '">Remove</button></div>' +
        '<div class="lp-form-grid">' +
          '<label>Title<input data-ref-field="title" value="' + escapeHtml(item.title || '') + '" placeholder="e.g. Safety handbook"></label>' +
          '<label>Type<select data-ref-field="kind">' +
            '<option value="file"' + (item.kind !== 'link' ? ' selected' : '') + '>Downloadable file</option>' +
            '<option value="link"' + (item.kind === 'link' ? ' selected' : '') + '>Web link</option>' +
          '</select></label>' +
          '<label class="lp-span-2">URL<input data-ref-field="url" value="' + escapeHtml(item.url || '') + '" placeholder="https://… file or page link"></label>' +
        '</div></div>';
    }).join('') : '<p class="lp-empty">No reference materials yet.</p>';
  }

  function portalSlideshowHtml(lesson) {
    var slides = Array.isArray(lesson && lesson.slides) ? lesson.slides : [];
    if (!slides.length) return '<p class="lp-empty">This slideshow has no slides yet.</p>';
    var idx = Math.max(0, Math.min(Number(playerState.slideIndex) || 0, slides.length - 1));
    var slide = slides[idx] || {};
    var media = !slide.mediaUrl
      ? '<p class="lp-muted-line">No media URL set for this slide yet.</p>'
      : (slide.kind === 'pptx' ? portalPptxEmbed(slide.mediaUrl) : portalVideoEmbed(slide.mediaUrl));
    return '<div class="lp-slideshow">' +
      '<div class="lp-slideshow-toolbar">' +
        '<button type="button" class="lp-btn lp-btn-secondary"' + (idx <= 0 ? ' disabled' : '') + ' data-lp-slide-prev>← Previous</button>' +
        '<span class="lp-slideshow-count">Slide ' + (idx + 1) + ' of ' + slides.length + '</span>' +
        '<button type="button" class="lp-btn lp-btn-secondary"' + (idx >= slides.length - 1 ? ' disabled' : '') + ' data-lp-slide-next>Next →</button>' +
      '</div>' +
      '<div class="lp-slideshow-slide">' +
        '<h4>' + escapeHtml(slide.title || ('Slide ' + (idx + 1))) + '</h4>' +
        '<p class="lp-muted-line">' + escapeHtml(SLIDE_KINDS[slide.kind] || slide.kind || 'Video') + '</p>' +
        media +
        (slide.notes ? '<p class="lp-slideshow-notes">' + escapeHtml(slide.notes).replace(/\n/g, '<br>') + '</p>' : '') +
      '</div>' +
    '</div>';
  }

  function mediaHtml(lesson) {
    var type = lesson.contentType || 'text';
    if (type === 'slideshow') return portalSlideshowHtml(lesson);
    var url = lesson.mediaUrl || '';
    if (!url || type === 'text') return '';
    if (type === 'video') return portalVideoEmbed(url);
    if (type === 'document') return portalDocumentEmbed(url);
    return portalDocumentEmbed(url);
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
    if (course && (course.createdByName || course.instructorName || course.ownerId || course.createdBy)) {
      var ownerId = course.ownerId || course.createdBy || '';
      var ownerProfile = ownerId ? getProfile(ownerId) : null;
      return {
        name: course.createdByName || course.instructorName || 'Course Instructor',
        title: course.instructorTitle || 'Course Instructor',
        bio: course.instructorBio || (ownerProfile && ownerProfile.notes) || ''
      };
    }
    var profiles = (getData().learnerProfiles || []).filter(function (p) { return p.role === 'instructor'; });
    if (profiles[0]) {
      var en = getData().enrollments.filter(function (e) { return e.userId === profiles[0].userId; })[0];
      return {
        name: (en && en.userName) || profiles[0].userId,
        title: profiles[0].title || 'Course Instructor',
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

  function allLessonsComplete(course, en) {
    var lessons = (course && course.lessons) || [];
    if (!lessons.length) return true;
    var done = (en && en.completedLessonIds) || [];
    return lessons.every(function (l) { return done.indexOf(l.id) !== -1; });
  }

  function isLessonUnlocked(course, en, lessonId) {
    if (isInstructor()) return true;
    var lessons = (course && course.lessons) || [];
    var idx = -1;
    for (var i = 0; i < lessons.length; i++) {
      if (lessons[i].id === lessonId) { idx = i; break; }
    }
    if (idx < 0) return false;
    if (idx === 0) return true;
    var done = (en && en.completedLessonIds) || [];
    for (var p = 0; p < idx; p++) {
      if (done.indexOf(lessons[p].id) === -1) return false;
    }
    return true;
  }

  function firstAvailableLesson(course, en) {
    var lessons = (course && course.lessons) || [];
    if (!lessons.length) return null;
    var done = (en && en.completedLessonIds) || [];
    for (var i = 0; i < lessons.length; i++) {
      if (done.indexOf(lessons[i].id) === -1) return lessons[i];
    }
    return lessons[0];
  }

  function canAccessExam(course, en) {
    if (!course || !course.exam || !course.exam.enabled) return false;
    if (isEnrollmentContentLocked(en)) return false;
    if (isInstructor()) return true;
    return allLessonsComplete(course, en);
  }

  function isEnrollmentContentLocked(en) {
    return !!(en && (en.status === 'completed' || en.passed === true));
  }

  function findEnrollmentCertificate(en) {
    if (!en) return null;
    var data = getData();
    return (data.certificates || []).filter(function (c) {
      return c.enrollmentId === en.id || (c.courseId === en.courseId && c.userId === en.userId);
    })[0] || null;
  }

  function remainingLessonsCount(course, en) {
    var lessons = (course && course.lessons) || [];
    var done = (en && en.completedLessonIds) || [];
    return lessons.filter(function (l) { return done.indexOf(l.id) === -1; }).length;
  }

  function examTimeLimitMinutes(course) {
    return Math.max(0, Number(course && course.exam && course.exam.timeLimitMinutes) || 0);
  }

  function hasUsedExamAttempt(enrollment) {
    if (!enrollment) return false;
    if (enrollment.score != null) return true;
    if (enrollment.passed === true || enrollment.passed === false) return true;
    var data = getData();
    return (data.attempts || []).some(function (a) {
      return a.enrollmentId === enrollment.id;
    });
  }

  function examEndsAtMs(course, enrollment) {
    var mins = examTimeLimitMinutes(course);
    if (!mins || !enrollment || !enrollment.examStartedAt) return null;
    var start = new Date(enrollment.examStartedAt).getTime();
    if (isNaN(start)) return null;
    return start + mins * 60 * 1000;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function formatCountdown(ms) {
    if (ms < 0) ms = 0;
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
    return pad2(m) + ':' + pad2(s);
  }

  function clearExamTimer() {
    if (examTimerHandle) {
      clearInterval(examTimerHandle);
      examTimerHandle = null;
    }
  }

  function statusPretty(status) {
    var map = {
      enrolled: 'Enrolled',
      in_progress: 'In progress',
      completed: 'Completed',
      failed: 'Not passed',
      passed: 'Passed',
      preview: 'Instructor preview'
    };
    return map[status] || status || 'Enrolled';
  }

  function renderCoursePage() {
    var preview = isCoursePreview();
    var en = preview ? null : findEnrollment(playerState.enrollmentId);
    var course = preview
      ? findCourse(playerState.previewCourseId)
      : (en ? findCourse(en.courseId) : null);
    if (!course || (!preview && !en)) {
      clearCoursePlayerState();
      syncCourseFocusShell();
      return '<div class="lp-card"><p class="lp-empty">Course unavailable.</p><button class="lp-btn lp-btn-secondary" data-lp-view="courses">Back</button></div>';
    }
    if (preview) en = previewEnrollmentStub(course);

    if (playerState.mode === 'exam' || playerState.panel === 'exam') {
      playerState.panel = 'exam';
      playerState.mode = 'course';
    }

    var contentLocked = !preview && isEnrollmentContentLocked(en);
    var panel = playerState.panel || 'overview';
    if (contentLocked && (panel === 'exam' || panel === 'lesson')) {
      panel = 'overview';
      playerState.panel = 'overview';
      playerState.lessonId = null;
    }
    if (panel === 'exam' && !preview && !canAccessExam(course, en)) {
      panel = 'overview';
      playerState.panel = 'overview';
    }
    if (!contentLocked && panel === 'lesson') {
      if (!playerState.lessonId || !isLessonUnlocked(course, en, playerState.lessonId)) {
        var available = firstAvailableLesson(course, en);
        playerState.lessonId = available ? available.id : null;
      }
    }

    var instructor = courseInstructorInfo(course);
    var progress = preview
      ? { percent: 0, done: 0, total: (course.lessons || []).length, status: 'preview' }
      : enrollmentProgress(en, course);
    var completed = en.completedLessonIds || [];
    var activeLesson = course.lessons.filter(function (l) { return l.id === playerState.lessonId; })[0] || null;
    var discussCount = ((getCourseDiscussion(course.id) || {}).messages || []).length;
    var privateCount = visiblePrivateThreads().filter(function (t) {
      return t.courseId === course.id || !t.courseId;
    }).length;
    var examUnlocked = preview ? true : canAccessExam(course, en);
    var examDone = preview ? false : hasUsedExamAttempt(en);

    return '<div class="lp-course-page lp-course-page--focus' + (contentLocked ? ' is-content-locked' : '') + (preview ? ' is-preview' : '') + '">' +
      renderCourseSideMenu(course, panel, activeLesson, completed, discussCount, privateCount, progress, instructor, examUnlocked, en, examDone) +
      '<div class="lp-course-focus-main">' +
        renderCourseHeader(course, instructor, progress, en) +
        '<section class="lp-course-main">' +
          renderCoursePanel(course, en, panel, activeLesson, instructor, progress) +
        '</section>' +
      '</div>' +
    '</div>';
  }

  function renderCourseHeader(course, instructor, progress, en) {
    var cover = course.coverImage
      ? '<div class="lp-course-hero-media"><img src="' + escapeAttr(course.coverImage) + '" alt=""></div>'
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
            '<span class="lp-course-stat-label">' + (isCoursePreview() ? 'Mode' : 'Overall progress') + '</span>' +
            (isCoursePreview()
              ? '<strong>Preview</strong>'
              : ('<div class="lp-course-stat-progress">' +
                  '<div class="lp-progress"><span style="width:' + progress.percent + '%"></span></div>' +
                  '<strong>' + progress.percent + '%</strong>' +
                '</div>')) +
          '</div>' +
          '<div class="lp-course-stat"><span class="lp-course-stat-label">Lessons</span><strong>' +
            (isCoursePreview() ? progress.total : (progress.done + ' / ' + progress.total)) +
          '</strong></div>' +
          '<div class="lp-course-stat"><span class="lp-course-stat-label">Duration</span><strong>' + escapeHtml(courseDurationLabel(course)) + '</strong></div>' +
          '<div class="lp-course-stat"><span class="lp-course-stat-label">Score</span><strong>' +
            (en.score != null ? escapeHtml(String(en.score)) + '%' : '—') +
          '</strong></div>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function renderCourseSideMenu(course, panel, activeLesson, completed, discussCount, privateCount, progress, instructor, examUnlocked, en, examDone) {
    var contentLocked = isEnrollmentContentLocked(en);
    var lessonItems = (course.lessons || []).map(function (l, idx) {
      var done = completed.indexOf(l.id) !== -1;
      var unlocked = isLessonUnlocked(course, en, l.id);
      var active = !contentLocked && panel === 'lesson' && activeLesson && activeLesson.id === l.id;
      if (contentLocked) {
        return '<div class="lp-course-nav-lesson is-locked is-done" aria-disabled="true">' +
          '<span class="lp-course-nav-index">✓</span>' +
          '<span>' + escapeHtml(l.title) + '</span>' +
        '</div>';
      }
      if (!unlocked) {
        return '<div class="lp-course-nav-lesson is-locked" aria-disabled="true" title="Complete previous lessons first">' +
          '<span class="lp-course-nav-index">' + (idx + 1) + '</span>' +
          '<span>' + escapeHtml(l.title) + ' <em>Locked</em></span>' +
        '</div>';
      }
      return '<button type="button" class="lp-course-nav-lesson' + (active ? ' active' : '') + (done ? ' is-done' : '') +
        '" data-lp-lesson="' + escapeHtml(l.id) + '">' +
        '<span class="lp-course-nav-index">' + (done ? '✓' : (idx + 1)) + '</span>' +
        '<span>' + escapeHtml(l.title) + '</span>' +
      '</button>';
    }).join('');
    var left = remainingLessonsCount(course, en);
    var examInProgress = !!(en && en.examStartedAt && !examDone);

    return '<aside class="lp-course-side" aria-label="Course navigation">' +
      '<div class="lp-course-side-brand">' +
        '<p class="lp-course-side-label">Course</p>' +
        '<strong class="lp-course-side-title">' + escapeHtml(course.title) + '</strong>' +
        '<div class="lp-course-side-progress">' +
          '<div class="lp-progress"><span style="width:' + progress.percent + '%"></span></div>' +
          '<span>' + progress.percent + '% complete</span>' +
        '</div>' +
        (contentLocked ? '<p class="lp-course-lock-hint" style="padding:0.55rem 0 0">Completed — learning materials are closed.</p>' : '') +
      '</div>' +
      '<nav class="lp-course-side-nav">' +
        '<button type="button" class="lp-course-nav-link' + (panel === 'overview' ? ' active' : '') + '" data-lp-course-panel="overview">Overview</button>' +
        '<div class="lp-course-nav-group">' +
          (contentLocked
            ? '<button type="button" class="lp-course-nav-link is-locked" data-lp-content-locked title="Lessons are closed after completion">Lessons <em>Closed</em></button>'
            : '<button type="button" class="lp-course-nav-link' + (panel === 'lesson' ? ' active' : '') + '" data-lp-course-panel="lesson">Lessons</button>') +
          '<div class="lp-course-nav-lessons">' + (lessonItems || '<p class="lp-empty">No lessons yet.</p>') + '</div>' +
        '</div>' +
        '<p class="lp-course-side-label lp-course-side-label--spaced">Support</p>' +
        '<button type="button" class="lp-course-nav-link' + (panel === 'discussion' ? ' active' : '') + '" data-lp-course-panel="discussion">' +
          'General discussion' + (discussCount ? ' <em>' + discussCount + '</em>' : '') +
        '</button>' +
        '<button type="button" class="lp-course-nav-link' + (panel === 'private' ? ' active' : '') + '" data-lp-course-panel="private">' +
          'Private with tutor' + (privateCount ? ' <em>' + privateCount + '</em>' : '') +
        '</button>' +
        (course.exam && course.exam.enabled
          ? '<p class="lp-course-side-label lp-course-side-label--spaced">Assessment</p>' +
            (contentLocked
              ? '<button type="button" class="lp-course-nav-link is-locked" data-lp-content-locked title="Exam is closed after completion">Exam <em>Closed</em></button>'
              : (examUnlocked
                  ? '<button type="button" class="lp-course-nav-link' + (panel === 'exam' ? ' active' : '') + '" data-lp-course-panel="exam">Exam' +
                      (examDone ? ' <em>Done</em>' : (examInProgress ? ' <em>In progress</em>' : '')) +
                    '</button>'
                  : '<button type="button" class="lp-course-nav-link is-locked" data-lp-exam-locked title="Finish all lessons to unlock the exam">Exam <em>Locked</em></button>' +
                    '<p class="lp-course-lock-hint">Finish ' + left + ' more lesson' + (left === 1 ? '' : 's') + ' to unlock</p>'))
          : '') +
        '<p class="lp-course-side-label lp-course-side-label--spaced">Instructor</p>' +
        '<div class="lp-course-side-instructor">' +
          '<div class="lp-avatar" aria-hidden="true">' + escapeHtml(initials(instructor.name)) + '</div>' +
          '<div><strong>' + escapeHtml(instructor.name) + '</strong><span>' + escapeHtml(instructor.title) + '</span></div>' +
        '</div>' +
      '</nav>' +
      '<div class="lp-course-side-footer">' +
        (!contentLocked && course.lessons[0]
          ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml((firstAvailableLesson(course, en) || course.lessons[0]).id) + '">' +
              (progress.done ? 'Continue learning' : 'Start learning') + '</button>'
          : '') +
        '<button type="button" class="lp-btn lp-btn-ghost" data-lp-exit-player>← Back to portal</button>' +
      '</div>' +
    '</aside>';
  }

  function renderCoursePanel(course, en, panel, lesson, instructor, progress) {
    if (isCoursePreview() && panel === 'exam') {
      return '<div class="lp-card lp-course-panel">' +
        '<h3>Exam (preview)</h3>' +
        '<p class="lp-muted-line">You are viewing this course as an instructor. Exams are only taken by enrolled learners.</p>' +
        '<p>' + (((course.exam && course.exam.questions) || []).length) + ' question(s) configured' +
          (course.exam && course.exam.timeLimitMinutes ? ' · ' + course.exam.timeLimitMinutes + ' min time limit' : '') +
          (course.exam && course.exam.passScore != null ? ' · Pass score ' + course.exam.passScore + '%' : '') +
        '.</p>' +
        '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="overview">Back to overview</button>' +
      '</div>';
    }
    if (isEnrollmentContentLocked(en) && (panel === 'exam' || panel === 'lesson')) {
      return renderOverviewPanel(course, en, instructor, progress);
    }
    if (panel === 'exam') {
      if (!canAccessExam(course, en)) return renderExamLockedPanel(course, en);
      return renderExamHtml(course, en);
    }
    if (panel === 'discussion') return renderCourseDiscussionPanel(course);
    if (panel === 'private') return renderCoursePrivatePanel(course);
    if (panel === 'lesson') return renderLessonPanel(course, en, lesson);
    return renderOverviewPanel(course, en, instructor, progress);
  }

  function renderExamLockedPanel(course, en) {
    var left = remainingLessonsCount(course, en);
    var next = ((course.lessons || []).filter(function (l) {
      return ((en.completedLessonIds || []).indexOf(l.id) === -1);
    })[0]) || null;
    return '<div class="lp-card lp-course-panel">' +
      '<h3>Exam locked</h3>' +
      '<p class="lp-muted-line">Complete all lessons before taking the exam.</p>' +
      '<p>You still have <strong>' + left + '</strong> lesson' + (left === 1 ? '' : 's') + ' to finish.</p>' +
      (next
        ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml(next.id) + '">Continue: ' + escapeHtml(next.title) + '</button>'
        : '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="lesson">Go to lessons</button>') +
    '</div>';
  }

  function renderCoursePrivatePanel(course) {
    var threads = visiblePrivateThreads().filter(function (t) {
      return !t.courseId || t.courseId === course.id;
    });
    var activeId = discussionState.threadId;
    if (activeId && !threads.some(function (t) { return t.id === activeId; })) activeId = null;
    if (!activeId && threads[0]) activeId = threads[0].id;
    discussionState.threadId = activeId;
    var active = threads.filter(function (t) { return t.id === activeId; })[0] || null;

    if (discussionState.composingPrivate) {
      return '<div class="lp-card lp-course-panel">' +
        '<h3>Message your tutor</h3>' +
        '<p class="lp-muted-line">Private note about <strong>' + escapeHtml(course.title) + '</strong>. Other learners will not see this.</p>' +
        '<form id="lp-private-new" class="lp-form" data-course-id="' + escapeHtml(course.id) + '">' +
          '<input type="hidden" name="courseId" value="' + escapeHtml(course.id) + '">' +
          '<label>Subject<input name="title" required maxlength="120" placeholder="What do you need help with?" value="Help with ' + escapeHtml(course.title) + '"></label>' +
          '<label>Message<textarea name="body" rows="4" required placeholder="Write your private message…"></textarea></label>' +
          '<div class="lp-form-actions">' +
            '<button type="submit" class="lp-btn lp-btn-primary">Send privately</button>' +
            '<button type="button" class="lp-btn lp-btn-ghost" data-lp-discuss-cancel-private>Cancel</button>' +
          '</div>' +
        '</form></div>';
    }

    return '<div class="lp-card lp-course-panel">' +
      '<div class="lp-discuss-sidebar-head" style="margin-bottom:1rem">' +
        '<div><h3 style="margin:0">Private with tutor</h3>' +
        '<p class="lp-muted-line" style="margin:0.35rem 0 0">Only you and tutors can see these messages.</p></div>' +
        '<button type="button" class="lp-btn lp-btn-primary" data-lp-discuss-new-private>New message</button>' +
      '</div>' +
      (threads.length
        ? '<div class="lp-discuss-list" style="margin-bottom:1rem">' + threads.map(function (t) {
            return '<button type="button" class="lp-discuss-item' + (active && active.id === t.id ? ' active' : '') +
              '" data-lp-discuss-thread="' + escapeHtml(t.id) + '">' +
              '<strong>' + escapeHtml(t.title) + '</strong>' +
              '<span>' + escapeHtml(formatWhen(t.updatedAt)) + ' · ' + ((t.messages || []).length) + ' messages</span>' +
            '</button>';
          }).join('') + '</div>'
        : '<p class="lp-empty">No private messages for this course yet.</p>') +
      (active
        ? '<div class="lp-discuss-thread-head"><h3>' + escapeHtml(active.title) + '</h3></div>' +
          renderDiscussionMessages(active) +
          renderMessageComposer(active.id)
        : '') +
    '</div>';
  }

  function renderOverviewPanel(course, en, instructor, progress) {
    var contentLocked = isEnrollmentContentLocked(en);
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
    var examReady = canAccessExam(course, en);
    var cert = contentLocked ? findEnrollmentCertificate(en) : null;

    return '<div class="lp-card lp-course-panel">' +
      '<h3>About this course</h3>' +
      (isCoursePreview()
        ? '<p class="lp-badge lp-badge-accent" style="margin-bottom:0.75rem">Instructor preview — not enrolled</p>'
        : '') +
      '<p class="lp-course-desc">' + escapeHtml(course.description || 'No description provided yet.') + '</p>' +
      (contentLocked
        ? '<div class="lp-exam-result is-pass" style="margin:1rem 0">' +
            '<strong>Course completed</strong>' +
            '<span>Lessons and exams are closed. You can still view this summary' +
              (en.score != null ? ' · Score ' + escapeHtml(String(en.score)) + '%' : '') +
              (en.completedAt ? ' · Completed ' + escapeHtml(String(en.completedAt).slice(0, 10)) : '') +
            '.</span>' +
            (cert
              ? '<div class="lp-form-actions" style="margin-top:0.75rem">' +
                  '<button type="button" class="lp-btn lp-btn-primary" data-lp-cert="' + escapeHtml(cert.id) + '">View certificate</button>' +
                '</div>'
              : '') +
          '</div>'
        : '') +
      '<div class="lp-course-overview-grid">' +
        '<div>' +
          '<h4>Your progress</h4>' +
          '<div class="lp-progress"><span style="width:' + progress.percent + '%"></span></div>' +
          '<p class="lp-muted-line">' + progress.percent + '% complete · ' + progress.done + ' of ' + progress.total + ' lessons · ' + escapeHtml(statusPretty(progress.status)) + '</p>' +
          (!contentLocked && nextLesson && !allLessonsComplete(course, en)
            ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml(nextLesson.id) + '">' +
                (progress.done ? 'Continue: ' : 'Begin: ') + escapeHtml(nextLesson.title) +
              '</button>'
            : '') +
          (!contentLocked && course.exam && course.exam.enabled
            ? (examReady
                ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="exam" style="margin-left:0.5rem">' +
                    (hasUsedExamAttempt(en) ? 'View exam result' : (en.examStartedAt ? 'Resume exam' : 'Go to exam')) +
                  '</button>'
                : '<p class="lp-muted-line">Exam unlocks after all lessons are completed.</p>')
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
          var unlocked = isLessonUnlocked(course, en, l.id);
          if (contentLocked) {
            return '<li class="is-done">' +
              '<div class="lp-course-syllabus-locked">' +
                '<strong>' + (i + 1) + '. ' + escapeHtml(l.title) + '</strong>' +
                '<span>' + escapeHtml(l.durationMinutes ? (l.durationMinutes + ' min') : 'Lesson') + ' · Completed</span>' +
              '</div></li>';
          }
          if (!unlocked) {
            return '<li class="is-locked">' +
              '<div class="lp-course-syllabus-locked">' +
                '<strong>' + (i + 1) + '. ' + escapeHtml(l.title) + '</strong>' +
                '<span>' + escapeHtml(l.durationMinutes ? (l.durationMinutes + ' min') : 'Lesson') + ' · Locked — complete previous lessons</span>' +
              '</div></li>';
          }
          return '<li class="' + (done ? 'is-done' : '') + '">' +
            '<button type="button" data-lp-lesson="' + escapeHtml(l.id) + '">' +
              '<strong>' + (i + 1) + '. ' + escapeHtml(l.title) + '</strong>' +
              '<span>' + escapeHtml(l.durationMinutes ? (l.durationMinutes + ' min') : 'Lesson') + (done ? ' · Completed' : '') + '</span>' +
            '</button></li>';
        }).join('') +
      '</ol>' +
      renderReferenceMaterials(course) +
    '</div>';
  }

  function renderLessonPanel(course, en, lesson) {
    if (!lesson) {
      return '<div class="lp-card lp-course-panel"><p class="lp-empty">No lessons in this course yet.</p></div>';
    }
    if (!isLessonUnlocked(course, en, lesson.id)) {
      var available = firstAvailableLesson(course, en);
      return '<div class="lp-card lp-course-panel">' +
        '<h3>Lesson locked</h3>' +
        '<p class="lp-muted-line">Lessons must be completed in order. Finish the previous lesson before continuing.</p>' +
        (available
          ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml(available.id) + '">Go to: ' + escapeHtml(available.title) + '</button>'
          : '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="overview">Back to overview</button>') +
      '</div>';
    }
    var completed = en.completedLessonIds || [];
    var done = completed.indexOf(lesson.id) !== -1;
    var idx = course.lessons.findIndex(function (l) { return l.id === lesson.id; });
    var prev = idx > 0 ? course.lessons[idx - 1] : null;
    var next = idx >= 0 && idx < course.lessons.length - 1 ? course.lessons[idx + 1] : null;
    var nextUnlocked = !!(next && (isCoursePreview() || done) && isLessonUnlocked(course, en, next.id));
    return '<div class="lp-card lp-course-panel">' +
      '<div class="lp-course-lesson-head">' +
        '<p class="lp-muted-line">Lesson ' + (idx + 1) + ' of ' + course.lessons.length +
          (isCoursePreview() ? ' · Instructor preview' : (done ? ' · Completed' : ' · Complete in order')) + '</p>' +
        '<h3>' + escapeHtml(lesson.title) + '</h3>' +
      '</div>' +
      mediaHtml(lesson) +
      '<div class="lp-lesson-body is-protected" oncontextmenu="return false" oncopy="return false" oncut="return false">' +
        formatContent(lesson.content) +
      '</div>' +
      '<div class="lp-form-actions">' +
        (prev && isLessonUnlocked(course, en, prev.id)
          ? '<button type="button" class="lp-btn lp-btn-ghost" data-lp-lesson="' + escapeHtml(prev.id) + '">← Previous</button>'
          : '') +
        (isCoursePreview()
          ? (next
              ? '<button type="button" class="lp-btn lp-btn-primary" data-lp-lesson="' + escapeHtml(next.id) + '">Next lesson →</button>'
              : '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="overview">Back to overview</button>')
          : '<button type="button" class="lp-btn lp-btn-primary" data-lp-complete-lesson="' + escapeHtml(lesson.id) + '">' +
              (done ? 'Completed · Continue' : 'Mark complete &amp; continue') +
            '</button>') +
        (!isCoursePreview() && nextUnlocked
          ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-lesson="' + escapeHtml(next.id) + '">Next →</button>'
          : (!isCoursePreview() && next && !done
              ? '<p class="lp-muted-line">Mark this lesson complete to unlock the next one.</p>'
              : '')) +
        (!isCoursePreview() && !next && course.exam && course.exam.enabled && canAccessExam(course, en)
          ? '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="exam">Take exam</button>'
          : (!isCoursePreview() && !next && course.exam && course.exam.enabled
              ? '<p class="lp-muted-line">Finish every lesson to unlock the exam.</p>'
              : '')) +
      '</div>' +
      renderReferenceMaterials(course) +
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

  function renderExamResultPanel(course, enrollment) {
    var passed = enrollment.passed === true;
    return '<div class="lp-card lp-course-panel lp-exam-cover">' +
      '<p class="lp-exam-kicker">Assessment complete</p>' +
      '<h3>Exam result</h3>' +
      '<p class="lp-muted-line">This exam allows only one attempt. Your result is final.</p>' +
      '<div class="lp-exam-result ' + (passed ? 'is-pass' : 'is-fail') + '">' +
        '<strong>' + (passed ? 'Passed' : 'Not passed') + '</strong>' +
        '<span>Score: ' + escapeHtml(String(enrollment.score != null ? enrollment.score : '—')) + '%' +
          ' · Required: ' + escapeHtml(String((course.exam && course.exam.passScore) || 70)) + '%</span>' +
      '</div>' +
      '<div class="lp-form-actions">' +
        '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="overview">Back to overview</button>' +
      '</div></div>';
  }

  function renderExamCoverPanel(course, enrollment) {
    var mins = examTimeLimitMinutes(course);
    var passScore = (course.exam && course.exam.passScore) || 70;
    var qCount = ((course.exam && course.exam.questions) || []).length;
    return '<div class="lp-card lp-course-panel lp-exam-cover">' +
      '<p class="lp-exam-kicker">Ready when you are</p>' +
      '<h3>Exam: ' + escapeHtml(course.title) + '</h3>' +
      '<p class="lp-muted-line">Read the instructions carefully before you begin. You can continue studying instead if you are not ready.</p>' +
      '<ul class="lp-exam-instructions">' +
        '<li>You have <strong>one attempt only</strong>. Once you start, you cannot retake this exam.</li>' +
        '<li>Pass score: <strong>' + escapeHtml(String(passScore)) + '%</strong></li>' +
        '<li>Questions: <strong>' + qCount + '</strong></li>' +
        '<li>Time limit: <strong>' + (mins ? (mins + ' minute' + (mins === 1 ? '' : 's')) : 'No time limit set') + '</strong>' +
          (mins ? '. A countdown starts when you click Start Exam.' : '') + '</li>' +
        '<li>When time runs out, your answers are submitted automatically.</li>' +
        '<li>Make sure you have a stable connection and enough uninterrupted time.</li>' +
      '</ul>' +
      '<div class="lp-form-actions lp-exam-cover-actions">' +
        '<button type="button" class="lp-btn lp-btn-primary" data-lp-begin-exam>Start Exam</button>' +
        '<button type="button" class="lp-btn lp-btn-secondary" data-lp-course-panel="overview">Continue study</button>' +
      '</div></div>';
  }

  function renderExamHtml(course, enrollment) {
    if (hasUsedExamAttempt(enrollment)) {
      return renderExamResultPanel(course, enrollment);
    }
    if (!enrollment.examStartedAt) {
      return renderExamCoverPanel(course, enrollment);
    }

    var questions = ((course.exam && course.exam.questions) || []).slice();
    var mins = examTimeLimitMinutes(course);
    var endsAt = examEndsAtMs(course, enrollment);
    var remaining = endsAt != null ? Math.max(0, endsAt - Date.now()) : null;

    return '<div class="lp-card lp-course-panel">' +
      '<div class="lp-exam-live-head">' +
        '<div>' +
          '<h3>Exam: ' + escapeHtml(course.title) + '</h3>' +
          '<p class="lp-muted-line">Pass score: ' + escapeHtml(String((course.exam && course.exam.passScore) || 70)) + '%' +
            ' · One attempt · Answer all questions, then submit</p>' +
        '</div>' +
        (mins && endsAt != null
          ? '<div class="lp-exam-timer" id="lp-exam-timer" data-ends-at="' + endsAt + '" role="timer" aria-live="polite">' +
              '<span class="lp-exam-timer-label">Time left</span>' +
              '<strong id="lp-exam-timer-value">' + formatCountdown(remaining) + '</strong>' +
            '</div>'
          : '<div class="lp-exam-timer lp-exam-timer--open"><span class="lp-exam-timer-label">Time limit</span><strong>None</strong></div>') +
      '</div>' +
      '<form id="lp-exam-form">' +
        questions.map(function (q, qi) {
          return '<div class="lp-exam-q"><p><strong>Q' + (qi + 1) + '.</strong> ' + escapeHtml(q.prompt) + '</p>' +
            (q.image
              ? '<div class="lp-question-image"><img src="' + escapeHtml(q.image) + '" alt="Question image"></div>'
              : '') +
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

  function collectExamAnswers(form, course) {
    var answers = {};
    ((course.exam && course.exam.questions) || []).forEach(function (q) {
      if (!form) {
        answers[q.id] = [];
        return;
      }
      var nodes = form.querySelectorAll('[name="q_' + q.id + '"]:checked');
      answers[q.id] = Array.prototype.map.call(nodes, function (n) { return n.value; });
    });
    return answers;
  }

  function isExamExpiredPending(course, en) {
    if (!en || !course || hasUsedExamAttempt(en) || !en.examStartedAt) return false;
    var ends = examEndsAtMs(course, en);
    return ends != null && Date.now() >= ends;
  }

  function finishExamAttempt(course, en, answers, autoExpired) {
    if (!course || !en || examSubmitLock) return;
    if (hasUsedExamAttempt(en)) {
      playerState.panel = isEnrollmentContentLocked(en) ? 'overview' : 'exam';
      return;
    }
    examSubmitLock = true;
    clearExamTimer();
    var result = scoreAttempt(course, answers || {});
    var data = getData();
    data.attempts = data.attempts || [];
    data.attempts.push({
      id: 'att' + Date.now().toString(36),
      enrollmentId: en.id,
      courseId: course.id,
      userId: en.userId,
      answers: answers || {},
      score: result.percent,
      passed: result.passed,
      autoExpired: !!autoExpired,
      startedAt: en.examStartedAt || new Date().toISOString(),
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
    examSubmitLock = false;
    alert(autoExpired
      ? ('Time is up. Your exam was submitted automatically. Score: ' + result.percent + '%.' +
          (result.passed ? ' Passed.' : ' Required ' + result.passScore + '%.'))
      : (result.passed
          ? ('Passed with ' + result.percent + '%')
          : ('Score ' + result.percent + '%. Required ' + result.passScore + '%.')));
    playerState.mode = 'course';
    playerState.panel = result.passed ? 'overview' : 'exam';
    render();
  }

  function beginExamAttempt() {
    if (isCoursePreview()) {
      alert('Exams are for enrolled learners. You are previewing as an instructor.');
      return;
    }
    var en = findEnrollment(playerState.enrollmentId);
    var course = en ? findCourse(en.courseId) : null;
    if (!course || !en) return;
    if (isEnrollmentContentLocked(en)) {
      alert('This course is completed. The exam is no longer available.');
      playerState.panel = 'overview';
      render();
      return;
    }
    if (!canAccessExam(course, en)) {
      alert('Finish all lessons before taking the exam.');
      playerState.panel = 'overview';
      render();
      return;
    }
    if (hasUsedExamAttempt(en)) {
      playerState.panel = 'exam';
      render();
      return;
    }
    if (en.examStartedAt) {
      playerState.panel = 'exam';
      render();
      return;
    }
    var mins = examTimeLimitMinutes(course);
    var confirmMsg = 'You have only one attempt' +
      (mins ? ' and ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' on the clock' : '') +
      '. Start the exam now?';
    if (!window.confirm(confirmMsg)) return;
    var data = getData();
    var target = data.enrollments.filter(function (x) { return x.id === en.id; })[0];
    if (!target) return;
    target.examStartedAt = new Date().toISOString();
    if (target.status === 'enrolled') target.status = 'in_progress';
    saveData(data);
    playerState.panel = 'exam';
    render();
  }

  function setupExamTimerIfNeeded() {
    var timer = document.getElementById('lp-exam-timer');
    var valueEl = document.getElementById('lp-exam-timer-value');
    if (!timer || !valueEl) return;
    var endsAt = Number(timer.getAttribute('data-ends-at'));
    if (!endsAt) return;

    function tick() {
      var left = endsAt - Date.now();
      valueEl.textContent = formatCountdown(left);
      timer.classList.toggle('is-urgent', left <= 60 * 1000);
      if (left <= 0) {
        clearExamTimer();
        var form = document.getElementById('lp-exam-form');
        var en = findEnrollment(playerState.enrollmentId);
        var course = en ? findCourse(en.courseId) : null;
        if (!course || !en) return;
        finishExamAttempt(course, en, collectExamAnswers(form, course), true);
      }
    }

    tick();
    examTimerHandle = setInterval(tick, 1000);
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

  function computePortalCertificateExpiry(issuedAt, validMonths) {
    var months = Math.max(0, Number(validMonths) || 0);
    if (!months || !issuedAt) return '';
    var d = new Date(issuedAt);
    if (isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
  }

  function maybeIssueCertificate(data, enrollment, course) {
    if (!data.settings || data.settings.autoIssueCertificates === false) return;
    var exists = (data.certificates || []).some(function (c) {
      return c.enrollmentId === enrollment.id || (c.userId === enrollment.userId && c.courseId === course.id);
    });
    if (exists) return;
    var issuedAt = new Date().toISOString();
    data.certificates = data.certificates || [];
    data.certificates.push({
      id: 'cert' + Date.now().toString(36),
      userId: enrollment.userId,
      userName: enrollment.userName,
      courseId: course.id,
      courseTitle: course.title,
      enrollmentId: enrollment.id,
      issuedAt: issuedAt,
      expiresAt: computePortalCertificateExpiry(issuedAt, course.certificateValidMonths),
      validMonths: Math.max(0, Number(course.certificateValidMonths) || 0),
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
    screen.addEventListener('change', onChange);
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

  function onChange(e) {
    var t = e.target;
    if (!t) return;
    if (t.matches && t.matches('[data-lp-lesson-type]')) {
      syncPortalCourseDraft();
      var block = t.closest('[data-lp-lesson-block]');
      if (block && courseEditor.draft && Array.isArray(courseEditor.draft.lessons)) {
        var idx = Array.prototype.indexOf.call(
          document.querySelectorAll('#lp-course-form [data-lp-lesson-block]'),
          block
        );
        var lesson = courseEditor.draft.lessons[idx];
        if (lesson && lesson.contentType === 'slideshow') {
          lesson.slides = Array.isArray(lesson.slides) ? lesson.slides : [];
          if (!lesson.slides.length) {
            lesson.slides.push({
              id: newId('sld'),
              title: 'Slide 1',
              kind: 'video',
              mediaUrl: '',
              notes: ''
            });
          }
        }
      }
      render();
    }
  }

  function onClick(e) {
    var t = e.target.closest('[data-lp-view],[data-lp-open-enroll],[data-lp-enroll],[data-lp-preview-course],[data-lp-lesson],[data-lp-complete-lesson],[data-lp-start-exam],[data-lp-begin-exam],[data-lp-exit-player],[data-lp-back-player],[data-lp-cert],[data-lp-course-panel],[data-lp-exam-locked],[data-lp-content-locked],[data-lp-discuss-tab],[data-lp-discuss-course],[data-lp-discuss-thread],[data-lp-discuss-new-private],[data-lp-discuss-cancel-private],[data-lp-create-course],[data-lp-edit-course],[data-lp-delete-course],[data-lp-cancel-course-editor],[data-lp-add-lesson],[data-lp-remove-lesson],[data-lp-add-slide],[data-lp-remove-slide],[data-lp-add-reference],[data-lp-remove-reference],[data-lp-slide-prev],[data-lp-slide-next],[data-lp-add-question],[data-lp-remove-question],[data-lp-add-option],[data-lp-clear-cover],[data-lp-clear-signature]');
    if (!t) return;
    if (t.hasAttribute('data-lp-view')) {
      view = t.getAttribute('data-lp-view');
      playerState.mode = 'list';
      playerState.panel = 'overview';
      if (view !== 'courses') closeCourseEditor();
      if (view === 'discussions') discussionState.composingPrivate = false;
      render();
      return;
    }
    if (t.hasAttribute('data-lp-create-course')) {
      openCourseEditor(null);
      return;
    }
    if (t.hasAttribute('data-lp-edit-course')) {
      openCourseEditor(t.getAttribute('data-lp-edit-course'));
      return;
    }
    if (t.hasAttribute('data-lp-delete-course')) {
      var delId = t.getAttribute('data-lp-delete-course');
      var delCourse = findCourse(delId);
      if (!delCourse || !canManageCourse(delCourse)) {
        alert('You can only delete courses you created.');
        return;
      }
      if (!window.confirm('Delete “' + delCourse.title + '”? This cannot be undone.')) return;
      var dataDel = getData();
      dataDel.courses = dataDel.courses.filter(function (c) { return c.id !== delId; });
      saveData(dataDel);
      render();
      return;
    }
    if (t.hasAttribute('data-lp-cancel-course-editor')) {
      closeCourseEditor();
      view = 'courses';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-clear-cover')) {
      if (!courseEditor.draft) return;
      courseEditor.draft.coverImage = '';
      courseEditor.coverCleared = true;
      var coverInput = document.getElementById('lp-cover-image-input');
      if (coverInput) coverInput.value = '';
      var preview = document.querySelector('.lp-cover-preview');
      if (preview) {
        preview.className = 'lp-cover-preview';
        preview.innerHTML = '<span>No photo yet</span>';
      }
      return;
    }
    if (t.hasAttribute('data-lp-clear-signature')) {
      var sigForm = document.getElementById('lp-instructor-profile-form');
      var sigHidden = document.getElementById('lp-signature-value');
      var sigFile = document.getElementById('lp-signature-file');
      var sigPreview = document.getElementById('lp-signature-preview');
      if (sigHidden) sigHidden.value = '';
      if (sigFile) sigFile.value = '';
      if (sigForm) sigForm.setAttribute('data-signature-cleared', '1');
      if (sigPreview) {
        sigPreview.className = 'lp-signature-preview';
        sigPreview.innerHTML = '<span>No signature uploaded yet</span>';
      }
      return;
    }
    if (t.hasAttribute('data-lp-add-lesson')) {
      syncPortalCourseDraft();
      courseEditor.draft.lessons = courseEditor.draft.lessons || [];
      courseEditor.draft.lessons.push({
        id: newId('lsn'),
        title: 'New lesson',
        content: '',
        contentType: 'text',
        mediaUrl: '',
        slides: [],
        order: courseEditor.draft.lessons.length,
        durationMinutes: 0
      });
      render();
      return;
    }
    if (t.hasAttribute('data-lp-add-reference')) {
      syncPortalCourseDraft();
      courseEditor.draft.referenceMaterials = courseEditor.draft.referenceMaterials || [];
      courseEditor.draft.referenceMaterials.push({
        id: newId('ref'),
        title: 'Reference ' + (courseEditor.draft.referenceMaterials.length + 1),
        url: '',
        kind: 'file'
      });
      render();
      return;
    }
    if (t.hasAttribute('data-lp-remove-reference')) {
      syncPortalCourseDraft();
      var rmRefIdx = Number(t.getAttribute('data-lp-remove-reference'));
      if (courseEditor.draft && Array.isArray(courseEditor.draft.referenceMaterials)) {
        courseEditor.draft.referenceMaterials.splice(rmRefIdx, 1);
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-add-slide')) {
      syncPortalCourseDraft();
      var addSlideLessonIdx = Number(t.getAttribute('data-lp-add-slide'));
      var addSlideLesson = courseEditor.draft && courseEditor.draft.lessons
        ? courseEditor.draft.lessons[addSlideLessonIdx]
        : null;
      if (!addSlideLesson) return;
      addSlideLesson.contentType = 'slideshow';
      addSlideLesson.slides = Array.isArray(addSlideLesson.slides) ? addSlideLesson.slides : [];
      addSlideLesson.slides.push({
        id: newId('sld'),
        title: 'Slide ' + (addSlideLesson.slides.length + 1),
        kind: 'video',
        mediaUrl: '',
        notes: ''
      });
      render();
      return;
    }
    if (t.hasAttribute('data-lp-remove-slide')) {
      syncPortalCourseDraft();
      var slideParts = String(t.getAttribute('data-lp-remove-slide') || '').split(':');
      var rmSlideLessonIdx = Number(slideParts[0]);
      var rmSlideIdx = Number(slideParts[1]);
      var rmSlideLesson = courseEditor.draft && courseEditor.draft.lessons
        ? courseEditor.draft.lessons[rmSlideLessonIdx]
        : null;
      if (!rmSlideLesson || !Array.isArray(rmSlideLesson.slides)) return;
      rmSlideLesson.slides.splice(rmSlideIdx, 1);
      render();
      return;
    }
    if (t.hasAttribute('data-lp-slide-prev') || t.hasAttribute('data-lp-slide-next')) {
      var enForSlides = findEnrollment(playerState.enrollmentId);
      var courseForSlides = enForSlides ? findCourse(enForSlides.courseId) : null;
      var lessonForSlides = courseForSlides
        ? courseForSlides.lessons.filter(function (l) { return l.id === playerState.lessonId; })[0]
        : null;
      var totalSlides = lessonForSlides && Array.isArray(lessonForSlides.slides) ? lessonForSlides.slides.length : 0;
      if (totalSlides) {
        var curSlide = Number(playerState.slideIndex) || 0;
        playerState.slideIndex = t.hasAttribute('data-lp-slide-next')
          ? Math.min(totalSlides - 1, curSlide + 1)
          : Math.max(0, curSlide - 1);
      }
      playerState.mode = 'course';
      playerState.panel = 'lesson';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-remove-lesson')) {
      syncPortalCourseDraft();
      var li = Number(t.getAttribute('data-lp-remove-lesson'));
      if (courseEditor.draft && courseEditor.draft.lessons) {
        courseEditor.draft.lessons.splice(li, 1);
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-add-question')) {
      syncPortalCourseDraft();
      courseEditor.draft.exam = courseEditor.draft.exam || { enabled: true, questions: [], passScore: 70, timeLimitMinutes: 0, shuffle: false };
      courseEditor.draft.exam.enabled = true;
      courseEditor.draft.exam.questions = courseEditor.draft.exam.questions || [];
      courseEditor.draft.exam.questions.push({
        id: newId('q'),
        prompt: '',
        image: '',
        type: 'single',
        points: 1,
        options: [{ id: newId('opt'), text: 'Option A' }, { id: newId('opt'), text: 'Option B' }],
        correctOptionIds: []
      });
      render();
      return;
    }
    if (t.hasAttribute('data-lp-remove-question')) {
      syncPortalCourseDraft();
      var qi = Number(t.getAttribute('data-lp-remove-question'));
      if (courseEditor.draft && courseEditor.draft.exam && courseEditor.draft.exam.questions) {
        courseEditor.draft.exam.questions.splice(qi, 1);
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-add-option')) {
      syncPortalCourseDraft();
      var qIdx = Number(t.getAttribute('data-lp-add-option'));
      var qList = courseEditor.draft && courseEditor.draft.exam && courseEditor.draft.exam.questions;
      if (qList && qList[qIdx]) {
        qList[qIdx].options = qList[qIdx].options || [];
        qList[qIdx].options.push({ id: newId('opt'), text: '' });
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-begin-exam')) {
      if (isCoursePreview()) {
        alert('Exams are for enrolled learners. You are previewing as an instructor.');
        return;
      }
      beginExamAttempt();
      return;
    }
    if (t.hasAttribute('data-lp-content-locked')) {
      alert('This course is completed. Lessons and exams are no longer available.');
      return;
    }
    if (t.hasAttribute('data-lp-exam-locked')) {
      alert('Finish all lessons before taking the exam.');
      return;
    }
    if (t.hasAttribute('data-lp-course-panel')) {
      var panel = t.getAttribute('data-lp-course-panel');
      var enPanel = isCoursePreview()
        ? previewEnrollmentStub(findCourse(playerState.previewCourseId))
        : findEnrollment(playerState.enrollmentId);
      var coursePanel = isCoursePreview()
        ? findCourse(playerState.previewCourseId)
        : (enPanel ? findCourse(enPanel.courseId) : null);
      if (enPanel && !isCoursePreview() && isEnrollmentContentLocked(enPanel) && (panel === 'exam' || panel === 'lesson')) {
        alert('This course is completed. Lessons and exams are no longer available.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      if (panel === 'exam' && !isCoursePreview() && coursePanel && enPanel && !canAccessExam(coursePanel, enPanel)) {
        alert('Finish all lessons before taking the exam.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      playerState.mode = 'course';
      playerState.panel = panel || 'overview';
      discussionState.composingPrivate = false;
      if (panel === 'lesson') {
        if (coursePanel && enPanel) {
          if (!playerState.lessonId || !isLessonUnlocked(coursePanel, enPanel, playerState.lessonId)) {
            var openLesson = firstAvailableLesson(coursePanel, enPanel);
            playerState.lessonId = openLesson ? openLesson.id : null;
          }
        } else if (coursePanel && coursePanel.lessons[0] && !playerState.lessonId) {
          playerState.lessonId = coursePanel.lessons[0].id;
        }
      }
      if (panel === 'private') {
        discussionState.tab = 'private';
        if (enPanel) discussionState.courseId = enPanel.courseId;
      }
      if (panel === 'discussion') {
        if (enPanel) discussionState.courseId = enPanel.courseId;
      }
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
      if (isCourseFocus()) {
        playerState.mode = 'course';
        playerState.panel = 'private';
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-new-private')) {
      discussionState.tab = 'private';
      discussionState.composingPrivate = true;
      if (isCourseFocus()) {
        playerState.mode = 'course';
        playerState.panel = 'private';
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-discuss-cancel-private')) {
      discussionState.composingPrivate = false;
      if (isCourseFocus()) {
        playerState.mode = 'course';
        playerState.panel = 'private';
      }
      render();
      return;
    }
    if (t.hasAttribute('data-lp-open-enroll')) {
      playerState.previewCourseId = null;
      playerState.enrollmentId = t.getAttribute('data-lp-open-enroll');
      playerState.lessonId = null;
      playerState.slideIndex = 0;
      playerState.mode = 'course';
      playerState.panel = 'overview';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-preview-course')) {
      openCoursePreview(t.getAttribute('data-lp-preview-course'));
      return;
    }
    if (t.hasAttribute('data-lp-enroll')) {
      var courseIdEnroll = t.getAttribute('data-lp-enroll');
      if (isInstructor()) {
        openCoursePreview(courseIdEnroll);
        return;
      }
      var en = ensureEnrollment(courseIdEnroll);
      if (en) {
        playerState.previewCourseId = null;
        playerState.enrollmentId = en.id;
        playerState.lessonId = null;
        playerState.slideIndex = 0;
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
      }
      return;
    }
    if (t.hasAttribute('data-lp-lesson')) {
      var enLesson = isCoursePreview() ? previewEnrollmentStub(findCourse(playerState.previewCourseId)) : findEnrollment(playerState.enrollmentId);
      var courseLesson = isCoursePreview()
        ? findCourse(playerState.previewCourseId)
        : (enLesson ? findCourse(enLesson.courseId) : null);
      var targetLessonId = t.getAttribute('data-lp-lesson');
      if (enLesson && !isCoursePreview() && isEnrollmentContentLocked(enLesson)) {
        alert('This course is completed. Lessons are no longer available.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      if (courseLesson && enLesson && !isLessonUnlocked(courseLesson, enLesson, targetLessonId)) {
        alert('Lessons must be completed in order. Finish the previous lesson first.');
        var nextOpen = firstAvailableLesson(courseLesson, enLesson);
        playerState.lessonId = nextOpen ? nextOpen.id : null;
        playerState.mode = 'course';
        playerState.panel = nextOpen ? 'lesson' : 'overview';
        render();
        return;
      }
      playerState.lessonId = targetLessonId;
      playerState.slideIndex = 0;
      playerState.mode = 'course';
      playerState.panel = 'lesson';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-complete-lesson')) {
      if (isCoursePreview()) return;
      completeLesson(t.getAttribute('data-lp-complete-lesson'));
      return;
    }
    if (t.hasAttribute('data-lp-start-exam')) {
      if (isCoursePreview()) {
        alert('Exams are for enrolled learners. You are previewing as an instructor.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      var enExam = findEnrollment(playerState.enrollmentId);
      var courseExam = enExam ? findCourse(enExam.courseId) : null;
      if (enExam && isEnrollmentContentLocked(enExam)) {
        alert('This course is completed. The exam is no longer available.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      if (!courseExam || !enExam || !canAccessExam(courseExam, enExam)) {
        alert('Finish all lessons before taking the exam.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      playerState.mode = 'course';
      playerState.panel = 'exam';
      render();
      return;
    }
    if (t.hasAttribute('data-lp-exit-player')) {
      clearCoursePlayerState();
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
      var certId = t.getAttribute('data-lp-cert');
      if (window.LmsModule && typeof window.LmsModule.printCertificate === 'function') {
        window.LmsModule.printCertificate(certId);
        return;
      }
      var data = getData();
      var cert = (data.certificates || []).filter(function (c) { return c.id === certId; })[0];
      if (!cert) return;
      alert('Certificate: ' + cert.courseTitle + ' / ' + cert.certificateNo);
    }
  }

  function completeLesson(lessonId) {
    if (isCoursePreview()) return;
    var data = getData();
    var en = data.enrollments.filter(function (e) { return e.id === playerState.enrollmentId; })[0];
    var course = en ? data.courses.filter(function (c) { return c.id === en.courseId; })[0] : null;
    if (!en || !course) return;
    if (isEnrollmentContentLocked(en)) {
      alert('This course is completed. Lessons are no longer available.');
      playerState.panel = 'overview';
      playerState.mode = 'course';
      render();
      return;
    }
    if (!isLessonUnlocked(course, en, lessonId)) {
      alert('Lessons must be completed in order. Finish the previous lesson first.');
      var openLesson = firstAvailableLesson(course, en);
      playerState.lessonId = openLesson ? openLesson.id : null;
      playerState.panel = openLesson ? 'lesson' : 'overview';
      playerState.mode = 'course';
      render();
      return;
    }
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
    if (isEnrollmentContentLocked(en)) {
      playerState.lessonId = null;
      playerState.panel = 'overview';
      playerState.mode = 'course';
      render();
      return;
    }
    var idx = course.lessons.findIndex(function (l) { return l.id === lessonId; });
    if (idx >= 0 && idx < course.lessons.length - 1) {
      playerState.lessonId = course.lessons[idx + 1].id;
      playerState.slideIndex = 0;
      playerState.panel = 'lesson';
    } else if (course.exam && course.exam.enabled && canAccessExam(course, en)) {
      playerState.panel = 'exam';
    } else {
      playerState.panel = 'overview';
    }
    playerState.mode = 'course';
    render();
  }

  function onSubmit(e) {
    if (e.target && e.target.id === 'lp-instructor-profile-form') {
      e.preventDefault();
      if (!isInstructor()) return;
      var fdProf = new FormData(e.target);
      var patch = {
        title: String(fdProf.get('title') || '').trim() || 'Course Instructor',
        department: String(fdProf.get('department') || '').trim(),
        notes: String(fdProf.get('notes') || '').trim()
      };
      var uploadedSig = String(fdProf.get('signatureImage') || '').trim();
      var clearedSig = e.target.getAttribute('data-signature-cleared') === '1';
      var currentSig = e.target.getAttribute('data-signature-current') || '';
      if (uploadedSig) patch.signatureImage = uploadedSig;
      else if (clearedSig) patch.signatureImage = '';
      else patch.signatureImage = currentSig;
      upsertPortalProfile(patch);
      alert('Instructor profile saved. Your signature will appear on certificates for courses you create.');
      render();
      return;
    }
    if (e.target && e.target.id === 'lp-course-form') {
      e.preventDefault();
      savePortalCourse();
      return;
    }
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
      if (isCourseFocus() || playerState.mode === 'course') {
        playerState.mode = 'course';
        playerState.panel = 'private';
      }
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
      if (!course || !en) return;
      if (!canAccessExam(course, en)) {
        alert('Finish all lessons before taking the exam.');
        playerState.mode = 'course';
        playerState.panel = 'overview';
        render();
        return;
      }
      if (hasUsedExamAttempt(en)) {
        alert('You have already used your one exam attempt.');
        playerState.panel = 'exam';
        render();
        return;
      }
      if (!en.examStartedAt) {
        playerState.panel = 'exam';
        render();
        return;
      }
      if (!window.confirm('Submit your exam now? You only get one attempt.')) return;
      finishExamAttempt(course, en, collectExamAnswers(e.target, course), false);
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
