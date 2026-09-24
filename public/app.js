import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile as updateAuthProfile
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { firebaseConfig, firebaseConfigured } from './firebase-config.js';

const DEFAULT_SETTINGS = {
  siteName: 'منصة خدمة الطلاب',
  collegeName: 'كلية الشريعة والقانون',
  tagline: 'خدماتك الدراسية في مساحة واحدة.',
  primary: '#0f766e', primary2: '#0b5f59', accent: '#14b8a6',
  bg: '#f5f8f8', card: '#ffffff', text: '#15211f', muted: '#71807e', line: '#e0e8e6',
  mode: 'light', radius: 20, density: 'comfortable', showLogo: true,
  logoUrl: './assets/logo-placeholder.svg', logoPath: ''
};

const ROLE_LABELS = {
  owner:'المسؤول الأول للموقع',
  website_manager:'مسؤول الموقع الإلكتروني',
  scientific_college_manager:'مسؤول اللجنة العلمية بالكلية',
  scientific_college_deputy:'نائب مسؤول اللجنة العلمية بالكلية',
  scientific_level_manager:'مسؤول اللجنة العلمية بالمستوى',
  scientific_level_deputy:'نائب مسؤول اللجنة العلمية بالمستوى',
  university_forum_manager:'مسؤول ملتقى الطالب الجامعي بالكلية',
  university_forum_deputy:'نائب مسؤول ملتقى الطالب الجامعي بالكلية',
  media_manager:'مسؤول اللجنة الإعلامية بالكلية',
  media_deputy:'نائب مسؤول اللجنة الإعلامية بالكلية',
  student:'طالب'
};

const PERMISSIONS = {
  owner:['*'],
  website_manager:['users.view','users.create','users.edit','users.suspend','courses.manage','exams.manage','results.view','content.manage','settings.manage','audit.view'],
  scientific_college_manager:['courses.manage','exams.manage','results.view','content.manage'],
  scientific_college_deputy:['exams.manage','results.view','content.create'],
  scientific_level_manager:['exams.manage','results.view','content.create'],
  scientific_level_deputy:['results.view','content.create'],
  university_forum_manager:['content.manage'],
  university_forum_deputy:['content.create'],
  media_manager:['content.media','content.manage'],
  media_deputy:['content.media','content.create'],
  student:[]
};

const state = {
  user: null,
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
  courses: [],
  exams: [],
  results: [],
  content: { announcements: [], reports: [], activities: [], media: [] },
  adminUsers: [],
  adminStats: null,
  currentExam: null,
  page: 'home',
  adminTab: 'overview',
  localDark: localStorage.getItem('site_dark') === '1',
  pendingSignup: false
};

let firebaseApp, auth, db, storage;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmt = v => v?.toDate ? v.toDate().toLocaleString('ar-YE') : (v ? new Date(v).toLocaleString('ar-YE') : '—');
const levelName = l => ({'1':'الأول','2':'الثاني','3':'الثالث','4':'الرابع','all':'كل المستويات'}[String(l)] || String(l || '—'));

function showBusy(on, text='جاري التنفيذ…') { $('busy').classList.toggle('hidden', !on); $('busy').querySelector('span').textContent = text; }
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200); }
function initials(name='ط') { return String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').slice(0,2) || 'ط'; }
function can(permission) { return !!state.profile && (state.profile.role === 'owner' || (PERMISSIONS[state.profile.role] || []).includes(permission)); }
function isAdmin() { return can('users.view') || can('courses.manage') || can('exams.manage') || can('content.manage') || can('settings.manage'); }
function roleLabel(role) { return ROLE_LABELS[role] || role || 'طالب'; }
function friendlyError(error) {
  const code = error?.code || '';
  const map = {
    'auth/invalid-credential':'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/operation-not-allowed':'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase.',
    'auth/wrong-password':'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/user-not-found':'الحساب غير موجود.',
    'auth/email-already-in-use':'هذا البريد مستخدم بالفعل.',
    'auth/weak-password':'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل.',
    'auth/too-many-requests':'تمت محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
    'auth/invalid-email':'البريد الإلكتروني غير صحيح.',
    'auth/network-request-failed':'تحقق من اتصال الإنترنت.',
    'permission-denied':'ليس لديك صلاحية لتنفيذ هذه العملية.'
  };
  if (map[code]) return map[code];
  return error?.message || 'حدث خطأ غير متوقع.';
}

function applySettings(settings) {
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const s = state.settings;
  const root = document.documentElement;
  ['primary','primary2','accent','bg','card','text','muted','line'].forEach(k => root.style.setProperty('--'+k, s[k]));
  root.style.setProperty('--radius', `${Number(s.radius || 20)}px`);
  document.body.classList.toggle('density-compact', s.density === 'compact');
  document.body.classList.toggle('density-spacious', s.density === 'spacious');
  const dark = state.localDark || s.mode === 'dark' || (s.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
  const logo = s.showLogo && s.logoUrl ? s.logoUrl : './assets/logo-placeholder.svg';
  ['authLogo','authLogoMobile','appLogo'].forEach(id => { if ($(id)) $(id).src = logo; });
  ['authCollegeName','authCollegeNameMobile','appCollegeName'].forEach(id => { if ($(id)) $(id).textContent = s.collegeName; });
  ['authSiteName','authSiteNameMobile','appSiteName'].forEach(id => { if ($(id)) $(id).textContent = s.siteName; });
  if ($('authTagline')) $('authTagline').textContent = s.tagline;
  document.title = `${s.siteName} | ${s.collegeName}`;
  const theme = document.querySelector('meta[name="theme-color"]'); if (theme) theme.setAttribute('content', s.primary);
}

async function callFn(name, data={}) {
  if (!auth?.currentUser) throw new Error('يجب تسجيل الدخول أولاً.');

  const uid = auth.currentUser.uid;
  const now = serverTimestamp();

  if (name === 'createCourse') {
    const r = doc(collection(db, 'courses'));
    await setDoc(r, {
      name: data.name,
      level: String(data.level),
      description: data.description || '',
      active: true,
      authorId: uid,
      createdAt: now,
      updatedAt: now
    });
    return { id: r.id };
  }

  if (name === 'updateCourse') {
    await updateDoc(doc(db, 'courses', data.id), {
      name: data.name,
      level: String(data.level),
      description: data.description || '',
      active: !!data.active,
      updatedAt: now
    });
    return { id: data.id };
  }

  if (name === 'createExam') {
    const course = await getDoc(doc(db, 'courses', data.courseId));
    if (!course.exists()) throw new Error('المقرر غير موجود.');

    const r = doc(collection(db, 'exams'));
    await setDoc(r, {
      courseId: data.courseId,
      courseName: course.data().name || '',
      title: data.title,
      description: data.description || '',
      questions: data.questions || [],
      questionCount: (data.questions || []).length,
      active: true,
      authorId: uid,
      createdAt: now,
      updatedAt: now
    });
    return { id: r.id };
  }

  if (name === 'updateExam') {
    await updateDoc(doc(db, 'exams', data.id), {
      active: !!data.active,
      updatedAt: now
    });
    return { id: data.id };
  }

  if (name === 'saveContent') {
    const collectionName = data.collection;
    const allowed = ['announcements','reports','activities','media'];
    if (!allowed.includes(collectionName)) throw new Error('نوع المحتوى غير صحيح.');

    const payload = {
      title: data.title,
      level: String(data.level || 'all'),
      content: data.content || '',
      url: data.url || '',
      type: data.type || 'article',
      active: true,
      authorId: uid,
      updatedAt: now
    };

    if (data.id) {
      await updateDoc(doc(db, collectionName, data.id), payload);
      return { id: data.id };
    }

    const r = doc(collection(db, collectionName));
    await setDoc(r, {...payload, createdAt: now});
    return { id: r.id };
  }

  if (name === 'adminListUsers') {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => {
      const x = d.data();
      return {
        uid: d.id,
        name: x.name || '',
        email: x.email || '',
        role: x.role || 'student',
        roleLabel: roleLabel(x.role),
        level: x.level || 'all',
        active: x.active !== false,
        lastSignInAt: x.lastSignInAt || null
      };
    });
  }

  if (name === 'adminResults') {
    const snap = await getDocs(collection(db, 'results'));
    return snap.docs.map(d => ({id:d.id, ...d.data()}));
  }

  if (name === 'adminStats') {
    const names = ['users','courses','exams','results','announcements','activities','media'];
    const out = {};
    for (const n of names) {
      const snap = await getDocs(collection(db, n));
      out[n] = snap.size;
    }
    const usersSnap = await getDocs(collection(db, 'users'));
    out.activeUsers = usersSnap.docs.filter(d => d.data().active !== false).length;
    return {
      users: out.users,
      activeUsers: out.activeUsers,
      courses: out.courses,
      exams: out.exams,
      results: out.results,
      announcements: out.announcements,
      activities: out.activities,
      media: out.media
    };
  }

  if (name === 'adminCreateUser') {
    throw new Error('إنشاء حسابات المستخدمين من لوحة الموقع يحتاج Firebase Admin SDK أو إنشاء الحساب من Firebase Console.');
  }

  if (name === 'adminSetUserStatus' || name === 'adminSetUserRole') {
    throw new Error('تعديل دور أو حالة حساب مستخدم يحتاج صلاحية خادمية Admin SDK.');
  }

  throw new Error('العملية غير مدعومة حالياً: ' + name);
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    applySettings(snap.exists() ? snap.data() : DEFAULT_SETTINGS);
  } catch (e) { applySettings(DEFAULT_SETTINGS); }
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('ملف المستخدم غير موجود. تواصل مع إدارة المنصة.');
  state.profile = { uid, ...snap.data() };
  if (state.profile.active === false) throw new Error('تم إيقاف حسابك.');
  return state.profile;
}

