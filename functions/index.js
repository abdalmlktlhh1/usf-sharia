const { onCall, HttpsError } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions/options');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const ROLE_LABELS = {
  owner: 'المسؤول الأول للموقع',
  website_manager: 'مسؤول الموقع الإلكتروني',
  scientific_college_manager: 'مسؤول اللجنة العلمية بالكلية',
  scientific_college_deputy: 'نائب مسؤول اللجنة العلمية بالكلية',
  scientific_level_manager: 'مسؤول اللجنة العلمية بالمستوى',
  scientific_level_deputy: 'نائب مسؤول اللجنة العلمية بالمستوى',
  university_forum_manager: 'مسؤول ملتقى الطالب الجامعي بالكلية',
  university_forum_deputy: 'نائب مسؤول ملتقى الطالب الجامعي بالكلية',
  media_manager: 'مسؤول اللجنة الإعلامية بالكلية',
  media_deputy: 'نائب مسؤول اللجنة الإعلامية بالكلية',
  student: 'طالب'
};

const PERMISSIONS = {
  owner: ['*'],
  website_manager: ['users.view','users.create','users.edit','users.suspend','courses.manage','exams.manage','results.view','content.manage','settings.manage','audit.view'],
  scientific_college_manager: ['courses.manage','exams.manage','results.view','content.manage'],
  scientific_college_deputy: ['exams.manage','results.view','content.create'],
  scientific_level_manager: ['exams.manage','results.view','content.create'],
  scientific_level_deputy: ['results.view','content.create'],
  university_forum_manager: ['content.manage'],
  university_forum_deputy: ['content.create'],
  media_manager: ['content.media','content.manage'],
  media_deputy: ['content.media','content.create'],
  student: []
};

const CONTENT_COLLECTIONS = new Set(['announcements','reports','activities','media']);
const CONTENT_PERMS = {
  announcements: 'content.manage',
  reports: 'content.manage',
  activities: 'content.manage',
  media: 'content.media'
};

function uidFromRequest(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولًا.');
  return request.auth.uid;
}

async function getProfile(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'ملف المستخدم غير موجود.');
  const data = snap.data();
  if (data.active !== true) throw new HttpsError('permission-denied', 'الحساب موقوف.');
  return { uid, ...data };
}

function hasPermission(profile, permission) {
  if (profile.role === 'owner') return true;
  return (PERMISSIONS[profile.role] || []).includes(permission);
}

async function requirePermission(request, permission) {
  const uid = uidFromRequest(request);
  const profile = await getProfile(uid);
  if (!hasPermission(profile, permission)) {
    throw new HttpsError('permission-denied', 'ليس لديك صلاحية لتنفيذ هذه العملية.');
  }
  return profile;
}

