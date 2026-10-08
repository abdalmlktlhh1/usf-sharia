# منصة خدمة الطلاب — كلية الشريعة والقانون

هذا هو المستودع الحالي لمنصة `usf-sharia`، وليس مشروعًا منفصلًا. التطبيق مبني على Firebase Authentication وCloud Firestore وCloud Storage وCloud Functions وFirebase Hosting.

## تسجيل الطالب والملف الدراسي

- ينشئ الطالب حسابًا حقيقيًا عبر Firebase بالبريد وكلمة المرور، أو يتابع باستخدام Google.
- بعد الدخول لأول مرة تظهر صفحة مستقلة لاختيار المستوى الأول أو الثاني أو الثالث أو الرابع، ثم مقرر من قائمة ذلك المستوى.
- تُحفظ بيانات الطالب في `users/{uid}`، ويُحفظ المقرر مع المستوى بعد التحقق منهما معًا.
- قواعد Firestore تقصر إنشاء الملف على دور `student` النشط، ولا تسمح للطالب بتغيير دوره أو حالة الحساب أو بيانات البريد. اختيار المستوى والمقرر يُستكمل مرة واحدة، ولا يُقبل مقرر من مستوى آخر.
- تبقى لوحة المنصة الحالية، والاختبارات والنتائج والإعلانات والإدارة كما هي؛ المقرر المختار جزء من الملف الدراسي ولا ينشئ تلقائيًا مقررًا إداريًا جديدًا في مجموعة `courses`.

## العمل دون اتصال

- يُبنى Firebase SDK داخل `public/app.js` بدل تحميل وحداته من CDN.
- يخزن Service Worker ملفات الواجهة العامة فقط. لا يخزن استجابات Firebase الخاصة بالمستخدمين في Cache API.
- يستخدم Firestore تخزينًا محليًا دائمًا على الجهاز للبيانات التي سبق تحميلها، وتبقى الجلسة المحفوظة متاحة على الجهاز نفسه.
- إنشاء الحساب، نافذة Google، وأول تحميل لملف أو بيانات غير مخزنة تحتاج إلى الإنترنت. يمكن فتح واجهة سبق تحميلها والعمل بالبيانات المتاحة دون اتصال؛ تُزامن تعديلات اختيار المستوى والمقرر عند عودة الاتصال.

## إعداد Firebase

المشروع مربوط بإعداد Firebase Web للتطبيق `usf-sharia` في `public/firebase-config.js`. هذا إعداد عميل عام وليس مفتاح خدمة أو كلمة مرور؛ لا تضع Service Account Key في الواجهة أو المستودع.

في Firebase Console للمشروع القائم تأكد من تفعيل:

1. Authentication → Sign-in method → Email/Password.
2. Authentication → Sign-in method → Google.
3. إضافة نطاق الاستضافة، مثل `usf-sharia.web.app`، إلى Authentication → Settings → Authorized domains.
4. Firestore Database وStorage وCloud Functions حسب الخدمات المستخدمة في الموقع.

لأي حساب طالب جديد، ينشئ التطبيق ملفًا أوليًا محدودًا ثم يطلب المستوى والمقرر. إذا كان المشروع جديدًا تمامًا ولا يوجد مالك، أنشئ أول حساب من الموقع ثم غيّر يدويًا في Firestore `users/{UID}` الحقول `role=owner` و`level=all` و`active=true`، ثم سجّل الخروج والدخول. لا تمنح دور المالك عبر واجهة عامة.

## البناء والاختبار

من جذر المستودع استخدم Node.js 22:

```bash
npm ci
npm test
npm run test:rules
npm run build
npm run check
npm ci --prefix functions
npm --prefix functions run lint
```

يشغّل `npm run test:rules` محاكي Firestore محليًا على مشروع تجريبي `demo-usf-sharia`؛ لا يتصل ببيانات الإنتاج.

لتشغيل نسخة معاينة محلية:

```bash
npm run serve
```

ولتهيئة Firebase CLI على الجهاز عند الحاجة:

```bash
npm install -g firebase-tools
cp .firebaserc.example .firebaserc
firebase login
```

## النشر لاحقًا

هذه التغييرات مُعدة للمراجعة فقط ولم تُنشر على الموقع الحي. بعد اعتمادها، وبعد التأكد من مزودي المصادقة والنطاقات والقواعد، يمكن بناء الحزمة ثم نشر الواجهة والقواعد فقط:

```bash
npm ci
npm run build
firebase deploy --only hosting,firestore:rules
```

لا تحذف بيانات Google Sheets القديمة أو تغيّر Functions/Storage أثناء مراجعة هذه التغييرات. سير GitHub يفحص البناء والاختبارات ولا ينفذ نشر Firebase.