async function loadPublicData() {
  const [coursesSnap, examsSnap, annSnap, reportsSnap, actSnap, mediaSnap] = await Promise.all([
    getDocs(collection(db, 'courses')),
    getDocs(query(collection(db, 'exams'), where('active','==',true))),
    getDocs(query(collection(db, 'announcements'), where('active','==',true), orderBy('createdAt','desc'), limit(20))),
    getDocs(query(collection(db, 'reports'), where('active','==',true), orderBy('createdAt','desc'), limit(20))),
    getDocs(query(collection(db, 'activities'), where('active','==',true), orderBy('createdAt','desc'), limit(20))),
    getDocs(query(collection(db, 'media'), where('active','==',true), orderBy('createdAt','desc'), limit(20)))
  ]);
  const level = String(state.profile?.level || 'all');
  state.courses = coursesSnap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.active && (level==='all' || c.level==='all' || String(c.level)===level));
  state.exams = examsSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>level==='all' || e.level==='all' || String(e.level)===level);
  state.content.announcements = annSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>level==='all' || x.level==='all' || String(x.level)===level);
  state.content.reports = reportsSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>level==='all' || x.level==='all' || String(x.level)===level);
  state.content.activities = actSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>level==='all' || x.level==='all' || String(x.level)===level);
  state.content.media = mediaSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>level==='all' || x.level==='all' || String(x.level)===level);
}

async function loadMyResults() {
  if (!state.user) return;
  const snap = await getDocs(query(collection(db,'results'), where('userId','==',state.user.uid), orderBy('createdAt','desc'), limit(100)));
  state.results = snap.docs.map(d=>({id:d.id,...d.data()}));
}

function authSwitch(card) {
  ['loginCard','signupCard','forgotCard'].forEach(id => $(id).classList.toggle('hidden', id !== card));
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim().toLowerCase();
  const password = $('loginPassword').value;
  if (!email || !password) return;
  showBusy(true,'جاري تسجيل الدخول…');
  try {
    await setPersistence(auth, $('rememberMe').checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) { toast(friendlyError(e)); showBusy(false); }
}

async function handleSignup(e) {
  e.preventDefault();
  const email = $('signupEmail').value.trim().toLowerCase();
  const name = $('signupName').value.trim();
  const phone = $('signupPhone').value.trim();
  const level = $('signupLevel').value;
  const password = $('signupPassword').value;
  const confirm = $('signupConfirm').value;
  if (!email.endsWith('@gmail.com')) return toast('يجب أن يكون البريد الإلكتروني من نوع @gmail.com.');
  if (!name) return toast('الاسم مطلوب.');
  if (!level) return toast('اختر المستوى.');
  if (password.length < 8) return toast('كلمة المرور يجب ألا تقل عن 8 أحرف.');
  if (password !== confirm) return toast('تأكيد كلمة المرور غير مطابق.');
  showBusy(true,'جاري إنشاء الحساب…');
  state.pendingSignup = true;
  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateAuthProfile(cred.user, { displayName: name });
    await setDoc(doc(db,'users',cred.user.uid), {
      name, email, phone, role:'student', level, active:true,
      createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    });
    state.pendingSignup = false;
    toast('تم إنشاء الحساب بنجاح.');
  } catch (e) { state.pendingSignup = false; toast(friendlyError(e)); showBusy(false); }
}