async function audit(profile, action, target, details = '') {
  await db.collection('auditLogs').add({
    userId: profile.uid,
    userName: profile.name || '',
    action,
    target,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

function clean(v, max = 5000) {
  return String(v ?? '').trim().slice(0, max);
}

function validateLevel(level) {
  if (!['1','2','3','4','all'].includes(String(level))) {
    throw new HttpsError('invalid-argument', 'المستوى غير صحيح.');
  }
}

function canManageScope(profile, level) {
  level = String(level || 'all');
  if (profile.role === 'owner' || profile.role === 'website_manager' || profile.role === 'scientific_college_manager') return true;
  if (['scientific_level_manager','scientific_level_deputy'].includes(profile.role)) return level === String(profile.level);
  if (['university_forum_manager','university_forum_deputy','media_manager','media_deputy'].includes(profile.role)) return true;
  return false;
}

exports.adminListUsers = onCall(async request => {
  const profile = await requirePermission(request, 'users.view');
  const out = [];
  let result = await auth.listUsers(1000);
  const profiles = await Promise.all(result.users.map(u => db.doc(`users/${u.uid}`).get()));
  result.users.forEach((u, i) => {
    const p = profiles[i].exists ? profiles[i].data() : {};
    out.push({
      uid: u.uid,
      name: p.name || u.displayName || '',
      email: u.email || '',
      phone: p.phone || u.phoneNumber || '',
      role: p.role || 'student',
      roleLabel: ROLE_LABELS[p.role] || 'طالب',
      level: String(p.level || '1'),
      active: p.active !== false && u.disabled !== true,
      verified: !!u.emailVerified,
      createdAt: p.createdAt || null,
      lastSignInAt: u.metadata?.lastSignInTime || null
    });
  });
  await audit(profile, 'USERS_LIST', 'users', 'عرض قائمة المستخدمين');
  return out;
});

exports.adminCreateUser = onCall(async request => {
  const profile = await requirePermission(request, 'users.create');
  const data = request.data || {};
  const name = clean(data.name, 120);
  const email = clean(data.email, 254).toLowerCase();
  const password = String(data.password || '');
  const role = String(data.role || 'student');
  const level = String(data.level || '1');
  validateLevel(level);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    throw new HttpsError('invalid-argument', 'أكمل الاسم والبريد وكلمة المرور (8 أحرف على الأقل).');
  }
  if (!ROLE_LABELS[role]) throw new HttpsError('invalid-argument', 'الدور غير صحيح.');
  if (role === 'owner' && profile.role !== 'owner') throw new HttpsError('permission-denied', 'لا يمكن إنشاء مالك آخر.');
  const record = await auth.createUser({ email, password, displayName: name });
  await db.doc(`users/${record.uid}`).set({
    name, email, phone: clean(data.phone, 30), role, level, active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await auth.setCustomUserClaims(record.uid, { role, level });
  await audit(profile, 'USER_CREATE', record.uid, `إنشاء ${email}`);
  return { ok: true, uid: record.uid };
});

exports.adminSetUserStatus = onCall(async request => {
  const profile = await requirePermission(request, 'users.suspend');
  const uid = clean(request.data?.uid, 128);
  const active = Boolean(request.data?.active);
  if (!uid) throw new HttpsError('invalid-argument', 'المستخدم غير محدد.');
  const targetSnap = await db.doc(`users/${uid}`).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
  const target = targetSnap.data();
  if (target.role === 'owner') throw new HttpsError('permission-denied', 'لا يمكن إيقاف المالك.');
  await auth.updateUser(uid, { disabled: !active });
  await db.doc(`users/${uid}`).update({ active, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await audit(profile, active ? 'USER_ACTIVATE' : 'USER_SUSPEND', uid, active ? 'تفعيل الحساب' : 'إيقاف الحساب');
  return { ok: true };
});

exports.adminSetUserRole = onCall(async request => {
  const profile = await requirePermission(request, 'users.roles');
  if (profile.role !== 'owner') throw new HttpsError('permission-denied', 'تغيير الأدوار متاح للمالك فقط.');
  const uid = clean(request.data?.uid, 128);
  const role = clean(request.data?.role, 80);
  const level = clean(request.data?.level || '1', 10);
  if (!uid || !ROLE_LABELS[role]) throw new HttpsError('invalid-argument', 'بيانات الدور غير صحيحة.');
  validateLevel(level);
  const targetSnap = await db.doc(`users/${uid}`).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
  const target = targetSnap.data();
  if (target.role === 'owner') throw new HttpsError('permission-denied', 'لا يمكن تغيير دور المالك.');
  await db.doc(`users/${uid}`).update({ role, level, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await auth.setCustomUserClaims(uid, { role, level });
  await audit(profile, 'USER_ROLE_CHANGE', uid, `${role} / ${level}`);
  return { ok: true };
});

exports.adminDeleteUser = onCall(async request => {
  const profile = await requirePermission(request, 'users.delete');
  if (profile.role !== 'owner') throw new HttpsError('permission-denied', 'الحذف متاح للمالك فقط.');
  const uid = clean(request.data?.uid, 128);
  const targetSnap = await db.doc(`users/${uid}`).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
  const target = targetSnap.data();
  if (target.role === 'owner') throw new HttpsError('permission-denied', 'لا يمكن حذف المالك.');
  await auth.deleteUser(uid);
  await db.doc(`users/${uid}`).delete();
  await audit(profile, 'USER_DELETE', uid, 'حذف الحساب');
  return { ok: true };
});

exports.createCourse = onCall(async request => {
  const profile = await requirePermission(request, 'courses.manage');
  const data = request.data || {};
  const level = clean(data.level, 10);
  validateLevel(level === 'all' ? 'all' : level);
  if (!canManageScope(profile, level)) throw new HttpsError('permission-denied', 'لا يمكنك إدارة هذا المستوى.');
  const name = clean(data.name, 180);
  if (!name) throw new HttpsError('invalid-argument', 'اسم المقرر مطلوب.');
  const ref = db.collection('courses').doc();
  await ref.set({
    name,
    level,
    description: clean(data.description, 1000),
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    authorId: profile.uid
  });
  await audit(profile, 'COURSE_CREATE', ref.id, name);
  return { ok: true, id: ref.id };
});

exports.updateCourse = onCall(async request => {
  const profile = await requirePermission(request, 'courses.manage');
  const id = clean(request.data?.id, 128);
  const snap = await db.doc(`courses/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'المقرر غير موجود.');
  const level = clean(request.data?.level ?? snap.data().level, 10);
  if (!canManageScope(profile, level)) throw new HttpsError('permission-denied', 'لا يمكنك إدارة هذا المستوى.');
  await db.doc(`courses/${id}`).update({
    name: clean(request.data?.name ?? snap.data().name, 180),
    level,
    description: clean(request.data?.description ?? snap.data().description, 1000),
    active: request.data?.active === undefined ? snap.data().active : Boolean(request.data.active),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await audit(profile, 'COURSE_UPDATE', id, 'تحديث مقرر');
  return { ok: true };
});

exports.createExam = onCall(async request => {
  const profile = await requirePermission(request, 'exams.manage');
  const data = request.data || {};
  const courseId = clean(data.courseId, 128);
  const course = await db.doc(`courses/${courseId}`).get();
  if (!course.exists) throw new HttpsError('not-found', 'المقرر غير موجود.');
  if (!canManageScope(profile, course.data().level)) throw new HttpsError('permission-denied', 'لا يمكنك إدارة هذا المستوى.');
  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (!questions.length) throw new HttpsError('invalid-argument', 'أضف سؤالًا واحدًا على الأقل.');
  const publicQuestions = [];
  const keys = {};
  questions.forEach((q, i) => {
    const opts = Array.isArray(q.opts) ? q.opts.map(v => clean(v, 500)) : [];
    const ans = Number(q.ans);
    if (!clean(q.q, 1000) || opts.length < 2 || !Number.isInteger(ans) || ans < 0 || ans >= opts.length) {
      throw new HttpsError('invalid-argument', `السؤال رقم ${i + 1} غير صالح.`);
    }
    const id = clean(q.id || `q_${i + 1}_${Date.now()}`, 120);
    publicQuestions.push({ id, q: clean(q.q, 1000), opts, type: q.type === 'tf' ? 'tf' : 'mcq' });
    keys[id] = ans;
  });
  const examRef = db.collection('exams').doc();
  await examRef.set({
    courseId,
    courseName: course.data().name,
    level: String(course.data().level),
    title: clean(data.title, 180),
    description: clean(data.description, 1000),
    questions: publicQuestions,
    questionCount: publicQuestions.length,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    authorId: profile.uid
  });
  await db.doc(`examKeys/${examRef.id}`).set({ answers: keys });
  await audit(profile, 'EXAM_CREATE', examRef.id, clean(data.title, 180));
  return { ok: true, id: examRef.id };
});

exports.updateExam = onCall(async request => {
  const profile = await requirePermission(request, 'exams.manage');
  const id = clean(request.data?.id, 128);
  const ref = db.doc(`exams/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'الاختبار غير موجود.');
  if (!canManageScope(profile, snap.data().level)) throw new HttpsError('permission-denied', 'لا يمكنك إدارة هذا المستوى.');
  const data = request.data;
  await ref.update({
    title: clean(data.title ?? snap.data().title, 180),
    description: clean(data.description ?? snap.data().description, 1000),
    active: data.active === undefined ? snap.data().active : Boolean(data.active),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await audit(profile, 'EXAM_UPDATE', id, 'تحديث اختبار');
  return { ok: true };
});

exports.submitExam = onCall(async request => {
  const uid = uidFromRequest(request);
  const profile = await getProfile(uid);
  const examId = clean(request.data?.examId, 128);
  const answers = request.data?.answers && typeof request.data.answers === 'object' ? request.data.answers : {};
  const examSnap = await db.doc(`exams/${examId}`).get();
  if (!examSnap.exists || examSnap.data().active !== true) throw new HttpsError('not-found', 'الاختبار غير متاح.');
  const existing = await db.collection('results').where('examId', '==', examId).where('userId', '==', uid).limit(1).get();
  if (!existing.empty) throw new HttpsError('already-exists', 'سبق لك أداء هذا الاختبار.');
  const keySnap = await db.doc(`examKeys/${examId}`).get();
  if (!keySnap.exists) throw new HttpsError('failed-precondition', 'مفتاح التصحيح غير موجود.');
  const key = keySnap.data().answers || {};
  let score = 0;
  const details = [];
  for (const q of examSnap.data().questions || []) {
    const given = answers[q.id] === undefined ? null : Number(answers[q.id]);
    const correct = Number(key[q.id]);
    const isCorrect = given !== null && given === correct;
    if (isCorrect) score += 1;
    details.push({ id: q.id, question: q.q, options: q.opts, given, correct, isCorrect });
  }
  const total = details.length;
  const percentage = total ? Math.round(score * 10000 / total) / 100 : 0;
  const resultRef = db.collection('results').doc();
  await resultRef.set({
    userId: uid,
    userName: profile.name || '',
    examId,
    examTitle: examSnap.data().title,
    score,
    total,
    percentage,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await audit(profile, 'EXAM_SUBMIT', examId, `النتيجة ${score}/${total}`);
  return { ok: true, score, total, percentage, details };
});

exports.saveContent = onCall(async request => {
  const data = request.data || {};
  const collection = clean(data.collection, 30);
  if (!CONTENT_COLLECTIONS.has(collection)) throw new HttpsError('invalid-argument', 'نوع المحتوى غير صالح.');
  const permission = CONTENT_PERMS[collection];
  const profile = await requirePermission(request, permission);
  const level = clean(data.level || 'all', 10);
  if (!canManageScope(profile, level)) throw new HttpsError('permission-denied', 'لا يمكنك النشر ضمن هذا النطاق.');
  const payload = {
    title: clean(data.title, 180),
    content: clean(data.content, 5000),
    description: clean(data.description, 1500),
    url: clean(data.url, 2000),
    type: clean(data.type || 'article', 40),
    level,
    active: data.active === undefined ? true : Boolean(data.active),
    authorId: profile.uid,
    authorName: profile.name || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (!payload.title) throw new HttpsError('invalid-argument', 'العنوان مطلوب.');
  let id = clean(data.id, 128);
  const ref = id ? db.doc(`${collection}/${id}`) : db.collection(collection).doc();
  if (!id) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(payload, { merge: true });
  await audit(profile, 'CONTENT_SAVE', `${collection}/${ref.id}`, payload.title);
  return { ok: true, id: ref.id };
});

exports.deleteContent = onCall(async request => {
  const collection = clean(request.data?.collection, 30);
  if (!CONTENT_COLLECTIONS.has(collection)) throw new HttpsError('invalid-argument', 'نوع المحتوى غير صالح.');
  const profile = await requirePermission(request, CONTENT_PERMS[collection]);
  const id = clean(request.data?.id, 128);
  const ref = db.doc(`${collection}/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'العنصر غير موجود.');
  if (!canManageScope(profile, snap.data().level || 'all')) throw new HttpsError('permission-denied', 'لا يمكنك حذف هذا المحتوى.');
  await ref.update({ active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await audit(profile, 'CONTENT_ARCHIVE', `${collection}/${id}`, 'أرشفة محتوى');
  return { ok: true };
});

exports.saveSiteSettings = onCall(async request => {
  const profile = await requirePermission(request, 'settings.manage');
  const data = request.data || {};
  const allowed = {
    siteName: clean(data.siteName, 120),
    collegeName: clean(data.collegeName, 180),
    tagline: clean(data.tagline, 240),
    primary: clean(data.primary, 20),
    primary2: clean(data.primary2, 20),
    accent: clean(data.accent, 20),
    bg: clean(data.bg, 20),
    card: clean(data.card, 20),
    text: clean(data.text, 20),
    muted: clean(data.muted, 20),
    line: clean(data.line, 20),
    mode: ['light','dark','system'].includes(data.mode) ? data.mode : 'light',
    radius: Math.min(32, Math.max(10, Number(data.radius) || 20)),
    density: ['compact','comfortable','spacious'].includes(data.density) ? data.density : 'comfortable',
    showLogo: data.showLogo !== false,
    logoUrl: clean(data.logoUrl, 2000),
    logoPath: clean(data.logoPath, 500)
  };
  await db.doc('settings/site').set({ ...allowed, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: profile.uid }, { merge: true });
  await audit(profile, 'SETTINGS_UPDATE', 'site', 'تحديث مظهر المنصة');
  return { ok: true };
});

exports.adminStats = onCall(async request => {
  const profile = await requirePermission(request, 'users.view');
  const [users, courses, exams, results, announcements, reports, activities, media] = await Promise.all([
    auth.listUsers(1000), db.collection('courses').get(), db.collection('exams').get(), db.collection('results').get(),
    db.collection('announcements').where('active', '==', true).get(), db.collection('reports').where('active', '==', true).get(),
    db.collection('activities').where('active', '==', true).get(), db.collection('media').where('active', '==', true).get()
  ]);
  await audit(profile, 'ADMIN_STATS', 'dashboard', 'عرض إحصائيات الإدارة');
  return {
    users: users.users.length,
    activeUsers: users.users.filter(u => !u.disabled).length,
    courses: courses.size,
    exams: exams.size,
    results: results.size,
    announcements: announcements.size,
    reports: reports.size,
    activities: activities.size,
    media: media.size
  };
});

exports.adminResults = onCall(async request => {
  const profile = await requirePermission(request, 'results.view');
  const snap = await db.collection('results').orderBy('createdAt', 'desc').limit(500).get();
  await audit(profile, 'RESULTS_LIST', 'results', 'عرض النتائج');
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

exports.listAuditLogs = onCall(async request => {
  const profile = await requirePermission(request, 'audit.view');
  const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(300).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

