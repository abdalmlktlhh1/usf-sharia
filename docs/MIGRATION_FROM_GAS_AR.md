# الانتقال من نسخة Google Apps Script القديمة

هذه النسخة الجديدة تعمل كمنصة Firebase مستقلة.

## لا تحذف المشروع القديم الآن
احتفظ بمشروع Apps Script وجدول Google Sheets القديم حتى تنتهي من اختبار Firebase.

## ما الذي سينتقل؟
- حسابات الطلاب: تُنشأ/تُعاد من Firebase Authentication.
- ملفات الطلاب: Firestore / users.
- المقررات: Firestore / courses.
- الاختبارات: Firestore / exams + examKeys.
- النتائج: Firestore / results.
- الإعلانات: announcements.
- التقارير: reports.
- الأنشطة: activities.
- الوسائط: media.
- إعدادات الشكل: settings/site.
- سجل العمليات: auditLogs.

## ملاحظة عن كلمات المرور
لا يمكن نقل كلمات المرور القديمة المخزنة كـ SHA-256 في Google Sheets إلى Firebase Authentication بصورتها الحالية؛ الطريقة الصحيحة هي مطالبة المستخدمين بإنشاء كلمة مرور جديدة أو استخدام استرجاع كلمة المرور بعد إنشاء حساب Firebase.

## ترتيب التشغيل المقترح
1. إنشاء Firebase project.
2. إعداد Authentication وFirestore وStorage وFunctions وHosting.
3. رفع النسخة الجديدة.
4. إنشاء حساب المالك من Gmail.
5. ترقية الحساب يدويًا إلى owner في Firestore في أول مرة.
6. اختبار الطلاب والاختبارات والإدارة.
7. بعد التأكد من البيانات، نقل المحتوى القديم تدريجيًا.
8. إبقاء Google Sheets كنسخة أرشيفية حتى اكتمال النقل.
