# منصة خدمة الطلاب — Firebase Pro

نسخة جديدة مبنية حول **Firebase Authentication + Cloud Firestore + Cloud Storage + Cloud Functions + Firebase Hosting** بدل الاعتماد على Google Sheets وكلمات المرور المخزنة في جدول.

## ما الذي تغير؟
- تسجيل دخول فعلي عبر Firebase Authentication.
- إنشاء حساب جديد من الموقع: Gmail إلزامي، الاسم إلزامي، الهاتف اختياري، المستوى إلزامي، وكلمة مرور.
- استرجاع كلمة المرور عبر البريد الإلكتروني.
- لا يوجد مربع بيانات دخول تجريبي في واجهة الدخول.
- لوحة تحكم متعددة الأدوار مع صلاحيات خادمية.
- إدارة المستخدمين وتفعيل/إيقاف الحسابات وتغيير الأدوار.
- إدارة المقررات.
- إنشاء اختبارات بأسئلة اختيار من متعدد وصح/خطأ.
- التصحيح يتم على الخادم، ومفاتيح الإجابة لا يقرأها الطالب من Firestore.
- منع إعادة أداء الاختبار نفسه للمستخدم نفسه.
- النتائج الخاصة بالطالب، ونتائج الإدارة.
- الإعلانات والتقارير والأنشطة والوسائط.
- لوحة كاملة لتخصيص اسم الموقع والألوان والوضع الفاتح/الداكن/حسب الجهاز، الكثافة، استدارة البطاقات.
- رفع شعار الموقع أو إزالته عبر Firebase Storage.
- سجل عمليات Audit.
- قواعد Firestore وStorage تمنع الكتابة الحساسة مباشرة من العميل.

## 1) أنشئ مشروع Firebase
من Firebase Console أنشئ مشروعًا جديدًا.

فعّل:
1. Authentication → Sign-in method → Email/Password.
2. Firestore Database.
3. Storage.
4. Functions.
5. Hosting.

## 2) أضف تطبيق Web
من Project settings → Your apps → Web app، انسخ إعدادات Firebase إلى:

`public/firebase-config.js`

اترك أسماء الحقول كما هي، واستبدل القيم التجريبية فقط.

## 3) تسجيل أول حساب
افتح الموقع وسجّل حساب Gmail عادي.

بعد إنشاء أول حساب، إذا كان المشروع جديدًا ولا يوجد مالك، افتح Firestore Console ثم:

`users/{UID}`

وغيّر:
- `role` إلى `owner`
- `level` إلى `all`
- `active` إلى `true`

بعد ذلك سجّل الخروج ثم الدخول من جديد.

> هذه الخطوة اليدوية مقصودة حتى لا يستطيع أي شخص يسبقك إلى التسجيل العام أن يحصل على دور المالك تلقائيًا.

## 4) تثبيت الحزم
من جذر المشروع:

```bash
npm install -g firebase-tools
cd functions
npm install
cd ..
```

Cloud Functions في هذه النسخة تستخدم Node.js 22. Firebase توثّق دعم Node.js 20 و22 حاليًا. 

## 5) ربط المشروع
أنشئ ملف `.firebaserc` من المثال:

```bash
cp .firebaserc.example .firebaserc
```

ثم استبدل `YOUR_FIREBASE_PROJECT_ID` بمعرّف مشروعك.

سجّل الدخول:

```bash
firebase login
```

## 6) نشر القواعد والدوال والاستضافة
من جذر المشروع:

```bash
firebase deploy --only firestore,storage,functions,hosting
```

أو الاستضافة وحدها بعد اكتمال البنية:

```bash
firebase deploy --only hosting
```

## 7) البيانات القديمة في Google Sheets
النسخة الجديدة **لا تعتمد على قاعدة Google Sheets القديمة** لتسجيل الدخول.
لا تحذف جدولك القديم حتى تتأكد أن كل البيانات المطلوبة نُقلت إلى Firestore.

## 8) سيناريوهات مهمة تم أخذها بالحسبان
- حساب موقوف: تتم مصادقة Firebase لكن يمنع التطبيق الحساب من الدخول إلى المنصة.
- انتهاء الجلسة/تسجيل الخروج.
- بريد غير Gmail أثناء التسجيل: مرفوض من الواجهة.
- بريد مستخدم مسبقًا.
- كلمة مرور أقل من 8 أحرف.
- تغيير دور الطالب أو إيقافه من لوحة الإدارة.
- حماية المالك من الإيقاف والحذف وتغيير الدور.
- مدير المستوى لا يستطيع إدارة مستوى آخر عبر Cloud Functions.
- الطالب لا يستطيع إنشاء نتيجة مزورة مباشرة في Firestore.
- مفتاح تصحيح الاختبار في مجموعة `examKeys` غير متاحة للعميل.
- رفع الشعار محصور بحسابات الإدارة وبصيغة صورة وحجم محدد.
- الأرشفة بدل الحذف المباشر لبعض أنواع المحتوى.
- سجل عمليات للإجراءات الإدارية الحساسة.

## 9) ملاحظات أمان
لا تضع Service Account Key داخل مجلد `public` أو داخل المتصفح.
إعداد Firebase Web الظاهر في `firebase-config.js` ليس كلمة سر؛ حماية المشروع تعتمد على Authentication وFirestore Rules وStorage Rules وCloud Functions.

## 10) المراجع الرسمية
- Firebase Authentication / Password auth: https://firebase.google.com/docs/auth/web/password-auth
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Firebase Hosting: https://firebase.google.com/docs/hosting/quickstart
- Cloud Storage uploads: https://firebase.google.com/docs/storage/web/upload-files
- Callable Cloud Functions: https://firebase.google.com/docs/functions/callable