async function handleForgot(e) {
  e.preventDefault();
  const email = $('forgotEmail').value.trim().toLowerCase();
  if (!email) return;
  if (!email.endsWith('@gmail.com')) return toast('أدخل بريد Gmail صالحًا.');
  showBusy(true,'جاري إرسال الرابط…');
  try {
    await sendPasswordResetEmail(auth, email);
    toast('تم إرسال رابط استرجاع كلمة المرور إلى بريدك.');
    authSwitch('loginCard');
  } catch (e) { toast(friendlyError(e)); }
  finally { showBusy(false); }
}

function renderShell() {
  const p = state.profile;
  $('topUserName').textContent = p.name || 'طالب';
  $('topRole').textContent = roleLabel(p.role);
  $('topAvatar').textContent = initials(p.name || 'طالب');
  const showAdmin = isAdmin();
  $('adminNavGroup').classList.toggle('hidden', !showAdmin);
  $('mobileAdminNav').classList.toggle('hidden', !showAdmin);
}

function setPage(page) {
  const ids = ['home','courses','exams','results','announcements','activities','reports','media','admin','exam'];
  ids.forEach(x => $('page-'+x)?.classList.toggle('hidden', x !== page));
  document.querySelectorAll('.side-nav,.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  state.page = page;
}

async function showPage(page) {
  setPage(page);
  showBusy(true,'تحميل الصفحة…');
  try {
    if (page === 'home') renderHome();
    if (page === 'courses') renderCourses();
    if (page === 'exams') renderExams();
    if (page === 'results') { await loadMyResults(); renderResults(); }
    if (page === 'announcements') renderListPage('announcements','الإعلانات','إعلانات اللجنة والمنصة');
    if (page === 'activities') renderListPage('activities','الأنشطة','الفعاليات والأنشطة الطلابية');
    if (page === 'reports') renderListPage('reports','التقارير','تقارير اللجان والفعاليات');
    if (page === 'media') renderListPage('media','الوسائط','الصور والروابط والمواد الإعلامية');
    if (page === 'admin') await renderAdmin();
  } catch (e) { toast(friendlyError(e)); }
  finally { showBusy(false); }
}

function renderHome() {
  const p = state.profile;
  const latest = state.content.announcements.slice(0,3);
  $('page-home').innerHTML = `
    <div class="hero">
      <div class="hero-row">
        <div><span class="eyebrow">لوحة الطالب</span><h2>مرحبًا، ${esc(p.name)}</h2><p class="muted">المستوى ${levelName(p.level)} — تابع مقرراتك واختباراتك وأخبارك من هنا.</p></div>
        <div class="toolbar-actions"><button class="btn primary" data-go="exams">ابدأ اختبارًا</button><button class="btn soft" data-go="courses">تصفح المقررات</button></div>
      </div>
    </div>
    <div class="grid-4">
      <div class="card stat"><small>المقررات المتاحة</small><strong>${state.courses.length}</strong></div>
      <div class="card stat"><small>الاختبارات</small><strong>${state.exams.length}</strong></div>
      <div class="card stat"><small>محاولاتي</small><strong>${state.results.length}</strong></div>
      <div class="card stat"><small>المستوى</small><strong>${levelName(p.level)}</strong></div>
    </div>
    <div class="grid-2" style="margin-top:14px">
      <section class="card"><div class="toolbar"><div><h3>آخر الإعلانات</h3><small>أحدث ما نشر على المنصة</small></div><button class="link-btn" data-go="announcements">عرض الكل</button></div>${latest.length ? latest.map(a=>`<article class="notice-card"><b>${esc(a.title)}</b><p class="muted">${esc(a.content).slice(0,220)}${a.content.length>220?'…':''}</p><small class="muted">${fmt(a.createdAt)}</small></article>`).join('') : '<div class="empty">لا توجد إعلانات حاليًا.</div>'}</section>
      <section class="card"><div class="toolbar"><div><h3>وصول سريع</h3><small>أهم الخدمات اليومية</small></div></div><div class="grid-2"><button class="btn soft" data-go="courses">المقررات</button><button class="btn soft" data-go="exams">الاختبارات</button><button class="btn soft" data-go="results">نتائجي</button><button class="btn soft" data-go="activities">الأنشطة</button></div></section>
    </div>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showPage(b.dataset.go));
}

function renderCourses() {
  $('page-courses').innerHTML = `<div class="toolbar"><div><h2>المقررات الدراسية</h2><p>المقررات المتاحة لحسابك</p></div></div>${state.courses.length?`<div class="cards">${state.courses.map(c=>`<article class="card"><span class="badge">المستوى ${esc(levelName(c.level))}</span><h3>${esc(c.name)}</h3><p class="muted">${esc(c.description||'لا يوجد وصف')}</p><div class="card-actions"><button class="btn primary" data-course="${esc(c.id)}">اختبارات المقرر</button></div></article>`).join('')}</div>`:'<div class="empty">لا توجد مقررات متاحة.</div>'}`;
  document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>showPage('exams').then(()=>renderExams(b.dataset.course)));
}

function renderExams(courseId='') {
  const list = courseId ? state.exams.filter(e=>e.courseId===courseId) : state.exams;
  $('page-exams').innerHTML = `<div class="toolbar"><div><h2>الاختبارات</h2><p>نماذج الاختبارات المتاحة للمستوى</p></div><button class="btn soft" data-go="courses">المقررات</button></div>${list.length?`<div class="cards">${list.map(e=>`<article class="card"><span class="badge">${esc(e.courseName||'مقرر')}</span><h3>${esc(e.title)}</h3><p class="muted">${esc(e.description||'اختبار تدريبي')}</p><small class="muted">${Number(e.questionCount||e.questions?.length||0)} سؤال · ${fmt(e.createdAt)}</small><div class="card-actions"><button class="btn primary" data-exam="${esc(e.id)}">بدء الاختبار</button></div></article>`).join('')}</div>`:'<div class="empty">لا توجد اختبارات متاحة حاليًا.</div>'}`;
  document.querySelectorAll('[data-exam]').forEach(b=>b.onclick=()=>startExam(b.dataset.exam));
  document.querySelectorAll('[data-go="courses"]').forEach(b=>b.onclick=()=>showPage('courses'));
}

async function startExam(id) {
  const exam = state.exams.find(e=>e.id===id);
  if (!exam) return toast('الاختبار غير موجود.');
  state.currentExam = exam;
  setPage('exam');
  renderExamForm();
}

function renderExamForm() {
  const ex = state.currentExam;
  $('page-exam').innerHTML = `<div class="toolbar"><div><span class="eyebrow">اختبار</span><h2>${esc(ex.title)}</h2><p>${esc(ex.description||'')}</p></div><button class="btn soft" id="backExamsBtn">← الاختبارات</button></div><form id="examSubmitForm">${(ex.questions||[]).map((q,i)=>`<div class="question"><div class="question-title">${i+1}. ${esc(q.q)}</div>${q.opts.map((o,j)=>`<label class="option"><input type="radio" name="q_${esc(q.id)}" value="${j}" required><span>${esc(o)}</span></label>`).join('')}</div>`).join('')}<button class="btn primary wide" type="submit">إنهاء وتصحيح الاختبار</button></form>`;
  $('backExamsBtn').onclick=()=>showPage('exams');
  $('examSubmitForm').onsubmit=submitExam;
}

async function submitExam(e) {
  e.preventDefault();
  const answers = {};
  (state.currentExam.questions||[]).forEach(q=>{ const s=document.querySelector(`input[name="q_${CSS.escape(q.id)}"]:checked`); if(s) answers[q.id]=Number(s.value); });
  showBusy(true,'جاري تصحيح الاختبار…');
  try {
    const result = await callFn('submitExam',{ examId: state.currentExam.id, answers });
    state.results.unshift({ ...result, examTitle: state.currentExam.title, score: result.score, total: result.total, percentage: result.percentage, createdAt:new Date(), userId:state.user.uid });
    renderExamResult(result);
  } catch(e){ toast(friendlyError(e)); }
  finally { showBusy(false); }
}

function renderExamResult(r) {
  $('page-exam').innerHTML = `<div class="hero"><div class="score-box"><div class="score-circle" style="--pct:${Number(r.percentage)}"><span>${esc(r.percentage)}%</span></div><div><span class="eyebrow">تم التصحيح</span><h2>${r.score} من ${r.total}</h2><p class="muted">تم حفظ نتيجتك في حسابك.</p></div></div><div class="card-actions"><button class="btn primary" id="resultsBtn">نتائجي</button><button class="btn soft" id="anotherExamBtn">اختبار آخر</button></div></div><h3>مراجعة الإجابات</h3>${r.details.map((d,i)=>`<article class="question"><div class="question-title">${i+1}. ${esc(d.question)}</div><p class="${d.isCorrect?'result-good':'result-bad'}">${d.isCorrect?'إجابة صحيحة':'إجابة غير صحيحة'}</p><small>الإجابة الصحيحة: ${esc(d.options[d.correct] ?? d.correct)}</small></article>`).join('')}`;
  $('resultsBtn').onclick=()=>showPage('results'); $('anotherExamBtn').onclick=()=>showPage('exams');
}

function renderResults() {
  $('page-results').innerHTML = `<div class="toolbar"><div><h2>نتائجي</h2><p>سجل محاولاتك ودرجاتك</p></div></div>${state.results.length?`<div class="table-wrap"><table class="table"><thead><tr><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th></tr></thead><tbody>${state.results.map(r=>`<tr><td>${esc(r.examTitle||'اختبار')}</td><td>${esc(r.score)} / ${esc(r.total)}</td><td><span class="status ${Number(r.percentage)>=50?'on':'off'}">${esc(r.percentage)}%</span></td><td>${fmt(r.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">لم تؤدِّ أي اختبار بعد.</div>'}`;
}

function renderListPage(type,title,desc) {
  const items = state.content[type] || [];
  $('page-'+type).innerHTML = `<div class="toolbar"><div><h2>${title}</h2><p>${desc}</p></div>${can('content.create')||can('content.manage')||can('content.media') ? `<button class="btn primary" id="add-${type}">+ إضافة</button>`:''}</div>${items.length?`<div class="grid-2">${items.map(x=>`<article class="card"><span class="badge">المستوى ${esc(levelName(x.level||'all'))}</span><h3>${esc(x.title)}</h3><p class="muted">${esc(x.content||x.description||'')}</p>${x.url?`<a class="link-btn" href="${esc(x.url)}" target="_blank" rel="noopener">فتح الرابط ↗</a>`:''}<small class="muted" style="display:block;margin-top:10px">${fmt(x.createdAt)}</small></article>`).join('')}</div>`:'<div class="empty">لا يوجد محتوى متاح.</div>'}`;
  if ($('add-'+type)) $('add-'+type).onclick=()=>openContentModal(type);
}

function modal(html) {
  const root = $('modalRoot'); const wrap = document.createElement('div'); wrap.className='modal'; wrap.innerHTML=`<div class="modal-card">${html}</div>`; wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()}); root.appendChild(wrap); return wrap;
}

function openContentModal(collectionName, item=null) {
  const labels = {announcements:'إعلان',reports:'تقرير',activities:'نشاط',media:'وسائط'};
  const isMedia = collectionName==='media';
  const titleText = item ? `تعديل ${labels[collectionName]}` : `إضافة ${labels[collectionName]}`;
  const m = modal(`<div class="modal-head"><h3>${titleText}</h3><button class="close-btn" type="button">×</button></div><form class="stack-form" id="contentForm"><label>العنوان<input id="ctTitle" required value="${esc(item?.title||'')}"></label><label>النطاق<select id="ctLevel"><option value="all" ${String(item?.level||'all')==='all'?'selected':''}>كل المستويات</option><option value="1" ${String(item?.level)==='1'?'selected':''}>الأول</option><option value="2" ${String(item?.level)==='2'?'selected':''}>الثاني</option><option value="3" ${String(item?.level)==='3'?'selected':''}>الثالث</option><option value="4" ${String(item?.level)==='4'?'selected':''}>الرابع</option></select></label>${isMedia?`<label>الرابط<input id="ctUrl" type="url" value="${esc(item?.url||'')}" placeholder="https://..."></label><label>النوع<input id="ctType" value="${esc(item?.type||'link')}"></label>`:''}<label>${isMedia?'الوصف':'المحتوى'}<textarea id="ctContent" rows="7" required>${esc(item?.content||item?.description||'')}</textarea></label><button class="btn primary wide" type="submit">${item?'حفظ التعديلات':'حفظ'}</button></form>`);
  m.querySelector('.close-btn').onclick=()=>m.remove();
  m.querySelector('#contentForm').onsubmit=async e=>{e.preventDefault();showBusy(true,'جاري الحفظ…');try{await callFn('saveContent',{id:item?.id||'',collection:collectionName,title:m.querySelector('#ctTitle').value,level:m.querySelector('#ctLevel').value,content:m.querySelector('#ctContent').value,url:m.querySelector('#ctUrl')?.value||'',type:m.querySelector('#ctType')?.value||'article'});m.remove();await loadPublicData();toast(item?'تم تحديث المحتوى.':'تم الحفظ بنجاح.');if(state.page==='admin')await renderAdmin();else renderListPage(collectionName,labels[collectionName],`أحدث ${labels[collectionName]} المنصة`);}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

async function renderAdmin() {
  if (!isAdmin()) { toast('ليس لديك صلاحية الإدارة.'); return showPage('home'); }
  const tabs = [];
  if (can('users.view')) tabs.push(['overview','نظرة عامة']);
  if (can('users.view')) tabs.push(['users','المستخدمون']);
  if (can('courses.manage')) tabs.push(['courses','المقررات']);
  if (can('exams.manage')) tabs.push(['exams','الاختبارات']);
  if (can('results.view')) tabs.push(['results','النتائج']);
  if (can('content.manage')||can('content.media')) tabs.push(['content','المحتوى']);
  if (can('settings.manage')) tabs.push(['appearance','المظهر والثيم']);
  if (can('audit.view')) tabs.push(['audit','سجل العمليات']);
  $('page-admin').innerHTML = `<div class="toolbar"><div><span class="eyebrow">الإدارة</span><h2>لوحة التحكم</h2><p>إدارة المنصة حسب الصلاحيات الفعلية للحساب.</p></div></div><div class="tabs">${tabs.map(t=>`<button class="tab ${state.adminTab===t[0]?'active':''}" data-admin-tab="${t[0]}">${t[1]}</button>`).join('')}</div><div id="adminBody"></div>`;
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>{state.adminTab=b.dataset.adminTab;renderAdmin();});
  if (state.adminTab==='overview') await renderAdminOverview();
  if (state.adminTab==='users') await renderAdminUsers();
  if (state.adminTab==='courses') await renderAdminCourses();
  if (state.adminTab==='exams') await renderAdminExams();
  if (state.adminTab==='results') await renderAdminResults();
  if (state.adminTab==='content') await renderAdminContent();
  if (state.adminTab==='appearance') await renderAppearance();
  if (state.adminTab==='audit') await renderAudit();
}

async function renderAdminOverview() {
  state.adminStats = await callFn('adminStats');
  $('adminBody').innerHTML = `<div class="grid-4">${[['المستخدمون',state.adminStats.users],['النشطون',state.adminStats.activeUsers],['المقررات',state.adminStats.courses],['الاختبارات',state.adminStats.exams],['النتائج',state.adminStats.results],['الإعلانات',state.adminStats.announcements],['الأنشطة',state.adminStats.activities],['الوسائط',state.adminStats.media]].map(x=>`<div class="card stat"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('')}</div><div class="grid-2" style="margin-top:14px"><div class="card"><h3>صلاحية الحساب</h3><p class="muted">${esc(roleLabel(state.profile.role))}</p><p>المستوى الإداري: <b>${esc(levelName(state.profile.level||'all'))}</b></p></div><div class="card"><h3>اختصارات</h3><div class="toolbar-actions">${can('users.create')?'<button class="btn soft" id="quickUser">إضافة مستخدم</button>':''}${can('courses.manage')?'<button class="btn soft" id="quickCourse">إضافة مقرر</button>':''}${can('exams.manage')?'<button class="btn soft" id="quickExam">إضافة اختبار</button>':''}</div></div></div>`;
  if ($('quickUser')) $('quickUser').onclick=()=>{state.adminTab='users';renderAdmin();setTimeout(openUserModal,0)};
  if ($('quickCourse')) $('quickCourse').onclick=()=>{state.adminTab='courses';renderAdmin();setTimeout(openCourseModal,0)};
  if ($('quickExam')) $('quickExam').onclick=()=>{state.adminTab='exams';renderAdmin();setTimeout(openExamModal,0)};
}

async function renderAdminUsers() {
  state.adminUsers = await callFn('adminListUsers');
  $('adminBody').innerHTML = `<div class="toolbar"><div><h3>المستخدمون</h3><small class="muted">${state.adminUsers.length} حساب</small></div>${can('users.create')?'<button class="btn primary" id="addUserAdmin">+ إضافة مستخدم</button>':''}</div><div class="table-wrap"><table class="table"><thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>المستوى</th><th>الحالة</th><th>آخر دخول</th><th>إجراء</th></tr></thead><tbody>${state.adminUsers.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.roleLabel)}</td><td>${esc(levelName(u.level))}</td><td><span class="status ${u.active?'on':'off'}">${u.active?'نشط':'موقوف'}</span></td><td>${fmt(u.lastSignInAt)}</td><td>${u.role==='owner'?'محمي':`<div class="toolbar-actions">${can('users.suspend')?`<button class="btn ${u.active?'danger':'soft'}" data-user-status="${u.uid}" data-active="${u.active}">${u.active?'إيقاف':'تفعيل'}</button>`:''}${state.profile.role==='owner'?`<button class="btn soft" data-user-role="${u.uid}">دور</button>`:''}</div>`}</td></tr>`).join('')}</tbody></table></div>`;
  if ($('addUserAdmin')) $('addUserAdmin').onclick=openUserModal;
  document.querySelectorAll('[data-user-status]').forEach(b=>b.onclick=async()=>{showBusy(true);try{await callFn('adminSetUserStatus',{uid:b.dataset.userStatus,active:b.dataset.active!=='true'});toast('تم تحديث حالة الحساب.');await renderAdminUsers();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}});
  document.querySelectorAll('[data-user-role]').forEach(b=>b.onclick=()=>openRoleModal(b.dataset.userRole));
}

function openUserModal(){
  const m=modal(`<div class="modal-head"><h3>إنشاء مستخدم</h3><button class="close-btn">×</button></div><form class="stack-form" id="userForm"><label>الاسم<input id="uName" required></label><label>البريد<input id="uEmail" type="email" required></label><label>الهاتف<input id="uPhone" type="tel"></label><label>المستوى<select id="uLevel"><option value="1">الأول</option><option value="2">الثاني</option><option value="3">الثالث</option><option value="4">الرابع</option><option value="all">كل المستويات</option></select></label><label>الدور<select id="uRole">${Object.keys(ROLE_LABELS).filter(r=>r!=='owner'||state.profile.role==='owner').map(r=>`<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select></label><label>كلمة المرور<input id="uPassword" type="password" minlength="8" required></label><button class="btn primary wide" type="submit">إنشاء الحساب</button></form>`);
  m.querySelector('.close-btn').onclick=()=>m.remove(); m.querySelector('#userForm').onsubmit=async e=>{e.preventDefault();showBusy(true);try{await callFn('adminCreateUser',{name:m.querySelector('#uName').value,email:m.querySelector('#uEmail').value,phone:m.querySelector('#uPhone').value,level:m.querySelector('#uLevel').value,role:m.querySelector('#uRole').value,password:m.querySelector('#uPassword').value});m.remove();toast('تم إنشاء المستخدم.');await renderAdminUsers();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

function openRoleModal(uid){
  const m=modal(`<div class="modal-head"><h3>تعديل الدور والصلاحية</h3><button class="close-btn">×</button></div><form class="stack-form" id="roleForm"><label>الدور<select id="rRole">${Object.keys(ROLE_LABELS).filter(r=>r!=='owner').map(r=>`<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select></label><label>المستوى<select id="rLevel"><option value="1">الأول</option><option value="2">الثاني</option><option value="3">الثالث</option><option value="4">الرابع</option><option value="all">كل المستويات</option></select></label><button class="btn primary wide" type="submit">حفظ الدور</button></form>`);
  m.querySelector('.close-btn').onclick=()=>m.remove();m.querySelector('#roleForm').onsubmit=async e=>{e.preventDefault();showBusy(true);try{await callFn('adminSetUserRole',{uid,role:m.querySelector('#rRole').value,level:m.querySelector('#rLevel').value});m.remove();toast('تم تحديث الدور.');await renderAdminUsers();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

async function renderAdminCourses(){
  const snap=await getDocs(collection(db,'courses'));const list=snap.docs.map(d=>({id:d.id,...d.data()}));
  $('adminBody').innerHTML=`<div class="toolbar"><div><h3>المقررات</h3><small class="muted">إدارة المقررات حسب المستوى</small></div>${can('courses.manage')?'<button class="btn primary" id="addCourseAdmin">+ إضافة مقرر</button>':''}</div>${list.length?`<div class="grid-2">${list.map(c=>`<article class="card"><span class="badge">المستوى ${esc(levelName(c.level))}</span><h3>${esc(c.name)}</h3><p class="muted">${esc(c.description||'')}</p><span class="status ${c.active?'on':'off'}">${c.active?'نشط':'مؤرشف'}</span><div class="card-actions">${can('courses.manage')?`<button class="btn soft" data-course-edit="${esc(c.id)}">تعديل</button><button class="btn ${c.active?'danger':'soft'}" data-course-toggle="${esc(c.id)}" data-active="${c.active}">${c.active?'أرشفة':'إعادة تفعيل'}</button>`:''}</div></article>`).join('')}</div>`:'<div class="empty">لا توجد مقررات.</div>'}`;
  if($('addCourseAdmin'))$('addCourseAdmin').onclick=openCourseModal;
  document.querySelectorAll('[data-course-toggle]').forEach(b=>b.onclick=async()=>{showBusy(true);try{const c=list.find(x=>x.id===b.dataset.courseToggle);await callFn('updateCourse',{id:c.id,name:c.name,level:c.level,description:c.description||'',active:b.dataset.active!=='true'});toast('تم تحديث حالة المقرر.');await loadPublicData();await renderAdminCourses();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}});
}

function openCourseModal(){
  const m=modal(`<div class="modal-head"><h3>إضافة مقرر</h3><button class="close-btn">×</button></div><form class="stack-form" id="courseForm"><label>اسم المقرر<input id="cName" required></label><label>المستوى<select id="cLevel"><option value="1">الأول</option><option value="2">الثاني</option><option value="3">الثالث</option><option value="4">الرابع</option></select></label><label>الوصف<textarea id="cDesc" rows="4"></textarea></label><button class="btn primary wide" type="submit">حفظ</button></form>`);
  m.querySelector('.close-btn').onclick=()=>m.remove();m.querySelector('#courseForm').onsubmit=async e=>{e.preventDefault();showBusy(true);try{await callFn('createCourse',{name:m.querySelector('#cName').value,level:m.querySelector('#cLevel').value,description:m.querySelector('#cDesc').value});m.remove();toast('تم إنشاء المقرر.');await loadPublicData();await renderAdminCourses();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

async function renderAdminExams(){
  const snap=await getDocs(collection(db,'exams'));const list=snap.docs.map(d=>({id:d.id,...d.data()}));
  $('adminBody').innerHTML=`<div class="toolbar"><div><h3>الاختبارات</h3><small class="muted">إنشاء وإدارة نماذج الاختبارات ومفاتيح التصحيح محفوظة خادميًا.</small></div>${can('exams.manage')?'<button class="btn primary" id="addExamAdmin">+ اختبار جديد</button>':''}</div>${list.length?`<div class="cards">${list.map(e=>`<article class="card"><span class="badge">${esc(e.courseName||'مقرر')}</span><h3>${esc(e.title)}</h3><p class="muted">${esc(e.description||'')}</p><small class="muted">${e.questionCount||0} سؤال</small><div class="card-actions">${can('exams.manage')?`<button class="btn ${e.active?'danger':'soft'}" data-exam-toggle="${esc(e.id)}" data-active="${e.active}">${e.active?'أرشفة':'إعادة تفعيل'}</button>`:''}</div></article>`).join('')}</div>`:'<div class="empty">لا توجد اختبارات.</div>'}`;
  if($('addExamAdmin'))$('addExamAdmin').onclick=openExamModal;
  document.querySelectorAll('[data-exam-toggle]').forEach(b=>b.onclick=async()=>{showBusy(true);try{await callFn('updateExam',{id:b.dataset.examToggle,active:b.dataset.active!=='true'});toast('تم تحديث حالة الاختبار.');await loadPublicData();await renderAdminExams();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}});
}

async function openExamModal(){
  if(!state.courses.length){await loadPublicData();}
  const m=modal(`<div class="modal-head"><h3>إنشاء اختبار</h3><button class="close-btn">×</button></div><form class="stack-form" id="examFormAdmin"><label>المقرر<select id="xCourse" required>${state.courses.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(levelName(c.level))}</option>`).join('')}</select></label><label>العنوان<input id="xTitle" required></label><label>الوصف<textarea id="xDesc" rows="3"></textarea></label><div id="questionBuilder"></div><button class="btn soft" type="button" id="addQuestion">+ إضافة سؤال</button><button class="btn primary wide" type="submit">حفظ الاختبار</button></form>`);
  const qb=m.querySelector('#questionBuilder');
  const addRow=()=>{const i=qb.children.length;const box=document.createElement('div');box.className='question';box.innerHTML=`<div class="toolbar"><b>السؤال ${i+1}</b><button type="button" class="close-btn remove-q">×</button></div><label>نص السؤال<textarea class="q-text" rows="3" required></textarea></label><div class="form-grid"><label>النوع<select class="q-type"><option value="mcq">اختيار من متعدد</option><option value="tf">صح / خطأ</option></select></label><label>الإجابة الصحيحة<select class="q-ans"></select></label></div><label>الخيارات <small>افصل كل خيار بسطر مستقل</small><textarea class="q-opts" rows="5" required>الخيار الأول\nالخيار الثاني\nالخيار الثالث\nالخيار الرابع</textarea></div>`;qb.appendChild(box);const sync=()=>{const opts=box.querySelector('.q-opts').value.split('\n').map(x=>x.trim()).filter(Boolean);const sel=box.querySelector('.q-ans');sel.innerHTML=opts.map((o,j)=>`<option value="${j}">${esc(o)}</option>`).join('');};box.querySelector('.q-opts').addEventListener('input',sync);box.querySelector('.q-type').addEventListener('change',()=>{if(box.querySelector('.q-type').value==='tf'){box.querySelector('.q-opts').value='صحيح\nخطأ';}sync();});box.querySelector('.remove-q').onclick=()=>{box.remove();Array.from(qb.children).forEach((x,j)=>x.querySelector('.toolbar b').textContent=`السؤال ${j+1}`);};sync();};
  addRow();m.querySelector('#addQuestion').onclick=addRow;m.querySelector('.close-btn').onclick=()=>m.remove();m.querySelector('#examFormAdmin').onsubmit=async e=>{e.preventDefault();const questions=[...qb.children].map(box=>({q:box.querySelector('.q-text').value,opts:box.querySelector('.q-opts').value.split('\n').map(x=>x.trim()).filter(Boolean),ans:Number(box.querySelector('.q-ans').value),type:box.querySelector('.q-type').value}));if(!questions.length)return toast('أضف سؤالًا واحدًا على الأقل.');showBusy(true);try{await callFn('createExam',{courseId:m.querySelector('#xCourse').value,title:m.querySelector('#xTitle').value,description:m.querySelector('#xDesc').value,questions});m.remove();toast('تم إنشاء الاختبار.');await loadPublicData();await renderAdminExams();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

async function renderAdminResults(){
  const rows=await callFn('adminResults');
  $('adminBody').innerHTML=`<div class="toolbar"><div><h3>النتائج</h3><small class="muted">آخر النتائج المسجلة</small></div></div>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>الطالب</th><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.userName)}</td><td>${esc(r.examTitle)}</td><td>${esc(r.score)} / ${esc(r.total)}</td><td>${esc(r.percentage)}%</td><td>${fmt(r.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">لا توجد نتائج.</div>'}`;
}

async function renderAdminContent(){
  const types=[['announcements','الإعلانات'],['reports','التقارير'],['activities','الأنشطة'],['media','الوسائط']];
  const cards=types.map(([key,label])=>{const rows=state.content[key]||[];return `<div class="card"><div class="toolbar"><div><h3>${label}</h3><small class="muted">${rows.length} منشور</small></div>${(can('content.manage')||can('content.media'))?`<button class="btn primary" data-content-new="${key}">+ إضافة</button>`:''}</div>${rows.slice(0,8).map(x=>`<div class="muted-box" style="margin-top:8px"><div class="toolbar" style="margin:0"><b>${esc(x.title)}</b><div class="toolbar-actions">${(can('content.manage')||can('content.media'))?`<button class="link-btn" data-content-edit="${key}" data-content-id="${x.id}">تعديل</button><button class="link-btn" data-content-archive="${key}" data-content-id="${x.id}">أرشفة</button>`:''}</div></div><small>${esc(levelName(x.level||'all'))}</small></div>`).join('')||'<div class="empty">لا يوجد محتوى.</div>'}</div>`;}).join('');
  $('adminBody').innerHTML=`<div class="grid-2">${cards}</div>`;
  document.querySelectorAll('[data-content-new]').forEach(b=>b.onclick=()=>openContentModal(b.dataset.contentNew));
  document.querySelectorAll('[data-content-edit]').forEach(b=>b.onclick=()=>{const item=(state.content[b.dataset.contentEdit]||[]).find(x=>x.id===b.dataset.contentId);if(item)openContentModal(b.dataset.contentEdit,item);});
  document.querySelectorAll('[data-content-archive]').forEach(b=>b.onclick=async()=>{showBusy(true);try{await callFn('deleteContent',{collection:b.dataset.contentArchive,id:b.dataset.contentId});toast('تمت الأرشفة.');await loadPublicData();await renderAdminContent();}catch(e){toast(friendlyError(e));}finally{showBusy(false);}});
}

async function renderAppearance(){
  const s=state.settings;
  $('adminBody').innerHTML=`<div class="appearance-grid"><div class="card"><h3>هوية الموقع</h3><div class="stack-form"><label>اسم المنصة<input id="setSite" value="${esc(s.siteName)}"></label><label>اسم الكلية<input id="setCollege" value="${esc(s.collegeName)}"></label><label>الوصف الرئيسي<textarea id="setTagline" rows="3">${esc(s.tagline)}</textarea></label><label class="check"><input id="setShowLogo" type="checkbox" ${s.showLogo?'checked':''}> عرض الشعار في الواجهة</label></div></div><div class="card"><h3>الوضع والمسافات</h3><div class="stack-form"><label>الوضع<select id="setMode"><option value="light" ${s.mode==='light'?'selected':''}>فاتح</option><option value="dark" ${s.mode==='dark'?'selected':''}>داكن</option><option value="system" ${s.mode==='system'?'selected':''}>حسب الجهاز</option></select></label><label>كثافة الواجهة<select id="setDensity"><option value="compact" ${s.density==='compact'?'selected':''}>مضغوط</option><option value="comfortable" ${s.density==='comfortable'?'selected':''}>مريح</option><option value="spacious" ${s.density==='spacious'?'selected':''}>واسع</option></select></label><div class="range-row"><span>استدارة البطاقات</span><input id="setRadius" type="range" min="10" max="32" value="${Number(s.radius||20)}"></div></div></div><div class="card"><h3>ألوان الثيم</h3><div class="swatch-row">${[['primary','الأساسي'],['primary2','الثانوي'],['accent','المساعد'],['bg','الخلفية'],['card','البطاقات'],['text','النص'],['muted','الثانوي'],['line','الفواصل']].map(([k,l])=>`<label>${l}<input type="color" id="color_${k}" value="${esc(s[k])}"></label>`).join('')}</div></div><div class="card"><h3>الشعار</h3><img id="logoPreview" src="${esc(s.logoUrl||'./assets/logo-placeholder.svg')}" alt="المعاينة" style="width:96px;height:96px;border-radius:20px;object-fit:cover;border:1px solid var(--line)"><div class="toolbar-actions" style="margin-top:12px"><label class="btn soft" style="cursor:pointer">رفع شعار <input id="logoFile" type="file" accept="image/*" hidden></label><button class="btn danger" id="removeLogo">إزالة الشعار</button></div><small class="muted">PNG/JPG/WebP — بحد أقصى 3MB.</small></div></div><div class="card" style="margin-top:14px"><div class="toolbar"><div><h3>المعاينة</h3><small>يتغير الشكل فورًا قبل الحفظ</small></div><button class="btn primary" id="saveAppearance">حفظ المظهر</button></div><div class="preview-box"><span class="eyebrow">مثال</span><h3>بطاقة معاينة</h3><p class="muted">هذا مثال على الثيم الذي سيظهر للمستخدمين.</p><button class="btn primary">زر رئيسي</button></div></div>`;
  const liveKeys=['primary','primary2','accent','bg','card','text','muted','line'];liveKeys.forEach(k=>$('color_'+k).addEventListener('input',()=>{document.documentElement.style.setProperty('--'+k,$('color_'+k).value);}));$('setRadius').addEventListener('input',()=>document.documentElement.style.setProperty('--radius',`${$('setRadius').value}px`));$('setMode').onchange=()=>{document.body.classList.toggle('dark',$('setMode').value==='dark'||($('setMode').value==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));};$('setDensity').onchange=()=>{document.body.classList.toggle('density-compact',$('setDensity').value==='compact');document.body.classList.toggle('density-spacious',$('setDensity').value==='spacious');};
  $('logoFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>3*1024*1024)return toast('حجم الشعار أكبر من 3MB.');showBusy(true,'جاري رفع الشعار…');try{const path=`branding/logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const storageRef=ref(storage,path);await uploadBytes(storageRef,file,{contentType:file.type});const url=await getDownloadURL(storageRef);state.settings.logoUrl=url;state.settings.logoPath=path;$('logoPreview').src=url;toast('تم رفع الشعار. اضغط حفظ المظهر لتثبيته.');}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
  $('removeLogo').onclick=()=>{state.settings.logoUrl='';state.settings.logoPath='';$('logoPreview').src='./assets/logo-placeholder.svg';};
  $('saveAppearance').onclick=async()=>{showBusy(true,'جاري حفظ المظهر…');try{const payload={siteName:$('setSite').value, collegeName:$('setCollege').value, tagline:$('setTagline').value, mode:$('setMode').value, density:$('setDensity').value, radius:Number($('setRadius').value), showLogo:$('setShowLogo').checked, logoUrl:state.settings.logoUrl, logoPath:state.settings.logoPath};liveKeys.forEach(k=>payload[k]=$('color_'+k).value);await callFn('saveSiteSettings',payload);await loadSettings();toast('تم حفظ المظهر.');}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

async function renderAudit(){
  const rows=await callFn('listAuditLogs');
  $('adminBody').innerHTML=`<div class="toolbar"><div><h3>سجل العمليات</h3><small class="muted">آخر 300 عملية</small></div></div>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>المستخدم</th><th>العملية</th><th>الهدف</th><th>التفاصيل</th><th>التاريخ</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.userName)}</td><td>${esc(r.action)}</td><td>${esc(r.target)}</td><td>${esc(r.details)}</td><td>${fmt(r.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">لا يوجد سجل بعد.</div>'}`;
}

function openProfileModal(){
  const p=state.profile;const m=modal(`<div class="modal-head"><h3>حسابي</h3><button class="close-btn">×</button></div><form class="stack-form" id="profileForm"><label>الاسم<input id="pfName" value="${esc(p.name||'')}"></label><label>البريد الإلكتروني<input value="${esc(p.email||'')}" disabled></label><label>رقم الهاتف<input id="pfPhone" value="${esc(p.phone||'')}" type="tel"></label><label>الدور<input value="${esc(roleLabel(p.role))}" disabled></label><label>المستوى<input value="${esc(levelName(p.level))}" disabled></label><button class="btn primary wide" type="submit">حفظ التعديلات</button></form>`);m.querySelector('.close-btn').onclick=()=>m.remove();m.querySelector('#profileForm').onsubmit=async e=>{e.preventDefault();showBusy(true);try{await updateDoc(doc(db,'users',state.user.uid),{name:m.querySelector('#pfName').value.trim(),phone:m.querySelector('#pfPhone').value.trim(),updatedAt:serverTimestamp()});await updateAuthProfile(state.user,{displayName:m.querySelector('#pfName').value.trim()});await loadProfile(state.user.uid);renderShell();m.remove();toast('تم تحديث الحساب.');}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
}

function bindEvents(){
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('forgotForm').addEventListener('submit', handleForgot);
  $('signupBtn').onclick=()=>authSwitch('signupCard'); $('backLoginBtn').onclick=()=>authSwitch('loginCard'); $('forgotBtn').onclick=()=>{ $('forgotEmail').value=$('loginEmail').value; authSwitch('forgotCard'); }; $('forgotBackBtn').onclick=()=>authSwitch('loginCard');
  document.querySelectorAll('[data-password-toggle]').forEach(btn=>btn.onclick=()=>{const input=$(btn.dataset.passwordToggle);const is=input.type==='password';input.type=is?'text':'password';btn.textContent=is?'إخفاء':'إظهار';});
  document.querySelectorAll('.side-nav,.mobile-nav-btn').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  $('logoutBtn').onclick=async()=>{await signOut(auth);};
  $('refreshBtn').onclick=async()=>{showBusy(true,'تحديث البيانات…');try{await loadPublicData();await loadMyResults();await showPage(state.page);}catch(e){toast(friendlyError(e));}finally{showBusy(false);}};
  $('themeQuickBtn').onclick=()=>{state.localDark=!state.localDark;localStorage.setItem('site_dark',state.localDark?'1':'0');applySettings(state.settings);};
  document.querySelector('.user-chip').onclick=openProfileModal;
}

async function bootAuthUser(user){
  if(state.pendingSignup){ setTimeout(()=>bootAuthUser(user), 500); return; }
  if(!user){
    state.user=null;state.profile=null;$('appView').classList.add('hidden');$('authView').classList.remove('hidden');showBusy(false);return;
  }
  showBusy(true,'جاري تجهيز حسابك…');
  try {
    state.user=user; await loadProfile(user.uid); await loadSettings(); await loadPublicData(); await loadMyResults(); renderShell(); $('authView').classList.add('hidden');$('appView').classList.remove('hidden');setPage('home');renderHome();showBusy(false);
  } catch(e){ toast(friendlyError(e)); await signOut(auth); showBusy(false); }
}

async function main(){
  bindEvents();
  if(!firebaseConfigured){ applySettings(DEFAULT_SETTINGS); toast('أكمل إعداد Firebase في firebase-config.js ثم أعد تحميل الصفحة.'); return; }
  try {
    firebaseApp=initializeApp(firebaseConfig);auth=getAuth(firebaseApp);db=getFirestore(firebaseApp);storage=getStorage(firebaseApp);
    applySettings(DEFAULT_SETTINGS);
    onAuthStateChanged(auth,bootAuthUser);
    setInterval(async()=>{if(state.user){try{await loadProfile(state.user.uid); }catch(e){ await signOut(auth); }}},120000);
  } catch(e){ toast('تعذر تهيئة Firebase: '+friendlyError(e)); }
}

main();
