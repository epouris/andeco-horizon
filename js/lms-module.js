/**
 * Learning Management System (LMS)
 * Employee training, inductions, procedures, exams,
 * public course purchases, and hiring applicant exams.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'andeco_lms_data';

  var COURSE_TYPES = {
    course: 'Training course',
    induction: 'Induction',
    procedure: 'Procedure training',
    exam: 'Exam only'
  };

  var AUDIENCES = {
    employee: 'Employees only',
    public: 'Public (for sale)',
    applicant: 'Hiring applicants',
    all: 'Employees + public'
  };

  var CONTENT_TYPES = {
    text: 'Text / procedure',
    video: 'Video URL',
    link: 'Web link',
    document: 'Document link'
  };

  var LEARNER_ROLES = {
    learner: 'Learner',
    instructor: 'Instructor'
  };

  var defaultSettings = {
    companyLmsName: 'Andeco Learning',
    publicCatalogEnabled: true,
    careersPortalEnabled: true,
    currency: 'EUR',
    purchaseInstructions: 'Complete the form to request this course. Our team will contact you with payment and access details.',
    careersIntro: 'Apply for a role by completing the required assessment. Enter the access code provided by HR to begin.',
    certificateTitle: 'Certificate of Completion',
    certificateSigner: 'Training Manager',
    autoIssueCertificates: true,
    companyLogo: ''
  };

  var currentSection = 'dashboard';
  var viewState = {
    mode: 'list', // list | editor | player | exam
    courseId: null,
    draftCourse: null, // in-memory unsaved training editor state
    coverImageCleared: false,
    lessonId: null,
    enrollmentId: null,
    attemptId: null,
    publicCourseId: null,
    applicantId: null,
    examLive: false // applicant / session flag after Start Exam
  };
  var examTimerHandle = null;
  var examSubmitLock = false;

  function isCourseEditorOpen() {
    return viewState.mode === 'editor' && !!document.getElementById('lms-course-form');
  }

  function isInteractiveLmsFormOpen() {
    if (isCourseEditorOpen()) return true;
    if (viewState.mode === 'exam' && document.getElementById('lms-exam-form')) return true;
    if (currentSection === 'settings' && document.getElementById('lms-settings-form')) return true;
    if (currentSection === 'hiring' && document.getElementById('lms-applicant-form')) return true;
    if (currentSection === 'learners' && (document.getElementById('lms-assign-form') || document.getElementById('lms-profile-form'))) return true;
    if (currentSection === 'announcements' && document.getElementById('lms-announce-form')) return true;
    return false;
  }

  function syncDraftFromEditor() {
    if (!isCourseEditorOpen()) return viewState.draftCourse;
    try {
      var collected = collectEditorCourse();
      if (collected) viewState.draftCourse = collected;
    } catch (e) {}
    return viewState.draftCourse;
  }

  function clearEditorDraft() {
    viewState.draftCourse = null;
    viewState.coverImageCleared = false;
  }

  function id(prefix) {
    return (prefix || 'lms') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function persistAllIfFile() {
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e) {}
  }

  function emptyData() {
    return {
      courses: [],
      enrollments: [],
      attempts: [],
      purchases: [],
      applicants: [],
      announcements: [],
      certificates: [],
      learnerProfiles: [],
      discussions: [],
      settings: Object.assign({}, defaultSettings)
    };
  }

  function normalizeMessage(m) {
    m = m && typeof m === 'object' ? m : {};
    return {
      id: m.id || id('msg'),
      authorId: m.authorId || '',
      authorName: m.authorName || 'User',
      authorRole: m.authorRole === 'instructor' ? 'instructor' : 'learner',
      body: m.body || '',
      createdAt: m.createdAt || new Date().toISOString()
    };
  }

  function normalizeDiscussion(d) {
    d = d && typeof d === 'object' ? d : {};
    var kind = d.kind === 'private' ? 'private' : 'course';
    return {
      id: d.id || id('dsc'),
      kind: kind,
      courseId: d.courseId || '',
      learnerId: d.learnerId || '',
      learnerName: d.learnerName || '',
      title: d.title || (kind === 'private' ? 'Private discussion' : 'Course discussion'),
      createdAt: d.createdAt || new Date().toISOString(),
      updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
      createdBy: d.createdBy || '',
      createdByName: d.createdByName || '',
      messages: Array.isArray(d.messages) ? d.messages.map(normalizeMessage) : []
    };
  }

  function normalizeData(d) {
    d = d && typeof d === 'object' ? d : {};
    return {
      courses: Array.isArray(d.courses) ? d.courses.map(normalizeCourse) : [],
      enrollments: Array.isArray(d.enrollments) ? d.enrollments : [],
      attempts: Array.isArray(d.attempts) ? d.attempts : [],
      purchases: Array.isArray(d.purchases) ? d.purchases : [],
      applicants: Array.isArray(d.applicants) ? d.applicants : [],
      announcements: Array.isArray(d.announcements) ? d.announcements : [],
      certificates: Array.isArray(d.certificates) ? d.certificates : [],
      learnerProfiles: Array.isArray(d.learnerProfiles) ? d.learnerProfiles : [],
      discussions: Array.isArray(d.discussions) ? d.discussions.map(normalizeDiscussion) : [],
      settings: Object.assign({}, defaultSettings, d.settings && typeof d.settings === 'object' ? d.settings : {})
    };
  }

  function normalizeCourse(c) {
    c = c && typeof c === 'object' ? c : {};
    var exam = c.exam && typeof c.exam === 'object' ? c.exam : {};
    return {
      id: c.id || id('crs'),
      title: c.title || 'Untitled',
      description: c.description || '',
      coverImage: c.coverImage || '',
      instructorName: c.instructorName || '',
      instructorTitle: c.instructorTitle || '',
      instructorBio: c.instructorBio || '',
      type: COURSE_TYPES[c.type] ? c.type : 'course',
      category: c.category || 'General',
      audience: AUDIENCES[c.audience] ? c.audience : 'employee',
      price: Number(c.price) || 0,
      currency: c.currency || 'EUR',
      published: c.published !== false,
      durationMinutes: Number(c.durationMinutes) || 0,
      passScore: Number(c.passScore) || 70,
      certificateValidMonths: Math.max(0, Number(c.certificateValidMonths) || 0),
      lessons: Array.isArray(c.lessons) ? c.lessons.map(function (l, i) {
        return {
          id: l.id || id('lsn'),
          title: l.title || ('Lesson ' + (i + 1)),
          content: l.content || '',
          contentType: CONTENT_TYPES[l.contentType] ? l.contentType : 'text',
          mediaUrl: l.mediaUrl || '',
          order: l.order != null ? Number(l.order) : i,
          durationMinutes: Number(l.durationMinutes) || 0
        };
      }).sort(function (a, b) { return a.order - b.order; }) : [],
      exam: {
        enabled: exam.enabled === true || c.type === 'exam',
        timeLimitMinutes: Number(exam.timeLimitMinutes) || 0,
        passScore: Number(exam.passScore != null ? exam.passScore : c.passScore) || 70,
        shuffle: exam.shuffle === true,
        questions: Array.isArray(exam.questions) ? exam.questions.map(function (q) {
          return {
            id: q.id || id('q'),
            prompt: q.prompt || '',
            type: q.type === 'multi' ? 'multi' : 'single',
            options: Array.isArray(q.options) ? q.options.map(function (o) {
              return { id: o.id || id('opt'), text: o.text || '' };
            }) : [],
            correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds.slice() : [],
            points: Number(q.points) || 1
          };
        }) : []
      },
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || c.createdAt || new Date().toISOString(),
      ownerId: c.ownerId || c.createdBy || '',
      createdBy: c.createdBy || c.ownerId || '',
      createdByName: c.createdByName || ''
    };
  }

  function isLmsInstructorUser() {
    var u = currentUser();
    if (!u) return false;
    if (isAdmin()) return true;
    var profile = getLearnerProfile(u.id);
    return !!(profile && profile.role === 'instructor');
  }

  function getData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch (e) {}
    return emptyData();
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
    } catch (e) {}
    persistAllIfFile();
  }

  function getSession() {
    try {
      var raw = localStorage.getItem('andeco_crm_session');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function isAdmin() {
    var s = getSession();
    return !!(s && s.isAdmin);
  }

  function currentUser() {
    var s = getSession();
    if (!s) return null;
    return {
      id: s.userId || s.username || 'unknown',
      name: s.displayName || s.username || 'User',
      username: s.username || ''
    };
  }

  function getUsers() {
    try {
      var raw = localStorage.getItem('andeco_crm_users');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  function accessCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function formatMoney(amount, currency) {
    var n = Number(amount) || 0;
    return (currency || 'EUR') + ' ' + n.toFixed(2);
  }

  function typeLabel(t) { return COURSE_TYPES[t] || t; }
  function audienceLabel(a) { return AUDIENCES[a] || a; }

  function findCourse(courseId) {
    return getData().courses.filter(function (c) { return c.id === courseId; })[0] || null;
  }

  function findEnrollment(enrollmentId) {
    return getData().enrollments.filter(function (e) { return e.id === enrollmentId; })[0] || null;
  }

  function myEnrollments() {
    var u = currentUser();
    if (!u) return [];
    return getData().enrollments.filter(function (e) { return e.userId === u.id; });
  }

  function ensureEnrollment(courseId, source) {
    var u = currentUser();
    if (!u) return null;
    var data = getData();
    var existing = data.enrollments.filter(function (e) {
      return e.courseId === courseId && e.userId === u.id;
    })[0];
    if (existing) return existing;
    var en = {
      id: id('enr'),
      courseId: courseId,
      userId: u.id,
      userName: u.name,
      source: source || 'self',
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

  function updateEnrollmentProgress(enrollmentId, completedLessonIds, course) {
    var data = getData();
    var en = data.enrollments.filter(function (e) { return e.id === enrollmentId; })[0];
    if (!en) return;
    en.completedLessonIds = completedLessonIds.slice();
    var total = (course.lessons || []).length;
    en.progressPercent = total ? Math.round((completedLessonIds.length / total) * 100) : (course.exam && course.exam.enabled ? en.progressPercent : 100);
    if (en.status === 'enrolled') en.status = 'in_progress';
    if (total && completedLessonIds.length >= total && !(course.exam && course.exam.enabled)) {
      en.status = 'completed';
      en.progressPercent = 100;
      en.completedAt = new Date().toISOString();
      en.passed = true;
      maybeIssueCertificate(data, en, course);
    }
    saveData(data);
  }

  function allLessonsComplete(course, en) {
    var lessons = (course && course.lessons) || [];
    if (!lessons.length) return true;
    var done = (en && en.completedLessonIds) || [];
    return lessons.every(function (l) { return done.indexOf(l.id) !== -1; });
  }

  function canAccessCourseExam(course, en) {
    if (!course || !course.exam || !course.exam.enabled) return false;
    return allLessonsComplete(course, en);
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

  function examEndsAtMs(course, enrollment, startedAtIso) {
    var mins = examTimeLimitMinutes(course);
    var startedAt = startedAtIso || (enrollment && enrollment.examStartedAt);
    if (!mins || !startedAt) return null;
    var start = new Date(startedAt).getTime();
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

  function computeCertificateExpiry(issuedAt, validMonths) {
    var months = Math.max(0, Number(validMonths) || 0);
    if (!months || !issuedAt) return '';
    var d = new Date(issuedAt);
    if (isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
  }

  function resolveCertificateExpiry(cert, course) {
    if (!cert) return '';
    if (cert.expiresAt) return cert.expiresAt;
    var months = course && course.certificateValidMonths != null
      ? course.certificateValidMonths
      : ((findCourse(cert.courseId) || {}).certificateValidMonths || 0);
    return computeCertificateExpiry(cert.issuedAt, months);
  }

  function isCertificateExpired(cert, course) {
    var expiresAt = resolveCertificateExpiry(cert, course);
    if (!expiresAt) return false;
    var t = new Date(expiresAt).getTime();
    return !isNaN(t) && t < Date.now();
  }

  function maybeIssueCertificate(data, enrollment, course) {
    if (!data.settings.autoIssueCertificates) return null;
    if (!enrollment || !course) return null;
    if (!(enrollment.status === 'completed' || enrollment.passed === true)) return null;
    var exists = (data.certificates || []).some(function (c) {
      return c.enrollmentId === enrollment.id || (c.userId === enrollment.userId && c.courseId === course.id);
    });
    if (exists) return null;
    var issuedAt = new Date().toISOString();
    var cert = {
      id: id('cert'),
      userId: enrollment.userId,
      userName: enrollment.userName,
      courseId: course.id,
      courseTitle: course.title,
      enrollmentId: enrollment.id,
      issuedAt: issuedAt,
      expiresAt: computeCertificateExpiry(issuedAt, course.certificateValidMonths),
      validMonths: Math.max(0, Number(course.certificateValidMonths) || 0),
      certificateNo: 'AND-' + String(Date.now()).slice(-8),
      score: enrollment.score != null ? enrollment.score : null
    };
    data.certificates = data.certificates || [];
    data.certificates.push(cert);
    return cert;
  }

  function getLearnerProfile(userId) {
    var data = getData();
    return (data.learnerProfiles || []).filter(function (p) { return p.userId === userId; })[0] || null;
  }

  function upsertLearnerProfile(userId, patch) {
    var data = getData();
    var idx = (data.learnerProfiles || []).findIndex(function (p) { return p.userId === userId; });
    var base = idx >= 0
      ? data.learnerProfiles[idx]
      : { userId: userId, role: 'learner', department: '', notes: '', title: '', signatureImage: '' };
    var next = Object.assign({}, base, patch || {}, { userId: userId });
    if (!LEARNER_ROLES[next.role]) next.role = 'learner';
    if (typeof next.signatureImage !== 'string') next.signatureImage = base.signatureImage || '';
    if (typeof next.title !== 'string') next.title = base.title || '';
    if (idx >= 0) data.learnerProfiles[idx] = next;
    else {
      data.learnerProfiles = data.learnerProfiles || [];
      data.learnerProfiles.push(next);
    }
    saveData(data);
    return next;
  }

  function resolveCourseInstructor(course, data) {
    data = data || getData();
    var ownerId = (course && (course.ownerId || course.createdBy)) || '';
    var profile = ownerId ? getLearnerProfile(ownerId) : null;
    var user = ownerId
      ? getUsers().filter(function (u) { return u.id === ownerId; })[0]
      : null;
    var name = (course && course.createdByName) ||
      (course && course.instructorName) ||
      (user && (user.displayName || user.username)) ||
      ((data.settings && data.settings.companyLmsName) || 'Andeco Learning');
    var signatureImage = (profile && profile.signatureImage) || '';
    return {
      userId: ownerId,
      name: name,
      title: 'Course Instructor',
      signatureImage: signatureImage
    };
  }

  function signatureBlockHtml(person) {
    var name = (person && person.name) || 'Authorized Signer';
    var title = (person && person.title) || '';
    var sig = (person && person.signatureImage) || '';
    var mark = sig
      ? '<div class="lms-certificate-sign-image"><img src="' + escapeHtml(sig) + '" alt="Signature of ' + escapeHtml(name) + '"></div>'
      : '<p class="lms-certificate-script">' + signatureScript(name) + '</p>';
    return '<div class="lms-certificate-sign-block">' +
      mark +
      '<div class="lms-certificate-sign-line"></div>' +
      '<strong>' + escapeHtml(String(name).toUpperCase()) + '</strong>' +
      (title ? '<span>' + escapeHtml(String(title).toUpperCase()) + '</span>' : '') +
    '</div>';
  }

  function embedMediaHtml(lesson) {
    var type = lesson.contentType || 'text';
    var url = lesson.mediaUrl || '';
    if (!url || type === 'text') return '';
    if (type === 'video') {
      var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);
      var vim = url.match(/vimeo\.com\/(\d+)/);
      if (yt) {
        return '<div class="lms-media"><iframe src="https://www.youtube.com/embed/' + escapeHtml(yt[1]) +
          '" title="Lesson video" allowfullscreen loading="lazy"></iframe></div>';
      }
      if (vim) {
        return '<div class="lms-media"><iframe src="https://player.vimeo.com/video/' + escapeHtml(vim[1]) +
          '" title="Lesson video" allowfullscreen loading="lazy"></iframe></div>';
      }
      return '<div class="lms-media"><video controls src="' + escapeHtml(url) + '"></video></div>';
    }
    return '<p class="lms-actions"><a class="btn btn-secondary" href="' + escapeHtml(url) +
      '" target="_blank" rel="noopener noreferrer">' +
      (type === 'document' ? 'Open document' : 'Open resource') + '</a></p>';
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
    return { earned: earned, max: max, percent: percent, passed: percent >= passScore, passScore: passScore };
  }

  /* ---------- Render helpers ---------- */

  function metricHtml(label, value, tone) {
    return '<div class="lms-metric' + (tone ? ' lms-metric--' + tone : '') + '">' +
      '<span class="lms-metric-value">' + escapeHtml(String(value)) + '</span>' +
      '<span class="lms-metric-label">' + escapeHtml(label) + '</span></div>';
  }

  function emptyState(msg) {
    return '<p class="lms-empty">' + escapeHtml(msg) + '</p>';
  }

  function statusBadge(status) {
    return '<span class="lms-badge lms-badge--' + escapeHtml(status || 'enrolled') + '">' + escapeHtml(status || 'enrolled') + '</span>';
  }

  /* ---------- Section renders ---------- */

  function renderDashboard() {
    var el = document.getElementById('lms-dashboard');
    if (!el) return;
    var data = getData();
    var mine = myEnrollments();
    var published = data.courses.filter(function (c) { return c.published; });
    var pendingPurchases = data.purchases.filter(function (p) { return p.status === 'pending'; }).length;
    var openApplicants = data.applicants.filter(function (a) {
      return a.status === 'invited' || a.status === 'started';
    }).length;
    var completed = mine.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
    var myCerts = (data.certificates || []).filter(function (c) {
      var u = currentUser();
      return u && c.userId === u.id;
    }).length;
    var pinned = (data.announcements || []).filter(function (a) { return a.pinned; }).slice(0, 3);

    var capabilities = [
      { title: 'Course Management', desc: 'Create courses, inductions, procedures, exams', goto: 'library', ready: true },
      { title: 'User Management', desc: 'Learners, instructors, enrollments', goto: 'learners', ready: true },
      { title: 'Content Delivery', desc: 'Text, video, documents & links', goto: 'my-learning', ready: true },
      { title: 'Assessment & Evaluation', desc: 'Quizzes, scoring, pass marks', goto: 'library', ready: true },
      { title: 'Communication Tools', desc: 'Announcements plus course & private discussions', goto: 'announcements', ready: true },
      { title: 'Tracking & Reporting', desc: 'Progress, completion and scores', goto: 'reports', ready: true },
      { title: 'Certification', desc: 'Auto certificates on completion', goto: 'certificates', ready: true },
      { title: 'Mobile Access', desc: 'Responsive layout on phones & tablets', goto: 'settings', ready: true }
    ];

    el.innerHTML =
      '<div class="lms-metrics">' +
        metricHtml('Published courses', published.length) +
        metricHtml('My enrollments', mine.length) +
        metricHtml('Completed', completed, 'ok') +
        metricHtml('My certificates', myCerts, myCerts ? 'ok' : '') +
        (isAdmin() ? metricHtml('Pending purchases', pendingPurchases, pendingPurchases ? 'warn' : '') : '') +
        (isAdmin() ? metricHtml('Open applicants', openApplicants, openApplicants ? 'warn' : '') : '') +
      '</div>' +
      '<div class="module-table-panel">' +
        '<h3>LMS capabilities</h3>' +
        '<div class="lms-capability-grid">' +
          capabilities.map(function (cap) {
            return '<button type="button" class="lms-capability-card" data-lms-goto="' + escapeHtml(cap.goto) + '">' +
              '<strong>' + escapeHtml(cap.title) + '</strong>' +
              '<span>' + escapeHtml(cap.desc) + '</span>' +
              '<em class="lms-capability-ready">Ready</em></button>';
          }).join('') +
        '</div>' +
      '</div>' +
      (pinned.length ? '<div class="module-table-panel"><h3>Announcements</h3><div class="lms-announce-list">' +
        pinned.map(function (a) {
          return '<article class="lms-announce-card"><strong>' + escapeHtml(a.title) + '</strong>' +
            '<p>' + escapeHtml(a.body) + '</p></article>';
        }).join('') +
        '</div></div>' : '') +
      '<div class="lms-dashboard-grid">' +
        '<div class="module-table-panel">' +
          '<h3>Continue learning</h3>' +
          renderMyLearningCards(mine.slice(0, 5), true) +
        '</div>' +
        '<div class="module-table-panel">' +
          '<h3>Available for you</h3>' +
          renderCourseMiniList(published.filter(function (c) {
            return c.audience === 'employee' || c.audience === 'all';
          }).slice(0, 6)) +
        '</div>' +
      '</div>' +
      (isAdmin() ? '<div class="module-table-panel"><h3>Admin shortcuts</h3>' +
        '<div class="lms-actions">' +
          '<button type="button" class="btn btn-primary" id="lms-open-portal-btn-dash">Open modern Learning Portal</button>' +
          '<button type="button" class="btn btn-secondary" data-lms-goto="library">Course management</button>' +
          '<button type="button" class="btn btn-secondary" data-lms-goto="reports">Reports</button>' +
          '<button type="button" class="btn btn-secondary" data-lms-goto="announcements">Announcements</button>' +
          '<button type="button" class="btn btn-secondary" data-lms-goto="hiring">Hiring exams</button>' +
          '<button type="button" class="btn btn-ghost" data-lms-goto="settings">LMS settings</button>' +
        '</div>' +
        '<p class="lms-hint">LMS-only users are sent to the Learning Portal after login. Public catalog: <code>#lms-public</code> · Careers: <code>#lms-careers</code></p>' +
      '</div>' : '');
  }

  function renderCourseMiniList(courses) {
    if (!courses.length) return emptyState('No courses available yet.');
    return '<div class="lms-course-list">' + courses.map(function (c) {
      return '<div class="lms-course-card">' +
        '<div><strong>' + escapeHtml(c.title) + '</strong>' +
        '<div class="lms-meta">' + escapeHtml(typeLabel(c.type)) + ' · ' + escapeHtml(c.category) + '</div></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-lms-enroll="' + escapeHtml(c.id) + '">Open</button>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderMyLearningCards(enrollments, compact) {
    if (!enrollments.length) return emptyState('You are not enrolled in any training yet.');
    var data = getData();
    return '<div class="lms-course-list">' + enrollments.map(function (en) {
      var course = data.courses.filter(function (c) { return c.id === en.courseId; })[0];
      if (!course) return '';
      return '<div class="lms-course-card">' +
        '<div><strong>' + escapeHtml(course.title) + '</strong>' +
        '<div class="lms-meta">' + statusBadge(en.status) +
        ' · ' + escapeHtml(String(en.progressPercent || 0)) + '% complete' +
        (en.score != null ? ' · Score ' + escapeHtml(String(en.score)) + '%' : '') +
        '</div>' +
        '<div class="lms-progress"><span style="width:' + (en.progressPercent || 0) + '%"></span></div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-lms-play="' + escapeHtml(en.id) + '">' +
          (en.status === 'completed' ? 'Review' : 'Continue') + '</button>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderMyLearning() {
    var el = document.getElementById('lms-my-learning');
    if (!el) return;
    if (viewState.mode === 'player' || viewState.mode === 'exam') {
      renderPlayer(el);
      return;
    }
    var data = getData();
    var u = currentUser();
    var announcements = (data.announcements || []).filter(function (a) {
      return !a.audience || a.audience === 'all' || a.audience === 'employees';
    }).slice(0, 3);
    el.innerHTML =
      '<div class="page-header"><h2>My learning</h2><p class="lms-hint">Content delivery for your assigned and self-enrolled training.</p></div>' +
      (announcements.length ? '<div class="module-table-panel"><h3>Latest announcements</h3><div class="lms-announce-list">' +
        announcements.map(function (a) {
          return '<article class="lms-announce-card"><strong>' + escapeHtml(a.title) + '</strong><p>' + escapeHtml(a.body) + '</p></article>';
        }).join('') + '</div></div>' : '') +
      renderMyLearningCards(myEnrollments(), false) +
      '<div class="module-table-panel" style="margin-top:1rem"><h3>My certificates</h3>' +
        renderCertificateList((data.certificates || []).filter(function (c) { return u && c.userId === u.id; }), false) +
      '</div>';
  }

  function renderLibrary(options) {
    options = options || {};
    var el = document.getElementById('lms-library');
    if (!el) return;
    if (!isAdmin() && !isLmsInstructorUser()) {
      el.innerHTML = emptyState('Only instructors and administrators can manage the training library.');
      return;
    }
    if (viewState.mode === 'editor' && viewState.courseId !== undefined) {
      // Keep unsaved editor DOM intact during background data polls.
      if (!options.force && isCourseEditorOpen()) {
        syncDraftFromEditor();
        return;
      }
      renderCourseEditor(el);
      return;
    }
    var courses = getData().courses;
    var filter = (document.getElementById('lms-library-filter') && document.getElementById('lms-library-filter').value) || '';
    var q = ((document.getElementById('lms-library-search') && document.getElementById('lms-library-search').value) || '').toLowerCase();
    var rows = courses.filter(function (c) {
      if (filter && c.type !== filter) return false;
      if (q && (c.title + ' ' + c.category + ' ' + c.description).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    el.innerHTML =
      '<div class="page-header"><h2>Training library</h2>' +
      '<div class="header-actions"><button type="button" class="btn btn-primary" id="lms-add-course">+ New training</button></div></div>' +
      '<div class="lms-toolbar">' +
        '<input type="search" id="lms-library-search" class="search-input" placeholder="Search training…" value="' + escapeHtml(q) + '">' +
        '<select id="lms-library-filter">' +
          '<option value="">All types</option>' +
          Object.keys(COURSE_TYPES).map(function (k) {
            return '<option value="' + k + '"' + (filter === k ? ' selected' : '') + '>' + escapeHtml(COURSE_TYPES[k]) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Photo</th><th>Title</th><th>Type</th><th>Audience</th><th>Price</th><th>Lessons</th><th>Exam</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (c) {
        var thumb = c.coverImage
          ? '<img class="lms-library-thumb" src="' + escapeHtml(c.coverImage) + '" alt="">'
          : '<span class="lms-library-thumb lms-library-thumb--empty">' + escapeHtml(String(c.title || 'C').charAt(0).toUpperCase()) + '</span>';
        return '<tr>' +
          '<td>' + thumb + '</td>' +
          '<td><strong>' + escapeHtml(c.title) + '</strong><div class="lms-meta">' + escapeHtml(c.category) + '</div></td>' +
          '<td>' + escapeHtml(typeLabel(c.type)) + '</td>' +
          '<td>' + escapeHtml(audienceLabel(c.audience)) + '</td>' +
          '<td>' + (c.audience === 'public' || c.audience === 'all' ? escapeHtml(formatMoney(c.price, c.currency)) : '—') + '</td>' +
          '<td>' + c.lessons.length + '</td>' +
          '<td>' + (c.exam.enabled ? c.exam.questions.length + ' Q' : '—') + '</td>' +
          '<td>' + (c.published ? statusBadge('published') : statusBadge('draft')) + '</td>' +
          '<td class="lms-row-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-lms-edit="' + escapeHtml(c.id) + '">Edit</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-lms-duplicate="' + escapeHtml(c.id) + '">Copy</button>' +
            '<button type="button" class="btn btn-danger btn-sm" data-lms-delete="' + escapeHtml(c.id) + '">Delete</button>' +
          '</td></tr>';
      }).join('') : '<tr><td colspan="9">No training items yet. Create your first course, induction, procedure, or exam.</td></tr>') +
      '</tbody></table></div>';
  }

  function renderCourseEditor(el) {
    var course = null;
    if (viewState.draftCourse) {
      course = normalizeCourse(viewState.draftCourse);
    } else if (viewState.courseId) {
      course = findCourse(viewState.courseId);
    } else {
      course = normalizeCourse({
        id: id('crs'),
        title: '',
        type: 'course',
        audience: 'employee',
        published: true,
        lessons: [{ id: id('lsn'), title: 'Introduction', content: '', order: 0 }],
        exam: { enabled: false, questions: [], passScore: 70, timeLimitMinutes: 0, shuffle: false }
      });
    }
    if (!course) {
      viewState.mode = 'list';
      clearEditorDraft();
      renderLibrary({ force: true });
      return;
    }
    viewState.draftCourse = course;
    viewState.courseId = course.id || viewState.courseId;
    viewState.coverImageCleared = false;

    el.innerHTML =
      '<div class="page-header"><h2>' + (viewState.courseId ? 'Edit training' : 'New training') + '</h2>' +
      '<div class="header-actions"><button type="button" class="btn btn-ghost" id="lms-editor-cancel">← Back to library</button></div></div>' +
      '<div class="invoice-form-container"><form id="lms-course-form" class="invoice-form">' +
        '<div class="form-section"><h3>Basics</h3><div class="form-row">' +
          '<div class="form-group full-width"><label>Title</label><input name="title" required value="' + escapeHtml(course.title) + '"></div>' +
          '<div class="form-group"><label>Type</label><select name="type">' +
            Object.keys(COURSE_TYPES).map(function (k) {
              return '<option value="' + k + '"' + (course.type === k ? ' selected' : '') + '>' + escapeHtml(COURSE_TYPES[k]) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Audience</label><select name="audience">' +
            Object.keys(AUDIENCES).map(function (k) {
              return '<option value="' + k + '"' + (course.audience === k ? ' selected' : '') + '>' + escapeHtml(AUDIENCES[k]) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Category</label><input name="category" value="' + escapeHtml(course.category) + '"></div>' +
          '<div class="form-group"><label>Duration (minutes)</label><input name="durationMinutes" type="number" min="0" value="' + escapeHtml(String(course.durationMinutes)) + '"></div>' +
          '<div class="form-group"><label>Price</label><input name="price" type="number" min="0" step="0.01" value="' + escapeHtml(String(course.price)) + '"></div>' +
          '<div class="form-group"><label>Currency</label><input name="currency" value="' + escapeHtml(course.currency) + '"></div>' +
          '<div class="form-group full-width"><label>Course photo URL</label>' +
            '<input name="coverImage" id="lms-cover-image-input" value="' +
              escapeHtml((course.coverImage && course.coverImage.indexOf('data:image') === 0) ? '' : (course.coverImage || '')) +
            '" placeholder="https://… or upload below">' +
            ((course.coverImage && course.coverImage.indexOf('data:image') === 0)
              ? '<p class="lms-hint" id="lms-cover-upload-note">Uploaded photo is saved with this course. Upload again or paste a URL to replace it.</p>'
              : '<p class="lms-hint hidden" id="lms-cover-upload-note">Uploaded photo is saved with this course.</p>') +
          '</div>' +
          '<div class="form-group full-width"><label>Upload course photo</label>' +
            '<input type="file" id="lms-cover-image-file" accept="image/*">' +
            '<div class="lms-cover-preview' + (course.coverImage ? ' has-image' : '') + '" id="lms-cover-preview"></div>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="lms-cover-image-clear" style="margin-top:0.5rem">Remove photo</button>' +
          '</div>' +
          '<div class="form-group full-width"><label>Description</label><textarea name="description" rows="3">' + escapeHtml(course.description) + '</textarea></div>' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="published"' + (course.published ? ' checked' : '') + '> Published</label></div>' +
        '</div></div>' +
        '<div class="form-section"><h3>Instructor</h3><div class="form-row">' +
          '<div class="form-group"><label>Instructor name</label><input name="instructorName" value="' + escapeHtml(course.instructorName || '') + '" placeholder="Shown on the course page"></div>' +
          '<div class="form-group"><label>Instructor title</label><input name="instructorTitle" value="' + escapeHtml(course.instructorTitle || '') + '" placeholder="e.g. Senior Trainer"></div>' +
          '<div class="form-group full-width"><label>Instructor bio</label><textarea name="instructorBio" rows="2" placeholder="Short intro for learners">' + escapeHtml(course.instructorBio || '') + '</textarea></div>' +
        '</div></div>' +
        '<div class="form-section"><h3>Lessons / content</h3>' +
          '<div id="lms-lessons-editor"></div>' +
          '<button type="button" class="btn btn-secondary" id="lms-add-lesson">+ Add lesson</button>' +
        '</div>' +
        '<div class="form-section"><h3>Exam / assessment</h3><div class="form-row">' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="examEnabled"' + (course.exam.enabled ? ' checked' : '') + '> Enable exam</label></div>' +
          '<div class="form-group"><label>Pass score (%)</label><input name="passScore" type="number" min="0" max="100" value="' + escapeHtml(String(course.exam.passScore || course.passScore || 70)) + '"></div>' +
          '<div class="form-group"><label>Time limit (minutes, 0 = none)</label><input name="timeLimitMinutes" type="number" min="0" value="' + escapeHtml(String(course.exam.timeLimitMinutes || 0)) + '"></div>' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="shuffle"' + (course.exam.shuffle ? ' checked' : '') + '> Shuffle questions</label></div>' +
          '<div class="form-group"><label>Certificate validity (months)</label>' +
            '<input name="certificateValidMonths" type="number" min="0" value="' + escapeHtml(String(course.certificateValidMonths || 0)) + '">' +
            '<p class="lms-hint">Set how long the certificate stays valid after it is issued. Use 0 for no expiration.</p>' +
          '</div>' +
        '</div>' +
          '<div id="lms-questions-editor"></div>' +
          '<button type="button" class="btn btn-secondary" id="lms-add-question">+ Add question</button>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-ghost" id="lms-editor-cancel-2">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">Save training</button>' +
        '</div>' +
      '</form></div>';

    renderLessonsEditor(course.lessons);
    renderQuestionsEditor(course.exam.questions);
    el.setAttribute('data-editing-course-id', course.id || '');
    bindCoverImageControls();
  }

  function currentCoverImageValue() {
    var urlInput = document.getElementById('lms-cover-image-input');
    var typed = urlInput ? String(urlInput.value || '').trim() : '';
    if (typed) return typed;
    if (viewState.draftCourse && viewState.draftCourse.coverImage) return viewState.draftCourse.coverImage;
    var existingId = document.getElementById('lms-library')
      ? document.getElementById('lms-library').getAttribute('data-editing-course-id')
      : '';
    return ((findCourse(existingId) || {}).coverImage) || '';
  }

  function setCoverImageValue(src) {
    if (!viewState.draftCourse) viewState.draftCourse = normalizeCourse({});
    viewState.draftCourse.coverImage = src || '';
    viewState.coverImageCleared = !src;
    var urlInput = document.getElementById('lms-cover-image-input');
    var note = document.getElementById('lms-cover-upload-note');
    if (urlInput) {
      if (src && src.indexOf('data:image') === 0) urlInput.value = '';
      else urlInput.value = src || '';
    }
    if (note) {
      note.classList.toggle('hidden', !(src && src.indexOf('data:image') === 0));
      if (src && src.indexOf('data:image') === 0) {
        note.textContent = 'Uploaded photo is saved with this course. Upload again or paste a URL to replace it.';
      }
    }
  }

  function bindCoverImageControls() {
    var fileInput = document.getElementById('lms-cover-image-file');
    var urlInput = document.getElementById('lms-cover-image-input');
    var preview = document.getElementById('lms-cover-preview');
    var clearBtn = document.getElementById('lms-cover-image-clear');
    if (!fileInput || !urlInput || !preview) return;

    function setPreview(src) {
      preview.innerHTML = '';
      if (src) {
        preview.classList.add('has-image');
        var img = document.createElement('img');
        img.alt = 'Course cover preview';
        img.src = src;
        preview.appendChild(img);
      } else {
        preview.classList.remove('has-image');
        preview.innerHTML = '<span>No photo yet</span>';
      }
    }

    setPreview(currentCoverImageValue());

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
        setCoverImageValue(dataUrl);
        setPreview(dataUrl);
        syncDraftFromEditor();
      };
      reader.readAsDataURL(file);
    };

    urlInput.oninput = function () {
      var typed = urlInput.value.trim();
      setCoverImageValue(typed);
      setPreview(typed || currentCoverImageValue());
      syncDraftFromEditor();
    };

    if (clearBtn) {
      clearBtn.onclick = function () {
        fileInput.value = '';
        setCoverImageValue('');
        setPreview('');
        syncDraftFromEditor();
      };
    }
  }

  function renderLessonsEditor(lessons) {
    var wrap = document.getElementById('lms-lessons-editor');
    if (!wrap) return;
    wrap.innerHTML = lessons.map(function (l, i) {
      return '<div class="lms-editor-block" data-lesson-index="' + i + '">' +
        '<div class="form-row">' +
          '<div class="form-group"><label>Lesson ' + (i + 1) + ' title</label>' +
            '<input data-lesson-field="title" value="' + escapeHtml(l.title) + '"></div>' +
          '<div class="form-group"><label>Minutes</label>' +
            '<input data-lesson-field="durationMinutes" type="number" min="0" value="' + escapeHtml(String(l.durationMinutes || 0)) + '"></div>' +
          '<div class="form-group"><label>Content type</label><select data-lesson-field="contentType">' +
            Object.keys(CONTENT_TYPES).map(function (k) {
              return '<option value="' + k + '"' + ((l.contentType || 'text') === k ? ' selected' : '') + '>' + escapeHtml(CONTENT_TYPES[k]) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Media / document URL</label>' +
            '<input data-lesson-field="mediaUrl" value="' + escapeHtml(l.mediaUrl || '') + '" placeholder="https://…"></div>' +
          '<div class="form-group full-width"><label>Content / notes</label>' +
            '<textarea data-lesson-field="content" rows="4" placeholder="Training content, procedure steps, induction notes…">' + escapeHtml(l.content) + '</textarea></div>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-remove-lesson="' + i + '">Remove lesson</button>' +
        '<input type="hidden" data-lesson-field="id" value="' + escapeHtml(l.id) + '">' +
      '</div>';
    }).join('') || emptyState('No lessons yet. Add content for employees to study.');
  }

  function renderQuestionsEditor(questions) {
    var wrap = document.getElementById('lms-questions-editor');
    if (!wrap) return;
    wrap.innerHTML = questions.map(function (q, i) {
      var options = q.options && q.options.length ? q.options : [
        { id: id('opt'), text: '' },
        { id: id('opt'), text: '' }
      ];
      return '<div class="lms-editor-block" data-question-index="' + i + '">' +
        '<div class="form-row">' +
          '<div class="form-group full-width"><label>Question ' + (i + 1) + '</label>' +
            '<textarea data-q-field="prompt" rows="2">' + escapeHtml(q.prompt) + '</textarea></div>' +
          '<div class="form-group"><label>Type</label><select data-q-field="type">' +
            '<option value="single"' + (q.type !== 'multi' ? ' selected' : '') + '>Single answer</option>' +
            '<option value="multi"' + (q.type === 'multi' ? ' selected' : '') + '>Multiple answers</option>' +
          '</select></div>' +
          '<div class="form-group"><label>Points</label><input data-q-field="points" type="number" min="1" value="' + escapeHtml(String(q.points || 1)) + '"></div>' +
        '</div>' +
        '<div class="lms-options-editor">' + options.map(function (o, oi) {
          var checked = (q.correctOptionIds || []).indexOf(o.id) !== -1;
          return '<label class="lms-option-row">' +
            '<input type="checkbox" data-q-correct="' + oi + '"' + (checked ? ' checked' : '') + '> Correct' +
            '<input type="text" data-q-option="' + oi + '" value="' + escapeHtml(o.text) + '" placeholder="Option text">' +
            '<input type="hidden" data-q-option-id="' + oi + '" value="' + escapeHtml(o.id) + '">' +
          '</label>';
        }).join('') + '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-add-option="' + i + '">+ Option</button> ' +
        '<button type="button" class="btn btn-ghost btn-sm" data-remove-question="' + i + '">Remove question</button>' +
        '<input type="hidden" data-q-field="id" value="' + escapeHtml(q.id) + '">' +
      '</div>';
    }).join('') || '<p class="lms-hint">Add questions for inductions, procedure checks, or hiring exams.</p>';
  }

  function collectEditorCourse() {
    var form = document.getElementById('lms-course-form');
    if (!form) return null;
    var fd = new FormData(form);
    var lessons = [];
    document.querySelectorAll('#lms-lessons-editor .lms-editor-block').forEach(function (block, i) {
      lessons.push({
        id: (block.querySelector('[data-lesson-field="id"]') || {}).value || id('lsn'),
        title: (block.querySelector('[data-lesson-field="title"]') || {}).value || ('Lesson ' + (i + 1)),
        content: (block.querySelector('[data-lesson-field="content"]') || {}).value || '',
        contentType: (block.querySelector('[data-lesson-field="contentType"]') || {}).value || 'text',
        mediaUrl: (block.querySelector('[data-lesson-field="mediaUrl"]') || {}).value || '',
        durationMinutes: Number((block.querySelector('[data-lesson-field="durationMinutes"]') || {}).value) || 0,
        order: i
      });
    });
    var questions = [];
    document.querySelectorAll('#lms-questions-editor .lms-editor-block').forEach(function (block) {
      var options = [];
      var correct = [];
      block.querySelectorAll('[data-q-option]').forEach(function (input) {
        var oi = input.getAttribute('data-q-option');
        var oid = (block.querySelector('[data-q-option-id="' + oi + '"]') || {}).value || id('opt');
        var text = input.value || '';
        options.push({ id: oid, text: text });
        var cb = block.querySelector('[data-q-correct="' + oi + '"]');
        if (cb && cb.checked) correct.push(oid);
      });
      questions.push({
        id: (block.querySelector('[data-q-field="id"]') || {}).value || id('q'),
        prompt: (block.querySelector('[data-q-field="prompt"]') || {}).value || '',
        type: (block.querySelector('[data-q-field="type"]') || {}).value || 'single',
        points: Number((block.querySelector('[data-q-field="points"]') || {}).value) || 1,
        options: options,
        correctOptionIds: correct
      });
    });
    var existingId = document.getElementById('lms-library').getAttribute('data-editing-course-id') || '';
    var typedCover = String(fd.get('coverImage') || '').trim();
    var coverImage = typedCover;
    if (!coverImage && !viewState.coverImageCleared && viewState.draftCourse && viewState.draftCourse.coverImage) {
      coverImage = viewState.draftCourse.coverImage;
    }
    if (!coverImage && !viewState.coverImageCleared) {
      coverImage = ((findCourse(existingId) || {}).coverImage) || '';
    }
    if (viewState.coverImageCleared && !typedCover) coverImage = '';
    return normalizeCourse({
      id: existingId || id('crs'),
      title: String(fd.get('title') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      coverImage: coverImage,
      instructorName: String(fd.get('instructorName') || '').trim() ||
        (findCourse(existingId) || {}).createdByName ||
        (currentUser() || {}).name || '',
      instructorTitle: String(fd.get('instructorTitle') || '').trim() || 'Course Instructor',
      instructorBio: String(fd.get('instructorBio') || '').trim(),
      type: String(fd.get('type') || 'course'),
      audience: String(fd.get('audience') || 'employee'),
      category: String(fd.get('category') || 'General').trim() || 'General',
      durationMinutes: Number(fd.get('durationMinutes')) || 0,
      price: Number(fd.get('price')) || 0,
      currency: String(fd.get('currency') || 'EUR').trim() || 'EUR',
      published: form.querySelector('[name="published"]').checked,
      passScore: Number(fd.get('passScore')) || 70,
      certificateValidMonths: Math.max(0, Number(fd.get('certificateValidMonths')) || 0),
      lessons: lessons,
      exam: {
        enabled: form.querySelector('[name="examEnabled"]').checked || String(fd.get('type')) === 'exam',
        passScore: Number(fd.get('passScore')) || 70,
        timeLimitMinutes: Number(fd.get('timeLimitMinutes')) || 0,
        shuffle: form.querySelector('[name="shuffle"]').checked,
        questions: questions
      },
      updatedAt: new Date().toISOString(),
      createdAt: (findCourse(existingId) || {}).createdAt || new Date().toISOString(),
      ownerId: (findCourse(existingId) || {}).ownerId || (currentUser() || {}).id || '',
      createdBy: (findCourse(existingId) || {}).createdBy || (currentUser() || {}).id || '',
      createdByName: (findCourse(existingId) || {}).createdByName || (currentUser() || {}).name || ''
    });
  }

  function renderLearners() {
    var el = document.getElementById('lms-learners');
    if (!el) return;
    if (!isAdmin()) {
      el.innerHTML = emptyState('Learner management is available to administrators.');
      return;
    }
    var data = getData();
    var users = getUsers();
    el.innerHTML =
      '<div class="page-header"><h2>User management</h2>' +
      '<p class="lms-hint">Manage learner/instructor roles and assign training. App login accounts are still created under Admin.</p></div>' +
      '<div class="invoice-form-container" style="margin-bottom:1.5rem"><form id="lms-profile-form" class="invoice-form">' +
        '<div class="form-section"><h3>Learner / instructor profile</h3><div class="form-row">' +
          '<div class="form-group"><label>User</label><select name="userId" required>' +
            '<option value="">Select user…</option>' +
            users.map(function (u) {
              return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.displayName || u.username) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>LMS role</label><select name="role">' +
            Object.keys(LEARNER_ROLES).map(function (k) {
              return '<option value="' + k + '">' + escapeHtml(LEARNER_ROLES[k]) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Department</label><input name="department" placeholder="e.g. Deck, Office"></div>' +
          '<div class="form-group"><label>Title</label><input name="title" placeholder="e.g. Course Instructor"></div>' +
          '<div class="form-group full-width"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>' +
          '<div class="form-group full-width"><label>Instructor signature image</label>' +
            '<input type="file" id="lms-profile-signature-file" accept="image/*">' +
            '<input type="hidden" name="signatureImage" id="lms-profile-signature-value" value="">' +
            '<div class="lms-signature-preview" id="lms-profile-signature-preview"><span>No signature uploaded</span></div>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="lms-profile-signature-clear" style="margin-top:0.5rem">Remove signature</button>' +
            '<p class="lms-hint">Used on course certificates for instructors who create courses.</p>' +
          '</div>' +
        '</div><div class="form-actions"><button type="submit" class="btn btn-primary">Save profile</button></div></div>' +
      '</form></div>' +
      '<div class="table-wrap" style="margin-bottom:1.5rem"><table class="data-table"><thead><tr>' +
        '<th>User</th><th>LMS role</th><th>Department</th><th>Enrollments</th><th>Completed</th><th>Certificates</th>' +
      '</tr></thead><tbody>' +
      (users.length ? users.map(function (u) {
        var profile = getLearnerProfile(u.id) || { role: 'learner', department: '' };
        var ens = data.enrollments.filter(function (e) { return e.userId === u.id; });
        var done = ens.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
        var certs = (data.certificates || []).filter(function (c) { return c.userId === u.id; }).length;
        return '<tr><td><strong>' + escapeHtml(u.displayName || u.username) + '</strong>' +
          (u.isAdmin ? ' <span class="lms-badge">admin</span>' : '') +
          '<div class="lms-meta">' + escapeHtml(u.username) + '</div></td>' +
          '<td>' + escapeHtml(LEARNER_ROLES[profile.role] || 'Learner') +
            (profile.signatureImage ? ' · <span class="lms-meta">Signature on file</span>' : '') +
          '</td>' +
          '<td>' + escapeHtml(profile.department || '—') + '</td>' +
          '<td>' + ens.length + '</td><td>' + done + '</td><td>' + certs + '</td></tr>';
      }).join('') : '<tr><td colspan="6">No users found.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="invoice-form-container" style="margin-bottom:1.5rem"><form id="lms-assign-form" class="invoice-form">' +
        '<div class="form-section"><h3>Assign training</h3><div class="form-row">' +
          '<div class="form-group"><label>User</label><select name="userId" required>' +
            '<option value="">Select user…</option>' +
            users.map(function (u) {
              return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.displayName || u.username) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Training</label><select name="courseId" required>' +
            '<option value="">Select training…</option>' +
            data.courses.filter(function (c) { return c.published; }).map(function (c) {
              return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.title) + '</option>';
            }).join('') +
          '</select></div>' +
        '</div><div class="form-actions"><button type="submit" class="btn btn-primary">Assign</button></div></div>' +
      '</form></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Learner</th><th>Training</th><th>Source</th><th>Progress</th><th>Status</th><th>Score</th>' +
      '</tr></thead><tbody>' +
      (data.enrollments.length ? data.enrollments.slice().reverse().map(function (en) {
        var course = data.courses.filter(function (c) { return c.id === en.courseId; })[0];
        return '<tr><td>' + escapeHtml(en.userName) + '</td><td>' + escapeHtml(course ? course.title : '—') +
          '</td><td>' + escapeHtml(en.source) + '</td><td>' + escapeHtml(String(en.progressPercent || 0)) + '%</td><td>' +
          statusBadge(en.status) + '</td><td>' + (en.score != null ? escapeHtml(String(en.score)) + '%' : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="6">No enrollments yet.</td></tr>') +
      '</tbody></table></div>';
    bindProfileSignatureControls();
  }

  function bindProfileSignatureControls() {
    var form = document.getElementById('lms-profile-form');
    var file = document.getElementById('lms-profile-signature-file');
    var hidden = document.getElementById('lms-profile-signature-value');
    var preview = document.getElementById('lms-profile-signature-preview');
    var clearBtn = document.getElementById('lms-profile-signature-clear');
    var userSelect = form ? form.querySelector('[name="userId"]') : null;
    if (!form || !file || !hidden || !preview) return;

    function setPreview(src) {
      if (src) {
        preview.classList.add('has-image');
        preview.innerHTML = '<img src="' + src + '" alt="Signature preview">';
      } else {
        preview.classList.remove('has-image');
        preview.innerHTML = '<span>No signature uploaded</span>';
      }
    }

    function loadSelectedProfile() {
      var id = userSelect ? userSelect.value : '';
      var p = id ? getLearnerProfile(id) : null;
      var roleEl = form.querySelector('[name="role"]');
      var deptEl = form.querySelector('[name="department"]');
      var titleEl = form.querySelector('[name="title"]');
      var notesEl = form.querySelector('[name="notes"]');
      if (roleEl) roleEl.value = (p && p.role) || 'learner';
      if (deptEl) deptEl.value = (p && p.department) || '';
      if (titleEl) titleEl.value = (p && p.title) || '';
      if (notesEl) notesEl.value = (p && p.notes) || '';
      hidden.value = '';
      form.removeAttribute('data-signature-cleared');
      setPreview((p && p.signatureImage) || '');
    }

    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        alert('Please choose a signature image under 1.5 MB.');
        file.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        hidden.value = dataUrl;
        form.removeAttribute('data-signature-cleared');
        setPreview(dataUrl);
      };
      reader.readAsDataURL(f);
    };

    if (clearBtn) {
      clearBtn.onclick = function () {
        hidden.value = '';
        file.value = '';
        form.setAttribute('data-signature-cleared', '1');
        setPreview('');
      };
    }
    if (userSelect) userSelect.onchange = loadSelectedProfile;
  }

  function renderAnnouncements() {
    var el = document.getElementById('lms-announcements');
    if (!el) return;
    var data = getData();
    var list = (data.announcements || []).slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    el.innerHTML =
      '<div class="page-header"><h2>Communication</h2>' +
      '<p class="lms-hint">Share announcements with employees and learners.</p></div>' +
      (isAdmin() ? '<div class="invoice-form-container" style="margin-bottom:1.5rem"><form id="lms-announce-form" class="invoice-form">' +
        '<div class="form-section"><h3>New announcement</h3><div class="form-row">' +
          '<div class="form-group full-width"><label>Title</label><input name="title" required></div>' +
          '<div class="form-group full-width"><label>Message</label><textarea name="body" rows="3" required></textarea></div>' +
          '<div class="form-group"><label>Audience</label><select name="audience">' +
            '<option value="employees">Employees</option><option value="all">Everyone</option><option value="public">Public catalog visitors</option>' +
          '</select></div>' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="pinned"> Pin to dashboard</label></div>' +
        '</div><div class="form-actions"><button type="submit" class="btn btn-primary">Publish</button></div></div>' +
      '</form></div>' : '') +
      '<div class="lms-announce-list">' +
        (list.length ? list.map(function (a) {
          return '<article class="lms-announce-card">' +
            '<div class="lms-announce-head"><strong>' + escapeHtml(a.title) + '</strong>' +
            (a.pinned ? ' <span class="lms-badge lms-badge--published">Pinned</span>' : '') +
            '<span class="lms-meta"> · ' + escapeHtml((a.createdAt || '').slice(0, 10)) +
            ' · ' + escapeHtml(a.audience || 'employees') + '</span></div>' +
            '<p>' + escapeHtml(a.body) + '</p>' +
            (isAdmin() ? '<button type="button" class="btn btn-ghost btn-sm" data-lms-announce-delete="' + escapeHtml(a.id) + '">Delete</button>' : '') +
          '</article>';
        }).join('') : emptyState('No announcements yet.')) +
      '</div>';
  }

  function renderReports() {
    var el = document.getElementById('lms-reports');
    if (!el) return;
    var data = getData();
    var totalEnroll = data.enrollments.length;
    var completed = data.enrollments.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
    var inProgress = data.enrollments.filter(function (e) { return e.status === 'in_progress' || e.status === 'enrolled'; }).length;
    var failed = data.enrollments.filter(function (e) { return e.status === 'failed'; }).length;
    var scored = data.enrollments.filter(function (e) { return e.score != null; });
    var avgScore = scored.length
      ? Math.round(scored.reduce(function (sum, e) { return sum + Number(e.score); }, 0) / scored.length)
      : null;
    var byCourse = data.courses.map(function (c) {
      var ens = data.enrollments.filter(function (e) { return e.courseId === c.id; });
      var done = ens.filter(function (e) { return e.status === 'completed' || e.passed === true; }).length;
      return {
        id: c.id,
        title: c.title,
        type: c.type,
        audience: c.audience,
        enrollments: ens.length,
        completed: done,
        rate: ens.length ? Math.round((done / ens.length) * 100) : 0
      };
    });
    var activeByCourse = byCourse.filter(function (r) { return r.enrollments > 0; });
    var inductionRows = activeByCourse.filter(function (r) { return r.type === 'induction'; });
    var hiringRows = activeByCourse.filter(function (r) { return r.audience === 'applicant'; });
    var courseRows = activeByCourse.filter(function (r) {
      return r.type !== 'induction' && r.audience !== 'applicant';
    });
    var applicants = (data.applicants || []).slice().reverse();

    function completionTable(rows, emptyMessage, includeType) {
      var head = '<th>Course</th>' +
        (includeType ? '<th>Type</th>' : '') +
        '<th>Enrolled</th><th>Completed</th><th>Completion %</th>';
      var cols = includeType ? 5 : 4;
      var body = rows.length ? rows.map(function (r) {
        return '<tr><td>' + escapeHtml(r.title) + '</td>' +
          (includeType ? '<td>' + escapeHtml(typeLabel(r.type)) + '</td>' : '') +
          '<td>' + r.enrollments + '</td><td>' + r.completed + '</td><td>' + r.rate + '%</td></tr>';
      }).join('') : '<tr><td colspan="' + cols + '">' + escapeHtml(emptyMessage) + '</td></tr>';
      return '<div class="table-wrap"><table class="data-table"><thead><tr>' + head +
        '</tr></thead><tbody>' + body + '</tbody></table></div>';
    }

    if (!isAdmin()) {
      var mine = myEnrollments();
      el.innerHTML =
        '<div class="page-header"><h2>My progress</h2></div>' +
        '<div class="lms-metrics">' +
          metricHtml('Enrolled', mine.length) +
          metricHtml('Completed', mine.filter(function (e) { return e.status === 'completed' || e.passed; }).length, 'ok') +
          metricHtml('In progress', mine.filter(function (e) { return e.status === 'in_progress' || e.status === 'enrolled'; }).length) +
        '</div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Training</th><th>Progress</th><th>Status</th><th>Score</th></tr></thead><tbody>' +
        (mine.length ? mine.map(function (en) {
          var course = findCourse(en.courseId);
          return '<tr><td>' + escapeHtml(course ? course.title : '—') + '</td><td>' +
            escapeHtml(String(en.progressPercent || 0)) + '%</td><td>' + statusBadge(en.status) + '</td><td>' +
            (en.score != null ? escapeHtml(String(en.score)) + '%' : '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="4">No enrollments yet.</td></tr>') +
        '</tbody></table></div>';
      return;
    }

    el.innerHTML =
      '<div class="page-header"><h2>Tracking &amp; reporting</h2></div>' +
      '<div class="lms-metrics">' +
        metricHtml('Enrollments', totalEnroll) +
        metricHtml('Completed', completed, 'ok') +
        metricHtml('In progress', inProgress) +
        metricHtml('Failed', failed, failed ? 'warn' : '') +
        metricHtml('Avg score', avgScore != null ? avgScore + '%' : '—') +
        metricHtml('Certificates', (data.certificates || []).length, 'ok') +
        metricHtml('Exam attempts', (data.attempts || []).length) +
        metricHtml('Hiring applicants', applicants.length) +
      '</div>' +
      '<div class="module-table-panel"><h3>Courses</h3>' +
        completionTable(courseRows, 'No course enrollment activity yet.', true) +
      '</div>' +
      '<div class="module-table-panel"><h3>Induction</h3>' +
        completionTable(inductionRows, 'No induction enrollment activity yet.', false) +
      '</div>' +
      '<div class="module-table-panel"><h3>Hiring</h3>' +
        completionTable(hiringRows, 'No hiring exam enrollment activity yet.', false) +
        '<h4 style="margin:1.25rem 0 0.65rem">Applicant sessions</h4>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Applicant</th><th>Position</th><th>Exam</th><th>Status</th><th>Score</th><th>Date</th>' +
        '</tr></thead><tbody>' +
        (applicants.length ? applicants.map(function (a) {
          var course = findCourse(a.courseId);
          var when = (a.finishedAt || a.startedAt || a.createdAt || '').slice(0, 16).replace('T', ' ');
          return '<tr><td><strong>' + escapeHtml(a.fullName || '—') + '</strong>' +
            '<div class="lms-meta">' + escapeHtml(a.email || '') + '</div></td>' +
            '<td>' + escapeHtml(a.positionApplied || '—') + '</td>' +
            '<td>' + escapeHtml(course ? course.title : '—') + '</td>' +
            '<td>' + statusBadge(a.status) + '</td>' +
            '<td>' + (a.score != null ? escapeHtml(String(a.score)) + '%' : '—') + '</td>' +
            '<td>' + escapeHtml(when || '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="6">No hiring applicant sessions yet.</td></tr>') +
        '</tbody></table></div>' +
      '</div>' +
      '<div class="module-table-panel"><h3>Recent assessment attempts</h3>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Date</th><th>Learner</th><th>Course</th><th>Score</th><th>Result</th>' +
        '</tr></thead><tbody>' +
        ((data.attempts || []).length ? data.attempts.slice().reverse().slice(0, 25).map(function (a) {
          var course = findCourse(a.courseId);
          var en = data.enrollments.filter(function (e) { return e.id === a.enrollmentId; })[0];
          return '<tr><td>' + escapeHtml((a.finishedAt || '').slice(0, 16).replace('T', ' ')) + '</td>' +
            '<td>' + escapeHtml(en ? en.userName : a.userId) + '</td>' +
            '<td>' + escapeHtml(course ? course.title : '—') + '</td>' +
            '<td>' + escapeHtml(String(a.score)) + '%</td>' +
            '<td>' + statusBadge(a.passed ? 'passed' : 'failed') + '</td></tr>';
        }).join('') : '<tr><td colspan="5">No exam attempts yet.</td></tr>') +
        '</tbody></table></div></div>';
  }

  function renderCertificateList(certs, adminView) {
    if (!certs.length) return emptyState(adminView ? 'No certificates issued yet.' : 'No certificates yet. Complete a course to earn one.');
    return '<div class="lms-cert-list">' + certs.slice().reverse().map(function (c) {
      var course = findCourse(c.courseId);
      var expiresAt = resolveCertificateExpiry(c, course);
      var expired = isCertificateExpired(c, course);
      return '<div class="lms-cert-card">' +
        '<div><strong>' + escapeHtml(c.courseTitle) + '</strong>' +
        '<div class="lms-meta">' + escapeHtml(c.userName) + ' · ' + escapeHtml((c.issuedAt || '').slice(0, 10)) +
        ' · No. ' + escapeHtml(c.certificateNo) +
        (c.score != null ? ' · Score ' + escapeHtml(String(c.score)) + '%' : '') +
        ' · Expires ' + escapeHtml(expiresAt ? formatCertDate(expiresAt) : 'Never') +
        (expired ? ' · Expired' : '') +
        '</div></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-lms-cert-print="' + escapeHtml(c.id) + '">View / print</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderAdminCertificatesTable(certs) {
    if (!certs.length) return emptyState('No certificates issued yet.');
    var rows = certs.slice().sort(function (a, b) {
      return String(b.issuedAt || '').localeCompare(String(a.issuedAt || ''));
    });
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Certification No</th>' +
      '<th>Name</th>' +
      '<th>Course</th>' +
      '<th>Date</th>' +
      '<th>Score</th>' +
      '<th>Expiration Date</th>' +
      '<th>Status</th>' +
      '<th></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (c) {
        var course = findCourse(c.courseId);
        var expiresAt = resolveCertificateExpiry(c, course);
        var expired = isCertificateExpired(c, course);
        return '<tr>' +
          '<td><strong>' + escapeHtml(c.certificateNo || '—') + '</strong></td>' +
          '<td>' + escapeHtml(c.userName || '—') + '</td>' +
          '<td>' + escapeHtml(c.courseTitle || (course && course.title) || '—') + '</td>' +
          '<td>' + escapeHtml(formatCertDate(c.issuedAt)) + '</td>' +
          '<td>' + (c.score != null ? escapeHtml(String(c.score)) + '%' : '—') + '</td>' +
          '<td>' + escapeHtml(expiresAt ? formatCertDate(expiresAt) : 'Never') + '</td>' +
          '<td>' + (expired
            ? '<span class="lms-badge lms-badge--failed">Expired</span>'
            : '<span class="lms-badge lms-badge--published">Valid</span>') + '</td>' +
          '<td class="lms-row-actions">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-lms-cert-print="' + escapeHtml(c.id) + '">View / print</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderCertificates() {
    var el = document.getElementById('lms-certificates');
    if (!el) return;
    var data = getData();
    var u = currentUser();
    var certs = isAdmin()
      ? (data.certificates || [])
      : (data.certificates || []).filter(function (c) { return u && c.userId === u.id; });
    var validCount = certs.filter(function (c) { return !isCertificateExpired(c); }).length;
    var expiredCount = certs.length - validCount;
    el.innerHTML =
      '<div class="page-header"><h2>Certification</h2>' +
      '<p class="lms-hint">Certificates are issued automatically when learners complete training (if enabled in settings). Set certificate validity months on each course.</p></div>' +
      (isAdmin()
        ? '<div class="lms-metrics">' +
            metricHtml('Issued', certs.length) +
            metricHtml('Valid', validCount, 'ok') +
            metricHtml('Expired', expiredCount, expiredCount ? 'warn' : '') +
          '</div>' +
          '<div class="module-table-panel"><h3>All learner certifications</h3>' +
            renderAdminCertificatesTable(certs) +
          '</div>'
        : renderCertificateList(certs, false)) +
      '<div id="lms-certificate-print" class="lms-certificate-sheet hidden"></div>';
  }

  function formatCertDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      var raw = String(iso).slice(0, 10);
      var parts = raw.split('-');
      if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
      return raw;
    }
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function performanceRating(score) {
    if (score == null || score === '') return 'Completed';
    var n = Number(score);
    if (isNaN(n)) return 'Completed';
    if (n >= 90) return 'Excellent';
    if (n >= 80) return 'Very good';
    if (n >= 70) return 'Good';
    return 'Satisfactory';
  }

  function formatCertScore(score) {
    if (score == null || score === '') return '—';
    var n = Number(score);
    if (isNaN(n)) return String(score);
    return Math.round(n) + '/100';
  }

  function formatReferenceNo(no) {
    var raw = String(no || '').replace(/^AND-?/i, '').replace(/\D/g, '');
    if (raw.length >= 9) {
      return raw.slice(0, 3) + ' ' + raw.slice(3, 6) + ' ' + raw.slice(6, 9);
    }
    if (raw.length >= 6) {
      return raw.slice(0, 3) + ' ' + raw.slice(3, 6) + (raw.length > 6 ? ' ' + raw.slice(6) : '');
    }
    return String(no || '—');
  }

  function signatureScript(name) {
    return escapeHtml(name || 'Authorized Signer');
  }

  function resolveCompanyBrand(lmsSettings) {
    var company = {};
    try {
      if (window.AccountingData && typeof window.AccountingData.getCompanySettings === 'function') {
        company = window.AccountingData.getCompanySettings() || {};
      }
    } catch (e) {}
    var name = (company.companyName || '').trim() ||
      ((lmsSettings && lmsSettings.companyLmsName) || '').trim() ||
      'Andeco Learning';
    // Certificates always use the login logo asset.
    return { name: name, logo: 'assets/login_logo.png' };
  }

  function buildCertificateHtml(cert, settings, course) {
    var data = getData();
    var s = settings || data.settings || {};
    var brand = resolveCompanyBrand(s);
    var org = brand.name;
    var title = s.certificateTitle || 'Certificate of Completion';
    var courseTitle = (cert && cert.courseTitle) || (course && course.title) || 'Course';
    var courseInstructor = resolveCourseInstructor(course, data);
    var signerName = s.certificateSigner || 'Training Manager';
    var signerTitle = 'Training Manager';
    if (signerName === courseInstructor.name) {
      signerName = org;
      signerTitle = 'Program Director';
    }
    var verifyText = [
      'Certificate ' + (cert.certificateNo || ''),
      cert.userName || '',
      courseTitle,
      formatCertDate(cert.issuedAt)
    ].join(' | ');
    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=' +
      encodeURIComponent(verifyText);
    var expiresAt = resolveCertificateExpiry(cert, course);

    return '' +
      '<div class="lms-certificate" role="document" aria-label="Certificate of completion">' +
        '<div class="lms-certificate-body">' +
          '<div class="lms-certificate-brand">' +
            '<div class="lms-certificate-logo-wrap">' +
              '<img class="lms-certificate-logo" src="' + escapeHtml(brand.logo) + '" alt="' + escapeHtml(org) + ' logo" onerror="this.style.display=\'none\'">' +
            '</div>' +
            '<div class="lms-certificate-company">' +
              '<span class="lms-certificate-company-label">Presented by</span>' +
              '<strong>' + escapeHtml(String(org).toUpperCase()) + '</strong>' +
            '</div>' +
          '</div>' +
          '<header class="lms-certificate-header">' +
            '<span class="lms-certificate-accent" aria-hidden="true"></span>' +
            '<div>' +
              '<h1>' + escapeHtml(String(title).toUpperCase()) + '</h1>' +
              '<p class="lms-certificate-course">' + escapeHtml(String(courseTitle).toUpperCase()) + '</p>' +
            '</div>' +
          '</header>' +
          '<p class="lms-certificate-awarded">Awarded to</p>' +
          '<h2 class="lms-certificate-name">' + escapeHtml(String(cert.userName || '').toUpperCase()) + '</h2>' +
          '<p class="lms-certificate-statement">Has meritoriously completed the “' +
            escapeHtml(courseTitle) + '” course, based on ' + escapeHtml(org) + '.</p>' +
          '<div class="lms-certificate-signs">' +
            signatureBlockHtml(courseInstructor) +
            signatureBlockHtml({ name: signerName, title: signerTitle, signatureImage: '' }) +
            '<div class="lms-certificate-qr">' +
              '<img src="' + qrSrc + '" alt="Certificate verification QR code" width="120" height="120" loading="eager">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<footer class="lms-certificate-footer">' +
          '<div><strong>' + escapeHtml(formatCertDate(cert.issuedAt)) + '</strong><span>Date of completion</span></div>' +
          '<div><strong>' + escapeHtml(formatCertScore(cert.score)) + '</strong><span>Score</span></div>' +
          '<div><strong>' + escapeHtml(expiresAt ? formatCertDate(expiresAt) : 'No expiry') + '</strong><span>Expiration date</span></div>' +
          '<div><strong>' + escapeHtml(formatReferenceNo(cert.certificateNo)) + '</strong><span>Reference number</span></div>' +
        '</footer>' +
      '</div>';
  }

  function printCertificate(certId) {
    var data = getData();
    var cert = (data.certificates || []).filter(function (c) { return c.id === certId; })[0];
    if (!cert) return;
    var course = findCourse(cert.courseId);
    var host = document.getElementById('lms-certificate-print') || document.createElement('div');
    host.id = 'lms-certificate-print';
    host.className = 'lms-certificate-sheet';
    host.setAttribute('data-print-page', 'certificate-landscape');
    host.innerHTML =
      '<div class="lms-certificate-toolbar no-print">' +
        '<button type="button" class="btn btn-primary" id="lms-cert-do-print">Print</button>' +
        '<button type="button" class="btn btn-ghost" id="lms-cert-close">Close</button>' +
      '</div>' +
      buildCertificateHtml(cert, data.settings, course);
    // Keep sheet at body root so print sizing is exactly one landscape page.
    if (host.parentNode !== document.body) document.body.appendChild(host);
    host.classList.remove('hidden');
    document.body.classList.add('lms-cert-open');
    document.documentElement.classList.add('lms-cert-open');

    function closeSheet() {
      host.classList.add('hidden');
      document.body.classList.remove('lms-cert-open');
      document.documentElement.classList.remove('lms-cert-open');
      host.innerHTML = '';
    }

    function runPrint() {
      var prevTitle = document.title;
      document.title = 'Certificate - ' + (cert.userName || 'Learner');
      document.documentElement.classList.add('lms-printing-cert');
      window.print();
      document.documentElement.classList.remove('lms-printing-cert');
      document.title = prevTitle;
    }

    var printBtn = host.querySelector('#lms-cert-do-print');
    var closeBtn = host.querySelector('#lms-cert-close');
    if (printBtn) printBtn.onclick = runPrint;
    if (closeBtn) closeBtn.onclick = closeSheet;

    // Auto-open print after QR image has a moment to load
    setTimeout(function () {
      if (!host.classList.contains('hidden')) runPrint();
    }, 500);
  }

  function renderPurchases() {
    var el = document.getElementById('lms-purchases');
    if (!el) return;
    if (!isAdmin()) {
      el.innerHTML = emptyState('Purchase requests are managed by administrators.');
      return;
    }
    var data = getData();
    el.innerHTML =
      '<div class="page-header"><h2>Public course purchases</h2></div>' +
      '<p class="lms-hint">Visitors submit purchase requests from the public catalog (<code>#lms-public</code>). Mark paid to create learner access notes.</p>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Date</th><th>Buyer</th><th>Course</th><th>Amount</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      (data.purchases.length ? data.purchases.slice().reverse().map(function (p) {
        var course = data.courses.filter(function (c) { return c.id === p.courseId; })[0];
        return '<tr><td>' + escapeHtml((p.createdAt || '').slice(0, 10)) + '</td>' +
          '<td><strong>' + escapeHtml(p.buyerName) + '</strong><div class="lms-meta">' + escapeHtml(p.buyerEmail) +
          (p.buyerPhone ? ' · ' + escapeHtml(p.buyerPhone) : '') +
          (p.company ? '<br>' + escapeHtml(p.company) : '') + '</div></td>' +
          '<td>' + escapeHtml(course ? course.title : '—') + '</td>' +
          '<td>' + escapeHtml(formatMoney(p.amount, p.currency)) + '</td>' +
          '<td>' + statusBadge(p.status) + '</td>' +
          '<td class="lms-row-actions">' +
            (p.status === 'pending' ? '<button type="button" class="btn btn-primary btn-sm" data-lms-purchase-paid="' + escapeHtml(p.id) + '">Mark paid</button>' : '') +
            (p.status !== 'cancelled' ? '<button type="button" class="btn btn-ghost btn-sm" data-lms-purchase-cancel="' + escapeHtml(p.id) + '">Cancel</button>' : '') +
          '</td></tr>';
      }).join('') : '<tr><td colspan="6">No purchase requests yet.</td></tr>') +
      '</tbody></table></div>';
  }

  function renderHiring() {
    var el = document.getElementById('lms-hiring');
    if (!el) return;
    if (!isAdmin()) {
      el.innerHTML = emptyState('Hiring exam sessions are managed by administrators.');
      return;
    }
    var data = getData();
    var examCourses = data.courses.filter(function (c) {
      return c.published && (c.audience === 'applicant' || c.type === 'exam') && c.exam.enabled;
    });
    el.innerHTML =
      '<div class="page-header"><h2>Hiring exam sessions</h2></div>' +
      '<p class="lms-hint">Invite applicants to take a pre-hire exam via the public careers portal (<code>#lms-careers</code>).</p>' +
      '<div class="invoice-form-container" style="margin-bottom:1.5rem"><form id="lms-applicant-form" class="invoice-form">' +
        '<div class="form-section"><h3>Invite applicant</h3><div class="form-row">' +
          '<div class="form-group"><label>Full name</label><input name="fullName" required></div>' +
          '<div class="form-group"><label>Email</label><input name="email" type="email" required></div>' +
          '<div class="form-group"><label>Phone</label><input name="phone"></div>' +
          '<div class="form-group"><label>Position applied</label><input name="positionApplied" required></div>' +
          '<div class="form-group"><label>Exam</label><select name="courseId" required>' +
            '<option value="">Select exam…</option>' +
            examCourses.map(function (c) {
              return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.title) + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-group full-width"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>' +
        '</div><div class="form-actions"><button type="submit" class="btn btn-primary">Create access code</button></div></div>' +
      '</form></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Applicant</th><th>Position</th><th>Exam</th><th>Access code</th><th>Status</th><th>Score</th><th></th>' +
      '</tr></thead><tbody>' +
      (data.applicants.length ? data.applicants.slice().reverse().map(function (a) {
        var course = data.courses.filter(function (c) { return c.id === a.courseId; })[0];
        return '<tr><td><strong>' + escapeHtml(a.fullName) + '</strong><div class="lms-meta">' + escapeHtml(a.email) + '</div></td>' +
          '<td>' + escapeHtml(a.positionApplied) + '</td>' +
          '<td>' + escapeHtml(course ? course.title : '—') + '</td>' +
          '<td><code>' + escapeHtml(a.accessCode) + '</code></td>' +
          '<td>' + statusBadge(a.status) + '</td>' +
          '<td>' + (a.score != null ? escapeHtml(String(a.score)) + '%' : '—') + '</td>' +
          '<td class="lms-row-actions">' +
            (a.status === 'passed' ? '<button type="button" class="btn btn-primary btn-sm" data-lms-applicant-status="' + escapeHtml(a.id) + ':hired">Mark hired</button>' : '') +
            (a.status !== 'rejected' && a.status !== 'hired' ? '<button type="button" class="btn btn-ghost btn-sm" data-lms-applicant-status="' + escapeHtml(a.id) + ':rejected">Reject</button>' : '') +
          '</td></tr>';
      }).join('') : '<tr><td colspan="7">No applicants yet. Create a hiring exam in the library (audience: Hiring applicants), then invite someone here.</td></tr>') +
      '</tbody></table></div>';
  }

  function renderSettings() {
    var el = document.getElementById('lms-settings');
    if (!el) return;
    if (!isAdmin()) {
      el.innerHTML =
        '<div class="page-header"><h2>Mobile access</h2></div>' +
        '<div class="module-table-panel">' +
          '<p>The LMS is responsive for phones and tablets. Use your usual login URL on mobile browsers.</p>' +
          '<p class="lms-hint">Tip: add the site to your home screen for quick access to My learning, announcements, and certificates.</p>' +
        '</div>';
      return;
    }
    var s = getData().settings;
    el.innerHTML =
      '<div class="page-header"><h2>LMS settings</h2></div>' +
      '<div class="invoice-form-container"><form id="lms-settings-form" class="invoice-form">' +
        '<div class="form-section"><div class="form-row">' +
          '<div class="form-group"><label>LMS display name</label><input name="companyLmsName" value="' + escapeHtml(s.companyLmsName) + '"></div>' +
          '<div class="form-group"><label>Default currency</label><input name="currency" value="' + escapeHtml(s.currency) + '"></div>' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="publicCatalogEnabled"' + (s.publicCatalogEnabled ? ' checked' : '') + '> Enable public course catalog</label></div>' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="careersPortalEnabled"' + (s.careersPortalEnabled ? ' checked' : '') + '> Enable careers / hiring exam portal</label></div>' +
          '<div class="form-group"><label class="admin-check-label"><input type="checkbox" name="autoIssueCertificates"' + (s.autoIssueCertificates !== false ? ' checked' : '') + '> Auto-issue certificates on completion</label></div>' +
          '<div class="form-group"><label>Certificate title</label><input name="certificateTitle" value="' + escapeHtml(s.certificateTitle || '') + '"></div>' +
          '<div class="form-group"><label>Certificate signer</label><input name="certificateSigner" value="' + escapeHtml(s.certificateSigner || '') + '"></div>' +
          '<div class="form-group full-width"><label>Certificate company logo URL (optional override)</label>' +
            '<input name="companyLogo" value="' + escapeHtml((s.companyLogo && String(s.companyLogo).indexOf('data:image') === 0) ? '' : (s.companyLogo || '')) + '" placeholder="Uses CRM company logo by default">' +
            ((s.companyLogo && String(s.companyLogo).indexOf('data:image') === 0)
              ? '<p class="lms-hint">An uploaded LMS logo is currently saved. Paste a URL to replace it, or clear and save to use the CRM company logo.</p>'
              : '<p class="lms-hint">By default certificates use the company name and logo from CRM Company settings.</p>') +
          '</div>' +
          '<div class="form-group full-width"><label>Upload certificate logo override</label>' +
            '<input type="file" id="lms-settings-logo-file" accept="image/*">' +
            '<div class="lms-signature-preview' + (s.companyLogo ? ' has-image' : '') + '" id="lms-settings-logo-preview">' +
              (s.companyLogo
                ? '<img src="' + escapeHtml(s.companyLogo) + '" alt="Certificate logo preview">'
                : '<span>Using CRM company logo / default</span>') +
            '</div>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="lms-settings-logo-clear" style="margin-top:0.5rem">Clear LMS logo override</button>' +
          '</div>' +
          '<div class="form-group full-width"><label>Public purchase instructions</label><textarea name="purchaseInstructions" rows="3">' + escapeHtml(s.purchaseInstructions) + '</textarea></div>' +
          '<div class="form-group full-width"><label>Careers portal intro</label><textarea name="careersIntro" rows="3">' + escapeHtml(s.careersIntro) + '</textarea></div>' +
        '</div></div>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">Save settings</button></div>' +
      '</form>' +
      '<div class="lms-hint" style="margin-top:1rem">' +
        '<p><strong>Public links</strong></p>' +
        '<p>Course catalog: add <code>#lms-public</code> to your app URL</p>' +
        '<p>Hiring exams: add <code>#lms-careers</code> to your app URL</p>' +
        '<p><strong>Mobile access:</strong> the LMS layout adapts to phones and tablets.</p>' +
      '</div></div>';
    bindSettingsLogoControls();
  }

  function bindSettingsLogoControls() {
    var form = document.getElementById('lms-settings-form');
    var file = document.getElementById('lms-settings-logo-file');
    var preview = document.getElementById('lms-settings-logo-preview');
    var clearBtn = document.getElementById('lms-settings-logo-clear');
    var urlInput = form ? form.querySelector('[name="companyLogo"]') : null;
    if (!form || !file || !preview) return;

    function setPreview(src) {
      if (src) {
        preview.classList.add('has-image');
        preview.innerHTML = '<img src="' + src + '" alt="Certificate logo preview">';
      } else {
        preview.classList.remove('has-image');
        preview.innerHTML = '<span>Using CRM company logo / default</span>';
      }
    }

    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        alert('Please choose a logo image under 1.5 MB.');
        file.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        form.setAttribute('data-logo-upload', dataUrl);
        form.removeAttribute('data-logo-cleared');
        if (urlInput) urlInput.value = '';
        setPreview(dataUrl);
      };
      reader.readAsDataURL(f);
    };

    if (urlInput) {
      urlInput.oninput = function () {
        var typed = urlInput.value.trim();
        form.removeAttribute('data-logo-upload');
        form.removeAttribute('data-logo-cleared');
        setPreview(typed);
      };
    }

    if (clearBtn) {
      clearBtn.onclick = function () {
        form.setAttribute('data-logo-cleared', '1');
        form.removeAttribute('data-logo-upload');
        file.value = '';
        if (urlInput) urlInput.value = '';
        setPreview('');
      };
    }
  }

  function renderPlayer(el) {
    var en = findEnrollment(viewState.enrollmentId);
    var course = en ? findCourse(en.courseId) : null;
    if (!en || !course) {
      viewState.mode = 'list';
      renderMyLearning();
      return;
    }
    if (viewState.mode === 'exam') {
      if (!canAccessCourseExam(course, en)) {
        viewState.mode = 'player';
      } else {
        renderExamPlayer(el, course, en);
        return;
      }
    }
    var lesson = course.lessons.filter(function (l) { return l.id === viewState.lessonId; })[0] || course.lessons[0];
    var completed = en.completedLessonIds || [];
    var examUnlocked = canAccessCourseExam(course, en);
    var left = remainingLessonsCount(course, en);
    el.innerHTML =
      '<div class="page-header"><h2>' + escapeHtml(course.title) + '</h2>' +
      '<div class="header-actions"><button type="button" class="btn btn-ghost" id="lms-player-back">← My learning</button></div></div>' +
      '<div class="lms-player">' +
        '<aside class="lms-player-nav">' +
          '<h3>Contents</h3>' +
          '<ol>' + course.lessons.map(function (l) {
            var done = completed.indexOf(l.id) !== -1;
            return '<li><button type="button" class="lms-lesson-link' + (lesson && lesson.id === l.id ? ' active' : '') +
              '" data-lms-lesson="' + escapeHtml(l.id) + '">' + (done ? '✓ ' : '') + escapeHtml(l.title) + '</button></li>';
          }).join('') + '</ol>' +
          (course.exam.enabled
            ? (examUnlocked
                ? '<button type="button" class="btn btn-primary" id="lms-start-exam" style="width:100%;margin-top:1rem">Take exam</button>'
                : '<button type="button" class="btn btn-secondary" id="lms-exam-locked" style="width:100%;margin-top:1rem" disabled title="Finish all lessons to unlock the exam">Exam locked</button>' +
                  '<p class="lms-hint">Finish ' + left + ' more lesson' + (left === 1 ? '' : 's') + ' to unlock the exam.</p>')
            : '') +
        '</aside>' +
        '<div class="lms-player-content module-table-panel">' +
          (lesson ? '<h3>' + escapeHtml(lesson.title) + '</h3>' +
            '<p class="lms-meta">' + escapeHtml(CONTENT_TYPES[lesson.contentType] || 'Text / procedure') +
            (lesson.durationMinutes ? ' · ' + escapeHtml(String(lesson.durationMinutes)) + ' min' : '') + '</p>' +
            embedMediaHtml(lesson) +
            '<div class="lms-lesson-body">' + formatContent(lesson.content) + '</div>' +
            '<div class="lms-actions">' +
              '<button type="button" class="btn btn-primary" data-lms-complete-lesson="' + escapeHtml(lesson.id) + '">Mark complete &amp; continue</button>' +
            '</div>' : emptyState('This training has no lessons yet.')) +
        '</div>' +
      '</div>';
  }

  function formatContent(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
  }

  function renderExamPlayer(el, course, enrollment) {
    clearExamTimer();
    el.setAttribute('data-exam-course-id', course.id);
    el.setAttribute('data-exam-enrollment-id', enrollment ? enrollment.id : '');
    el.setAttribute('data-exam-applicant-id', viewState.applicantId || '');

    if (enrollment && hasUsedExamAttempt(enrollment)) {
      var passed = enrollment.passed === true;
      el.innerHTML =
        '<div class="page-header"><h2>Exam result</h2>' +
        '<div class="header-actions"><button type="button" class="btn btn-ghost" id="lms-exam-back">← Back to course</button></div></div>' +
        '<div class="invoice-form-container">' +
          '<p class="lms-hint">This exam allows only one attempt. Your result is final.</p>' +
          '<div class="lms-exam-result ' + (passed ? 'is-pass' : 'is-fail') + '">' +
            '<strong>' + (passed ? 'Passed' : 'Not passed') + '</strong>' +
            '<p>Score: ' + escapeHtml(String(enrollment.score != null ? enrollment.score : '—')) +
              '% · Required: ' + escapeHtml(String(course.exam.passScore || 70)) + '%</p>' +
          '</div></div>';
      return;
    }

    var examStarted = enrollment ? !!enrollment.examStartedAt : !!viewState.examLive;
    if (!examStarted) {
      var mins = examTimeLimitMinutes(course);
      var qCount = (course.exam.questions || []).length;
      el.innerHTML =
        '<div class="page-header"><h2>Exam: ' + escapeHtml(course.title) + '</h2>' +
        '<div class="header-actions"><button type="button" class="btn btn-ghost" id="lms-continue-study">Continue study</button></div></div>' +
        '<div class="invoice-form-container lms-exam-cover">' +
          '<p class="lms-hint">Read the instructions carefully before you begin.</p>' +
          '<ul class="lms-exam-instructions">' +
            '<li>You have <strong>one attempt only</strong>. Once you start, you cannot retake this exam.</li>' +
            '<li>Pass score: <strong>' + escapeHtml(String(course.exam.passScore || 70)) + '%</strong></li>' +
            '<li>Questions: <strong>' + qCount + '</strong></li>' +
            '<li>Time limit: <strong>' + (mins ? (mins + ' minute' + (mins === 1 ? '' : 's')) : 'No time limit set') + '</strong>' +
              (mins ? '. A countdown starts when you click Start Exam.' : '') + '</li>' +
            '<li>When time runs out, your answers are submitted automatically.</li>' +
          '</ul>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-primary" id="lms-begin-exam">Start Exam</button>' +
            '<button type="button" class="btn btn-secondary" id="lms-continue-study-2">Continue study</button>' +
          '</div></div>';
      return;
    }

    if (enrollment && enrollment.examStartedAt) {
      var endsPending = examEndsAtMs(course, enrollment);
      if (endsPending != null && Date.now() >= endsPending) {
        autoSubmitExpiredExam(course, enrollment, el);
        return;
      }
    }

    var questions = (course.exam.questions || []).slice();
    if (course.exam.shuffle) {
      for (var i = questions.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = questions[i]; questions[i] = questions[j]; questions[j] = tmp;
      }
    }
    var minsLive = examTimeLimitMinutes(course);
    var startedIso = enrollment ? enrollment.examStartedAt : viewState.examStartedAt;
    var endsAt = examEndsAtMs(course, enrollment, startedIso);
    var remaining = endsAt != null ? Math.max(0, endsAt - Date.now()) : null;
    el.innerHTML =
      '<div class="page-header"><h2>Exam: ' + escapeHtml(course.title) + '</h2>' +
      '<div class="header-actions">' +
        (minsLive && endsAt != null
          ? '<div class="lms-exam-timer" id="lms-exam-timer" data-ends-at="' + endsAt + '" role="timer" aria-live="polite">' +
              '<span>Time left</span><strong id="lms-exam-timer-value">' + formatCountdown(remaining) + '</strong></div>'
          : '') +
        (enrollment ? '<button type="button" class="btn btn-ghost" id="lms-exam-back">← Back to course</button>' : '') +
      '</div></div>' +
      '<div class="invoice-form-container"><form id="lms-exam-form" class="invoice-form">' +
        '<p class="lms-hint">Pass score: ' + escapeHtml(String(course.exam.passScore || 70)) + '%' +
        ' · One attempt' +
        (minsLive ? ' · Time limit: ' + escapeHtml(String(minsLive)) + ' min' : '') + '</p>' +
        questions.map(function (q, qi) {
          return '<div class="lms-editor-block"><p><strong>Q' + (qi + 1) + '.</strong> ' + escapeHtml(q.prompt) +
            ' <span class="lms-meta">(' + escapeHtml(String(q.points || 1)) + ' pt)</span></p>' +
            (q.options || []).map(function (o) {
              var inputType = q.type === 'multi' ? 'checkbox' : 'radio';
              return '<label class="lms-option-row"><input type="' + inputType + '" name="q_' + escapeHtml(q.id) +
                '" value="' + escapeHtml(o.id) + '"> ' + escapeHtml(o.text) + '</label>';
            }).join('') +
          '</div>';
        }).join('') +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">Submit exam</button></div>' +
      '</form></div>';
    el._examQuestionOrder = questions.map(function (q) { return q.id; });
    setupModuleExamTimer(el, course, enrollment);
  }

  function setupModuleExamTimer(el, course, enrollment) {
    var timer = document.getElementById('lms-exam-timer');
    var valueEl = document.getElementById('lms-exam-timer-value');
    if (!timer || !valueEl) return;
    var endsAt = Number(timer.getAttribute('data-ends-at'));
    if (!endsAt) return;
    function tick() {
      var left = endsAt - Date.now();
      valueEl.textContent = formatCountdown(left);
      timer.classList.toggle('is-urgent', left <= 60 * 1000);
      if (left <= 0) {
        clearExamTimer();
        autoSubmitExpiredExam(course, enrollment, el);
      }
    }
    tick();
    examTimerHandle = setInterval(tick, 1000);
  }

  function autoSubmitExpiredExam(course, enrollment, el) {
    var form = el ? el.querySelector('#lms-exam-form') : document.getElementById('lms-exam-form');
    if (!form) {
      // Build empty submit through submitExam pathway
      var host = el || document.getElementById('lms-my-learning');
      if (!host) return;
      host.innerHTML = '<form id="lms-exam-form"></form>';
      host.setAttribute('data-exam-course-id', course.id);
      host.setAttribute('data-exam-enrollment-id', enrollment ? enrollment.id : '');
      host.setAttribute('data-exam-applicant-id', viewState.applicantId || '');
      form = host.querySelector('#lms-exam-form');
    }
    submitExam(form, true);
  }

  function beginModuleExam() {
    var en = findEnrollment(viewState.enrollmentId);
    var course = en ? findCourse(en.courseId) : (viewState.applicantId ? findCourse((getData().applicants.filter(function (a) {
      return a.id === viewState.applicantId;
    })[0] || {}).courseId) : null);
    if (!course) return;
    if (en) {
      if (!canAccessCourseExam(course, en)) {
        alert('Finish all lessons before taking the exam.');
        viewState.mode = 'player';
        renderMyLearning();
        return;
      }
      if (hasUsedExamAttempt(en)) {
        viewState.mode = 'exam';
        renderMyLearning();
        return;
      }
      var mins = examTimeLimitMinutes(course);
      if (!window.confirm('You have only one attempt' +
        (mins ? ' and ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' on the clock' : '') +
        '. Start the exam now?')) return;
      var data = getData();
      var target = data.enrollments.filter(function (x) { return x.id === en.id; })[0];
      if (!target) return;
      target.examStartedAt = new Date().toISOString();
      if (target.status === 'enrolled') target.status = 'in_progress';
      saveData(data);
    } else {
      var minsA = examTimeLimitMinutes(course);
      if (!window.confirm('You have only one attempt' +
        (minsA ? ' and ' + minsA + ' minute' + (minsA === 1 ? '' : 's') + ' on the clock' : '') +
        '. Start the exam now?')) return;
      viewState.examLive = true;
      viewState.examStartedAt = new Date().toISOString();
    }
    viewState.mode = 'exam';
    if (viewState.applicantId) renderCareersPortal();
    else renderMyLearning();
  }

  /* ---------- Public portals ---------- */

  function renderPublicCatalog() {
    var screen = document.getElementById('lms-public-screen');
    var root = document.getElementById('lms-public-root');
    if (!screen || !root) return;
    var data = getData();
    var settings = data.settings;
    document.getElementById('lms-public-brand').textContent = settings.companyLmsName || 'Andeco Learning';

    if (!settings.publicCatalogEnabled) {
      root.innerHTML = '<div class="lms-public-card"><h2>Catalog unavailable</h2><p>The public course catalog is currently disabled.</p></div>';
      return;
    }

    if (viewState.publicCourseId) {
      var course = findCourse(viewState.publicCourseId);
      if (!course || !course.published || (course.audience !== 'public' && course.audience !== 'all')) {
        viewState.publicCourseId = null;
      } else {
        var detailMins = Number(course.durationMinutes) || 0;
        if (!detailMins && Array.isArray(course.lessons)) {
          detailMins = course.lessons.reduce(function (sum, l) { return sum + (Number(l.durationMinutes) || 0); }, 0);
        }
        var detailDuration = detailMins
          ? (detailMins >= 60 ? (Math.floor(detailMins / 60) + 'h' + (detailMins % 60 ? ' ' + (detailMins % 60) + 'm' : '')) : detailMins + ' min')
          : 'Self-paced';
        root.innerHTML =
          '<button type="button" class="btn btn-ghost" id="lms-public-back">← Back to catalog</button>' +
          '<div class="lms-public-card">' +
            (course.coverImage
              ? '<div class="lms-public-detail-photo"><img src="' + escapeHtml(course.coverImage) + '" alt="' + escapeHtml(course.title) + '"></div>'
              : '') +
            '<h2>' + escapeHtml(course.title) + '</h2>' +
            '<p class="lms-meta">' + escapeHtml(typeLabel(course.type)) + ' · ' + escapeHtml(course.category) +
            ' · ' + escapeHtml(detailDuration) +
            ' · ' + escapeHtml(formatMoney(course.price, course.currency || settings.currency)) + '</p>' +
            '<p>' + escapeHtml(course.description) + '</p>' +
            '<p class="lms-hint">' + escapeHtml(settings.purchaseInstructions) + '</p>' +
            '<form id="lms-purchase-form" class="invoice-form">' +
              '<div class="form-row">' +
                '<div class="form-group"><label>Full name</label><input name="buyerName" required></div>' +
                '<div class="form-group"><label>Email</label><input name="buyerEmail" type="email" required></div>' +
                '<div class="form-group"><label>Phone</label><input name="buyerPhone"></div>' +
                '<div class="form-group"><label>Company</label><input name="company"></div>' +
                '<div class="form-group full-width"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>' +
              '</div>' +
              '<div class="form-actions"><button type="submit" class="btn btn-primary">Request course access</button></div>' +
            '</form>' +
          '</div>';
        return;
      }
    }

    var courses = data.courses.filter(function (c) {
      return c.published && (c.audience === 'public' || c.audience === 'all');
    });
    var publicAnnouncements = (data.announcements || []).filter(function (a) {
      return a.audience === 'public' || a.audience === 'all';
    }).slice(0, 3);
    root.innerHTML =
      '<div class="lms-public-hero-copy"><p>Browse training courses available to visitors and partners.</p>' +
      '<p><button type="button" class="btn btn-secondary btn-sm" data-go-login>← Back to login</button></p></div>' +
      (publicAnnouncements.length ? '<div class="lms-announce-list" style="margin-bottom:1rem">' +
        publicAnnouncements.map(function (a) {
          return '<article class="lms-announce-card"><strong>' + escapeHtml(a.title) + '</strong><p>' + escapeHtml(a.body) + '</p></article>';
        }).join('') + '</div>' : '') +
      (courses.length ? '<div class="lms-public-grid">' + courses.map(function (c) {
        var mins = Number(c.durationMinutes) || 0;
        if (!mins && Array.isArray(c.lessons)) {
          mins = c.lessons.reduce(function (sum, l) { return sum + (Number(l.durationMinutes) || 0); }, 0);
        }
        var durationLabel = mins ? (mins >= 60 ? (Math.floor(mins / 60) + 'h' + (mins % 60 ? ' ' + (mins % 60) + 'm' : '')) : mins + ' min') : 'Self-paced';
        var letter = String(c.title || 'C').charAt(0).toUpperCase();
        return '<article class="lms-public-card lms-public-card--media">' +
          '<div class="lms-public-card-photo' + (c.coverImage ? '' : ' is-placeholder') + '">' +
            (c.coverImage
              ? '<img src="' + String(c.coverImage).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" alt="' + escapeHtml(c.title) + '" loading="lazy">'
              : '<span aria-hidden="true">' + escapeHtml(letter) + '</span>') +
          '</div>' +
          '<div class="lms-public-card-body">' +
            '<h3>' + escapeHtml(c.title) + '</h3>' +
            '<div class="lms-public-card-meta">' +
              '<span class="lms-public-card-meta-item"><em>Category</em>' + escapeHtml(c.category || 'General') + '</span>' +
              '<span class="lms-public-card-meta-item"><em>Duration</em>' + escapeHtml(durationLabel) + '</span>' +
            '</div>' +
            '<div class="lms-public-card-footer">' +
              '<strong>' + escapeHtml(formatMoney(c.price, c.currency || settings.currency)) + '</strong>' +
              '<button type="button" class="btn btn-primary" data-lms-public-buy="' + escapeHtml(c.id) + '">Buy / request</button>' +
            '</div>' +
          '</div></article>';
      }).join('') + '</div>' : '<div class="lms-public-card"><p>No public courses are published yet.</p></div>');
  }

  function renderCareersPortal() {
    var root = document.getElementById('lms-careers-root');
    if (!root) return;
    var data = getData();
    var settings = data.settings;
    document.getElementById('lms-careers-brand').textContent = (settings.companyLmsName || 'Andeco Learning') + ' · Careers';

    if (!settings.careersPortalEnabled) {
      root.innerHTML = '<div class="lms-public-card"><h2>Portal unavailable</h2><p>The hiring exam portal is currently disabled.</p></div>';
      return;
    }

    if (viewState.mode === 'exam' && viewState.applicantId) {
      var applicant = data.applicants.filter(function (a) { return a.id === viewState.applicantId; })[0];
      var course = applicant ? findCourse(applicant.courseId) : null;
      if (!applicant || !course) {
        viewState.mode = 'list';
        viewState.applicantId = null;
      } else {
        root.innerHTML = '<div class="lms-public-card" id="lms-careers-exam-host"></div>';
        renderExamPlayer(document.getElementById('lms-careers-exam-host'), course, null);
        var host = document.getElementById('lms-careers-exam-host');
        host.setAttribute('data-exam-applicant-id', applicant.id);
        host.setAttribute('data-exam-course-id', course.id);
        var back = host.querySelector('#lms-exam-back');
        if (back) back.style.display = 'none';
        return;
      }
    }

    root.innerHTML =
      '<div class="lms-public-card">' +
        '<h2>Candidate assessment</h2>' +
        '<p>' + escapeHtml(settings.careersIntro) + '</p>' +
        '<form id="lms-careers-access-form" class="invoice-form">' +
          '<div class="form-row">' +
            '<div class="form-group"><label>Access code</label><input name="accessCode" required placeholder="e.g. AB12CD34" style="text-transform:uppercase"></div>' +
            '<div class="form-group"><label>Email (must match invitation)</label><input name="email" type="email" required></div>' +
          '</div>' +
          '<div class="form-actions"><button type="submit" class="btn btn-primary">Start exam</button></div>' +
        '</form>' +
        '<p id="lms-careers-error" class="login-error hidden"></p>' +
      '</div>';
  }

  /* ---------- Main render ---------- */

  function setSection(sectionId) {
    currentSection = sectionId || 'dashboard';
    if (currentSection !== 'library') {
      if (viewState.mode === 'editor') {
        syncDraftFromEditor();
        viewState.mode = 'list';
        clearEditorDraft();
      }
    }
    if (currentSection !== 'my-learning') {
      if (viewState.mode === 'player' || (viewState.mode === 'exam' && !viewState.applicantId)) {
        viewState.mode = 'list';
        viewState.enrollmentId = null;
        viewState.lessonId = null;
      }
    }
  }

  function render(options) {
    options = options || {};
    // Background shared-data polls must not wipe open LMS forms.
    if (!options.force && isInteractiveLmsFormOpen()) {
      if (isCourseEditorOpen()) syncDraftFromEditor();
      return;
    }
    document.querySelectorAll('#page-lms .lms-section-panel').forEach(function (p) {
      var match = p.getAttribute('data-section') === currentSection;
      p.style.display = match ? 'block' : 'none';
      p.classList.toggle('active', match);
    });
    if (currentSection === 'dashboard') renderDashboard();
    else if (currentSection === 'my-learning') renderMyLearning();
    else if (currentSection === 'library') renderLibrary(options);
    else if (currentSection === 'learners') renderLearners();
    else if (currentSection === 'announcements') renderAnnouncements();
    else if (currentSection === 'reports') renderReports();
    else if (currentSection === 'certificates') renderCertificates();
    else if (currentSection === 'purchases') renderPurchases();
    else if (currentSection === 'hiring') renderHiring();
    else if (currentSection === 'settings') renderSettings();
  }

  function showPublicScreen(which) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.add('hidden');
    });
    var idScreen = which === 'careers' ? 'lms-careers-screen' : 'lms-public-screen';
    var el = document.getElementById(idScreen);
    if (el) el.classList.remove('hidden');
    if (which === 'careers') renderCareersPortal();
    else renderPublicCatalog();
  }

  function resetPublicViews() {
    viewState.publicCourseId = null;
    viewState.applicantId = null;
    if (viewState.mode === 'exam' && !viewState.enrollmentId) viewState.mode = 'list';
    var pub = document.getElementById('lms-public-screen');
    var car = document.getElementById('lms-careers-screen');
    if (pub) pub.classList.add('hidden');
    if (car) car.classList.add('hidden');
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    var page = document.getElementById('page-lms');
    if (page && page.getAttribute('data-lms-bound') !== '1') {
      page.setAttribute('data-lms-bound', '1');
      page.addEventListener('click', onPageClick);
      page.addEventListener('submit', onPageSubmit);
      page.addEventListener('change', onPageChange);
      page.addEventListener('input', function (e) {
        if (!e.target) return;
        if (e.target.id === 'lms-library-search') {
          if (viewState.mode !== 'editor') renderLibrary({ force: true });
          return;
        }
        if (e.target.closest('#lms-course-form')) syncDraftFromEditor();
      });
    }

    var pub = document.getElementById('lms-public-screen');
    if (pub && pub.getAttribute('data-lms-bound') !== '1') {
      pub.setAttribute('data-lms-bound', '1');
      pub.addEventListener('click', onPublicClick);
      pub.addEventListener('submit', onPublicSubmit);
    }

    var car = document.getElementById('lms-careers-screen');
    if (car && car.getAttribute('data-lms-bound') !== '1') {
      car.setAttribute('data-lms-bound', '1');
      car.addEventListener('click', onCareersClick);
      car.addEventListener('submit', onCareersSubmit);
    }
  }

  function goLoginFromPublic(e) {
    if (!e.target.closest('[data-go-login]')) return;
    e.preventDefault();
    resetPublicViews();
    if (typeof window.navigateTo === 'function') window.navigateTo('login');
    else window.location.hash = 'login';
  }

  function onPageClick(e) {
    var t = e.target.closest('[data-lms-goto],[data-lms-enroll],[data-lms-play],[data-lms-edit],[data-lms-duplicate],[data-lms-delete],[data-lms-lesson],[data-lms-complete-lesson],[data-lms-purchase-paid],[data-lms-purchase-cancel],[data-lms-applicant-status],[data-lms-announce-delete],[data-lms-cert-print],[data-remove-lesson],[data-remove-question],[data-add-option],#lms-add-course,#lms-editor-cancel,#lms-editor-cancel-2,#lms-add-lesson,#lms-add-question,#lms-player-back,#lms-start-exam,#lms-exam-back,#lms-begin-exam,#lms-continue-study,#lms-continue-study-2,#lms-open-portal-btn-dash');
    if (!t) return;

    if (t.id === 'lms-open-portal-btn-dash') {
      if (window.LmsPortal && window.LmsPortal.open) window.LmsPortal.open();
      return;
    }

    if (t.id === 'lms-add-course') {
      viewState.mode = 'editor';
      viewState.courseId = null;
      clearEditorDraft();
      renderLibrary({ force: true });
      return;
    }
    if (t.id === 'lms-editor-cancel' || t.id === 'lms-editor-cancel-2') {
      viewState.mode = 'list';
      viewState.courseId = null;
      clearEditorDraft();
      renderLibrary({ force: true });
      return;
    }
    if (t.id === 'lms-add-lesson') {
      var course = syncDraftFromEditor() || viewState.draftCourse || normalizeCourse({});
      course.lessons.push({ id: id('lsn'), title: 'New lesson', content: '', order: course.lessons.length, durationMinutes: 0 });
      viewState.draftCourse = course;
      viewState.courseId = course.id;
      renderLessonsEditor(course.lessons);
      return;
    }
    if (t.id === 'lms-add-question') {
      var c2 = syncDraftFromEditor() || viewState.draftCourse || normalizeCourse({});
      c2.exam.questions.push({
        id: id('q'), prompt: '', type: 'single', points: 1,
        options: [{ id: id('opt'), text: 'Option A' }, { id: id('opt'), text: 'Option B' }],
        correctOptionIds: []
      });
      viewState.draftCourse = c2;
      viewState.courseId = c2.id;
      renderQuestionsEditor(c2.exam.questions);
      return;
    }
    if (t.hasAttribute('data-remove-lesson')) {
      var c3 = syncDraftFromEditor() || viewState.draftCourse;
      if (!c3) return;
      var li = Number(t.getAttribute('data-remove-lesson'));
      c3.lessons.splice(li, 1);
      viewState.draftCourse = c3;
      renderLessonsEditor(c3.lessons);
      return;
    }
    if (t.hasAttribute('data-remove-question')) {
      var c4 = syncDraftFromEditor() || viewState.draftCourse;
      if (!c4) return;
      var qi = Number(t.getAttribute('data-remove-question'));
      c4.exam.questions.splice(qi, 1);
      viewState.draftCourse = c4;
      renderQuestionsEditor(c4.exam.questions);
      return;
    }
    if (t.hasAttribute('data-add-option')) {
      var c5 = syncDraftFromEditor() || viewState.draftCourse;
      if (!c5) return;
      var qIdx = Number(t.getAttribute('data-add-option'));
      if (c5.exam.questions[qIdx]) {
        c5.exam.questions[qIdx].options.push({ id: id('opt'), text: '' });
        viewState.draftCourse = c5;
        renderQuestionsEditor(c5.exam.questions);
      }
      return;
    }
    if (t.hasAttribute('data-lms-goto')) {
      var sec = t.getAttribute('data-lms-goto');
      if (window.setLmsSection) window.setLmsSection(sec);
      else { setSection(sec); render(); }
      var link = document.querySelector('#sidebar-module-sections .sidebar-section-link[data-section="' + sec + '"]');
      if (link) {
        document.querySelectorAll('#sidebar-module-sections .sidebar-section-link').forEach(function (l) { l.classList.remove('active'); });
        link.classList.add('active');
      }
      return;
    }
    if (t.hasAttribute('data-lms-enroll')) {
      var cid = t.getAttribute('data-lms-enroll');
      var en = ensureEnrollment(cid, 'self');
      if (en) {
        viewState.mode = 'player';
        viewState.enrollmentId = en.id;
        viewState.lessonId = null;
        if (window.setLmsSection) window.setLmsSection('my-learning');
        else { setSection('my-learning'); render(); }
      }
      return;
    }
    if (t.hasAttribute('data-lms-play')) {
      viewState.mode = 'player';
      viewState.enrollmentId = t.getAttribute('data-lms-play');
      viewState.lessonId = null;
      renderMyLearning();
      return;
    }
    if (t.hasAttribute('data-lms-edit')) {
      viewState.mode = 'editor';
      viewState.courseId = t.getAttribute('data-lms-edit');
      clearEditorDraft();
      renderLibrary({ force: true });
      return;
    }
    if (t.hasAttribute('data-lms-duplicate')) {
      var src = findCourse(t.getAttribute('data-lms-duplicate'));
      if (!src) return;
      var data = getData();
      var copy = normalizeCourse(JSON.parse(JSON.stringify(src)));
      copy.id = id('crs');
      copy.title = src.title + ' (copy)';
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      copy.lessons = copy.lessons.map(function (l) { l.id = id('lsn'); return l; });
      copy.exam.questions = copy.exam.questions.map(function (q) {
        var map = {};
        q.options = q.options.map(function (o) {
          var nid = id('opt');
          map[o.id] = nid;
          return { id: nid, text: o.text };
        });
        q.id = id('q');
        q.correctOptionIds = (q.correctOptionIds || []).map(function (oid) { return map[oid] || oid; });
        return q;
      });
      data.courses.push(copy);
      saveData(data);
      renderLibrary({ force: true });
      return;
    }
    if (t.hasAttribute('data-lms-delete')) {
      if (!confirm('Delete this training item? Enrollments will remain but the course will be unavailable.')) return;
      var dataDel = getData();
      var delId = t.getAttribute('data-lms-delete');
      dataDel.courses = dataDel.courses.filter(function (c) { return c.id !== delId; });
      saveData(dataDel);
      renderLibrary({ force: true });
      return;
    }
    if (t.hasAttribute('data-lms-lesson')) {
      viewState.lessonId = t.getAttribute('data-lms-lesson');
      renderMyLearning();
      return;
    }
    if (t.hasAttribute('data-lms-complete-lesson')) {
      var lessonId = t.getAttribute('data-lms-complete-lesson');
      var en2 = findEnrollment(viewState.enrollmentId);
      var course2 = en2 ? findCourse(en2.courseId) : null;
      if (!en2 || !course2) return;
      var done = (en2.completedLessonIds || []).slice();
      if (done.indexOf(lessonId) === -1) done.push(lessonId);
      updateEnrollmentProgress(en2.id, done, course2);
      var idx = course2.lessons.findIndex(function (l) { return l.id === lessonId; });
      if (idx >= 0 && idx < course2.lessons.length - 1) viewState.lessonId = course2.lessons[idx + 1].id;
      renderMyLearning();
      return;
    }
    if (t.id === 'lms-player-back') {
      viewState.mode = 'list';
      viewState.enrollmentId = null;
      renderMyLearning();
      return;
    }
    if (t.id === 'lms-start-exam') {
      var enExam = findEnrollment(viewState.enrollmentId);
      var courseExam = enExam ? findCourse(enExam.courseId) : null;
      if (!courseExam || !enExam || !canAccessCourseExam(courseExam, enExam)) {
        alert('Finish all lessons before taking the exam.');
        viewState.mode = 'player';
        renderMyLearning();
        return;
      }
      viewState.mode = 'exam';
      renderMyLearning();
      return;
    }
    if (t.id === 'lms-begin-exam') {
      beginModuleExam();
      return;
    }
    if (t.id === 'lms-continue-study' || t.id === 'lms-continue-study-2') {
      if (viewState.applicantId) {
        viewState.mode = 'list';
        viewState.applicantId = null;
        viewState.examLive = false;
        viewState.examStartedAt = null;
        renderCareersPortal();
        return;
      }
      viewState.mode = 'player';
      renderMyLearning();
      return;
    }
    if (t.id === 'lms-exam-back') {
      viewState.mode = 'player';
      renderMyLearning();
      return;
    }
    if (t.hasAttribute('data-lms-purchase-paid') || t.hasAttribute('data-lms-purchase-cancel')) {
      var dataP = getData();
      var pid = t.getAttribute('data-lms-purchase-paid') || t.getAttribute('data-lms-purchase-cancel');
      var purchase = dataP.purchases.filter(function (p) { return p.id === pid; })[0];
      if (!purchase) return;
      purchase.status = t.hasAttribute('data-lms-purchase-paid') ? 'paid' : 'cancelled';
      if (purchase.status === 'paid') purchase.paidAt = new Date().toISOString();
      saveData(dataP);
      renderPurchases();
      return;
    }
    if (t.hasAttribute('data-lms-applicant-status')) {
      var parts = t.getAttribute('data-lms-applicant-status').split(':');
      var dataA = getData();
      var app = dataA.applicants.filter(function (a) { return a.id === parts[0]; })[0];
      if (!app) return;
      app.status = parts[1];
      saveData(dataA);
      renderHiring();
      return;
    }
    if (t.hasAttribute('data-lms-announce-delete')) {
      var dataAn = getData();
      var aid = t.getAttribute('data-lms-announce-delete');
      dataAn.announcements = (dataAn.announcements || []).filter(function (a) { return a.id !== aid; });
      saveData(dataAn);
      renderAnnouncements();
      return;
    }
    if (t.hasAttribute('data-lms-cert-print')) {
      printCertificate(t.getAttribute('data-lms-cert-print'));
    }
  }

  function onPageSubmit(e) {
    if (e.target && e.target.id === 'lms-course-form') {
      e.preventDefault();
      var course = collectEditorCourse();
      if (!course || !course.title) {
        alert('Please enter a training title before saving.');
        return;
      }
      var data = getData();
      var idx = data.courses.findIndex(function (c) { return c.id === course.id; });
      if (idx >= 0) data.courses[idx] = course;
      else data.courses.push(course);
      saveData(data);
      viewState.mode = 'list';
      viewState.courseId = null;
      clearEditorDraft();
      renderLibrary({ force: true });
      return;
    }
    if (e.target && e.target.id === 'lms-profile-form') {
      e.preventDefault();
      var fdP = new FormData(e.target);
      var profileUserId = String(fdP.get('userId') || '');
      if (!profileUserId) return;
      var existingProfile = getLearnerProfile(profileUserId) || {};
      var sigVal = String(fdP.get('signatureImage') || '').trim();
      var sigCleared = e.target.getAttribute('data-signature-cleared') === '1';
      var patch = {
        role: String(fdP.get('role') || 'learner'),
        department: String(fdP.get('department') || '').trim(),
        title: String(fdP.get('title') || '').trim(),
        notes: String(fdP.get('notes') || '').trim()
      };
      if (sigVal) patch.signatureImage = sigVal;
      else if (sigCleared) patch.signatureImage = '';
      else if (existingProfile.signatureImage) patch.signatureImage = existingProfile.signatureImage;
      upsertLearnerProfile(profileUserId, patch);
      renderLearners();
      return;
    }
    if (e.target && e.target.id === 'lms-assign-form') {
      e.preventDefault();
      var fd = new FormData(e.target);
      var userId = String(fd.get('userId') || '');
      var courseId = String(fd.get('courseId') || '');
      var user = getUsers().filter(function (u) { return u.id === userId; })[0];
      if (!user || !courseId) return;
      var data2 = getData();
      var exists = data2.enrollments.some(function (en) { return en.userId === userId && en.courseId === courseId; });
      if (!exists) {
        data2.enrollments.push({
          id: id('enr'),
          courseId: courseId,
          userId: userId,
          userName: user.displayName || user.username,
          source: 'assigned',
          status: 'enrolled',
          progressPercent: 0,
          completedLessonIds: [],
          startedAt: new Date().toISOString(),
          completedAt: '',
          score: null,
          passed: null
        });
        if (!getLearnerProfile(userId)) {
          data2.learnerProfiles = data2.learnerProfiles || [];
          data2.learnerProfiles.push({ userId: userId, role: 'learner', department: '', notes: '' });
        }
        saveData(data2);
      }
      renderLearners();
      return;
    }
    if (e.target && e.target.id === 'lms-announce-form') {
      e.preventDefault();
      var fdN = new FormData(e.target);
      var dataN = getData();
      var uN = currentUser();
      dataN.announcements = dataN.announcements || [];
      dataN.announcements.push({
        id: id('ann'),
        title: String(fdN.get('title') || '').trim(),
        body: String(fdN.get('body') || '').trim(),
        audience: String(fdN.get('audience') || 'employees'),
        pinned: !!e.target.querySelector('[name="pinned"]').checked,
        createdAt: new Date().toISOString(),
        createdBy: uN ? uN.name : 'Admin'
      });
      saveData(dataN);
      renderAnnouncements();
      return;
    }
    if (e.target && e.target.id === 'lms-applicant-form') {
      e.preventDefault();
      var fdA = new FormData(e.target);
      var data3 = getData();
      var applicant = {
        id: id('app'),
        fullName: String(fdA.get('fullName') || '').trim(),
        email: String(fdA.get('email') || '').trim().toLowerCase(),
        phone: String(fdA.get('phone') || '').trim(),
        positionApplied: String(fdA.get('positionApplied') || '').trim(),
        courseId: String(fdA.get('courseId') || ''),
        accessCode: accessCode(),
        status: 'invited',
        score: null,
        attemptId: '',
        notes: String(fdA.get('notes') || '').trim(),
        createdAt: new Date().toISOString(),
        completedAt: ''
      };
      data3.applicants.push(applicant);
      saveData(data3);
      alert('Applicant invited.\nAccess code: ' + applicant.accessCode + '\nShare #lms-careers and this code with the candidate.');
      renderHiring();
      return;
    }
    if (e.target && e.target.id === 'lms-settings-form') {
      e.preventDefault();
      var fdS = new FormData(e.target);
      var dataS = getData();
      var existingLogo = (dataS.settings && dataS.settings.companyLogo) || '';
      var typedLogo = String(fdS.get('companyLogo') || '').trim();
      var uploadedLogo = e.target.getAttribute('data-logo-upload') || '';
      var clearedLogo = e.target.getAttribute('data-logo-cleared') === '1';
      var nextLogo = '';
      if (uploadedLogo) nextLogo = uploadedLogo;
      else if (clearedLogo) nextLogo = '';
      else if (typedLogo) nextLogo = typedLogo;
      else nextLogo = existingLogo;
      dataS.settings = Object.assign({}, dataS.settings, {
        companyLmsName: String(fdS.get('companyLmsName') || '').trim() || defaultSettings.companyLmsName,
        currency: String(fdS.get('currency') || 'EUR').trim() || 'EUR',
        publicCatalogEnabled: !!e.target.querySelector('[name="publicCatalogEnabled"]').checked,
        careersPortalEnabled: !!e.target.querySelector('[name="careersPortalEnabled"]').checked,
        autoIssueCertificates: !!e.target.querySelector('[name="autoIssueCertificates"]').checked,
        certificateTitle: String(fdS.get('certificateTitle') || '').trim() || defaultSettings.certificateTitle,
        certificateSigner: String(fdS.get('certificateSigner') || '').trim() || defaultSettings.certificateSigner,
        companyLogo: nextLogo,
        purchaseInstructions: String(fdS.get('purchaseInstructions') || ''),
        careersIntro: String(fdS.get('careersIntro') || '')
      });
      saveData(dataS);
      alert('LMS settings saved.');
      renderSettings();
      return;
    }
    if (e.target && e.target.id === 'lms-exam-form') {
      e.preventDefault();
      if (!window.confirm('Submit your exam now? You only get one attempt.')) return;
      submitExam(e.target, false);
    }
  }

  function onPageChange(e) {
    if (!e.target) return;
    if (e.target.id === 'lms-library-filter') {
      if (viewState.mode !== 'editor') renderLibrary({ force: true });
      return;
    }
    if (e.target.closest('#lms-course-form')) syncDraftFromEditor();
  }

  function submitExam(form, autoExpired) {
    if (examSubmitLock) return;
    var host = form.closest('[data-exam-course-id]') || form.parentElement;
    var courseId = (host && host.getAttribute('data-exam-course-id')) || '';
    var enrollmentId = (host && host.getAttribute('data-exam-enrollment-id')) || viewState.enrollmentId || '';
    var applicantId = (host && host.getAttribute('data-exam-applicant-id')) || viewState.applicantId || '';
    var course = findCourse(courseId);
    if (!course) return;

    // Enrolled learners must finish all lessons first; hiring applicants are exempt.
    if (enrollmentId && !applicantId) {
      var enGate = findEnrollment(enrollmentId);
      if (!canAccessCourseExam(course, enGate)) {
        alert('Finish all lessons before taking the exam.');
        viewState.mode = 'player';
        renderMyLearning();
        return;
      }
      if (hasUsedExamAttempt(enGate)) {
        alert('You have already used your one exam attempt.');
        viewState.mode = 'exam';
        renderMyLearning();
        return;
      }
      if (!enGate.examStartedAt) {
        viewState.mode = 'exam';
        renderMyLearning();
        return;
      }
    }

    examSubmitLock = true;
    clearExamTimer();
    var answers = {};
    (course.exam.questions || []).forEach(function (q) {
      var nodes = form.querySelectorAll('[name="q_' + q.id + '"]:checked');
      answers[q.id] = Array.prototype.map.call(nodes, function (n) { return n.value; });
    });
    var result = scoreAttempt(course, answers);
    var data = getData();
    var startedAt = '';
    if (enrollmentId) {
      var enStart = data.enrollments.filter(function (x) { return x.id === enrollmentId; })[0];
      startedAt = (enStart && enStart.examStartedAt) || '';
    } else {
      startedAt = viewState.examStartedAt || '';
    }
    var attempt = {
      id: id('att'),
      enrollmentId: enrollmentId || '',
      courseId: courseId,
      userId: (currentUser() || {}).id || applicantId || 'guest',
      answers: answers,
      score: result.percent,
      passed: result.passed,
      autoExpired: !!autoExpired,
      startedAt: startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString()
    };
    data.attempts.push(attempt);

    if (enrollmentId) {
      var en = data.enrollments.filter(function (x) { return x.id === enrollmentId; })[0];
      if (en) {
        en.score = result.percent;
        en.passed = result.passed;
        en.status = result.passed ? 'completed' : 'failed';
        en.progressPercent = 100;
        en.completedAt = new Date().toISOString();
        if (result.passed) maybeIssueCertificate(data, en, course);
      }
    }
    if (applicantId) {
      var app = data.applicants.filter(function (a) { return a.id === applicantId; })[0];
      if (app) {
        app.score = result.percent;
        app.passed = result.passed;
        app.status = result.passed ? 'passed' : 'failed';
        app.attemptId = attempt.id;
        app.completedAt = new Date().toISOString();
      }
    }
    saveData(data);
    examSubmitLock = false;
    viewState.examLive = false;
    viewState.examStartedAt = null;

    var msg = autoExpired
      ? ('Time is up. Your exam was submitted automatically. Score: ' + result.percent + '%.')
      : (result.passed
          ? 'Passed with ' + result.percent + '% (required ' + result.passScore + '%).'
          : 'Score ' + result.percent + '%. Required pass score is ' + result.passScore + '%.');
    alert(msg);

    if (applicantId) {
      viewState.mode = 'list';
      viewState.applicantId = null;
      renderCareersPortal();
      var root = document.getElementById('lms-careers-root');
      if (root) {
        root.innerHTML = '<div class="lms-public-card"><h2>Exam submitted</h2><p>' + escapeHtml(msg) +
          '</p><p>Our HR team will review your result.</p>' +
          '<button type="button" class="btn btn-secondary" data-go-login>Back to login</button></div>';
      }
      return;
    }
    viewState.mode = 'exam';
    renderMyLearning();
  }

  function onPublicClick(e) {
    var goLogin = e.target.closest('[data-go-login]');
    if (goLogin) {
      e.preventDefault();
      resetPublicViews();
      if (typeof window.navigateTo === 'function') window.navigateTo('login');
      else window.location.hash = 'login';
      return;
    }
    var buy = e.target.closest('[data-lms-public-buy]');
    if (buy) {
      viewState.publicCourseId = buy.getAttribute('data-lms-public-buy');
      renderPublicCatalog();
      return;
    }
    if (e.target.id === 'lms-public-back') {
      viewState.publicCourseId = null;
      renderPublicCatalog();
    }
  }

  function onPublicSubmit(e) {
    if (!e.target || e.target.id !== 'lms-purchase-form') return;
    e.preventDefault();
    var course = findCourse(viewState.publicCourseId);
    if (!course) return;
    var fd = new FormData(e.target);
    var data = getData();
    data.purchases.push({
      id: id('pur'),
      courseId: course.id,
      buyerName: String(fd.get('buyerName') || '').trim(),
      buyerEmail: String(fd.get('buyerEmail') || '').trim().toLowerCase(),
      buyerPhone: String(fd.get('buyerPhone') || '').trim(),
      company: String(fd.get('company') || '').trim(),
      amount: course.price,
      currency: course.currency || data.settings.currency || 'EUR',
      status: 'pending',
      notes: String(fd.get('notes') || '').trim(),
      createdAt: new Date().toISOString(),
      enrollmentId: ''
    });
    saveData(data);
    viewState.publicCourseId = null;
    var root = document.getElementById('lms-public-root');
    if (root) {
      root.innerHTML = '<div class="lms-public-card"><h2>Request received</h2>' +
        '<p>Thank you. We have received your request for <strong>' + escapeHtml(course.title) +
        '</strong>. Our team will contact you with payment and access details.</p>' +
        '<button type="button" class="btn btn-primary" id="lms-public-back">Back to catalog</button></div>';
    }
  }

  function onCareersClick(e) {
    var begin = e.target.closest('#lms-begin-exam');
    if (begin) {
      beginModuleExam();
      return;
    }
    var cont = e.target.closest('#lms-continue-study, #lms-continue-study-2');
    if (cont) {
      viewState.mode = 'list';
      viewState.applicantId = null;
      viewState.examLive = false;
      viewState.examStartedAt = null;
      renderCareersPortal();
      return;
    }
    goLoginFromPublic(e);
  }

  function onCareersSubmit(e) {
    if (e.target && e.target.id === 'lms-exam-form') {
      e.preventDefault();
      if (!window.confirm('Submit your exam now? You only get one attempt.')) return;
      submitExam(e.target, false);
      return;
    }
    if (!e.target || e.target.id !== 'lms-careers-access-form') return;
    e.preventDefault();
    var fd = new FormData(e.target);
    var code = String(fd.get('accessCode') || '').trim().toUpperCase();
    var email = String(fd.get('email') || '').trim().toLowerCase();
    var data = getData();
    var applicant = data.applicants.filter(function (a) {
      return a.accessCode === code && a.email === email;
    })[0];
    var err = document.getElementById('lms-careers-error');
    if (!applicant) {
      if (err) { err.textContent = 'Invalid access code or email.'; err.classList.remove('hidden'); }
      return;
    }
    if (applicant.status === 'passed' || applicant.status === 'failed' || applicant.status === 'hired' || applicant.status === 'rejected') {
      if (err) { err.textContent = 'This assessment is already completed (status: ' + applicant.status + ').'; err.classList.remove('hidden'); }
      return;
    }
    applicant.status = 'started';
    saveData(data);
    viewState.mode = 'exam';
    viewState.applicantId = applicant.id;
    viewState.examLive = false;
    viewState.examStartedAt = null;
    renderCareersPortal();
  }

  function init() {
    bindEvents();
  }

  window.LmsModule = {
    init: init,
    setSection: setSection,
    render: render,
    isBusy: isInteractiveLmsFormOpen,
    showPublicScreen: showPublicScreen,
    resetPublicViews: resetPublicViews,
    renderPublicCatalog: renderPublicCatalog,
    renderCareersPortal: renderCareersPortal,
    getData: getData,
    saveData: saveData,
    normalizeData: normalizeData,
    normalizeDiscussion: normalizeDiscussion,
    printCertificate: printCertificate,
    buildCertificateHtml: buildCertificateHtml,
    STORAGE_KEY: STORAGE_KEY
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
