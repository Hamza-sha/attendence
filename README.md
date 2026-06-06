# 🎓 Smart Barcode Attendance System
**نظام الحضور بالباركود الذكي**

---

## 👥 فريق العمل
| الاسم | الرقم الجامعي |
|-------|--------------|
| Saja Nasser Kassrawi | 2020901164 |
| Hadeel Loui Bani Khalaf | 2022801015 |

**المادة:** CS 499A — Graduation Project A

---

## 📁 هيكل المشروع
```
sas-project/
├── frontend/
│   ├── index.html          ← الصفحة الرئيسية
│   ├── css/
│   │   └── style.css       ← كل التنسيقات
│   └── js/
│       ├── app.js          ← المنطق الأساسي + API + Auth
│       ├── instructor.js   ← صفحات المشرف
│       └── student.js      ← صفحات الطالب
│
├── backend/
│   ├── config/
│   │   └── database.php    ← إعدادات قاعدة البيانات
│   ├── includes/
│   │   └── helpers.php     ← دوال مساعدة + JWT
│   └── api/
│       ├── setup.php       ← إعداد النظام أول مرة
│       ├── auth.php        ← تسجيل الدخول + تغيير الباسوورد
│       ├── students.php    ← إدارة الطلاب (CRUD)
│       ├── instructors.php ← إدارة المشرفين (CRUD)
│       ├── sessions.php    ← الجلسات + تسجيل الحضور
│       ├── reports.php     ← التقارير
│       └── settings.php    ← إعدادات النظام
│
└── database/
    └── schema.sql          ← جداول قاعدة البيانات
```

---

## ⚙️ متطلبات التشغيل
- **PHP** 8.0 أو أحدث
- **MySQL** 8.0 أو أحدث
- **Web Server:** Apache أو Nginx (أو XAMPP/WAMP للتطوير)
- متصفح حديث يدعم JavaScript ES2020+

---

## 🚀 خطوات التشغيل

### 1. تجهيز قاعدة البيانات
```sql
-- افتح phpMyAdmin أو MySQL CLI وشغّل:
source /path/to/sas-project/database/schema.sql
```
أو عبر phpMyAdmin:
1. أنشئ قاعدة بيانات جديدة اسمها `sas_db`
2. اختر **Import** وارفع ملف `database/schema.sql`

### 2. ضبط إعدادات الاتصال
افتح الملف `backend/config/database.php` وعدّل:
```php
define('DB_HOST', 'localhost');  // عادةً localhost
define('DB_NAME', 'sas_db');
define('DB_USER', 'root');       // اسم مستخدم MySQL
define('DB_PASS', '');           // كلمة مرور MySQL
```
> **مهم:** غيّر `JWT_SECRET` إلى نص عشوائي طويل قبل النشر على سيرفر حقيقي.

### 3. رفع الملفات على السيرفر
- **XAMPP:** انسخ مجلد `sas-project` إلى `C:/xampp/htdocs/`
- **WAMP:**  انسخ إلى `C:/wamp64/www/`
- **Linux:** انسخ إلى `/var/www/html/`

### 4. افتح المتصفح
```
http://localhost/sas-project/frontend/index.html
```

---

## 🏛️ أول تشغيل — Setup Wizard
عند أول فتح للموقع ستظهر شاشة الإعداد بـ 3 خطوات:

| الخطوة | المحتوى |
|--------|---------|
| 1 | اسم الجامعة، الكلية، السنة الدراسية |
| 2 | تحديد موقع GPS للجامعة + النطاق المسموح |
| 3 | إنشاء أول حساب مشرف (admin) |

> بعد إتمام الإعداد، يمكن إضافة مشرفين إضافيين من **لوحة التحكم ← المشرفون**

---

## 👨‍🏫 دليل المشرف

### تسجيل الطلاب
- انتقل إلى **الطلاب** ← **+ إضافة طالب**
- أدخل الرقم الجامعي والاسم
- كلمة المرور الافتراضية = الرقم الجامعي (يُغيَّر إجباراً عند أول دخول)

### أخذ الحضور
1. انتقل إلى **تسجيل الحضور**
2. سيُنشأ باركود للجلسة تلقائياً (يتجدد كل 30 ثانية)
3. اعرض الباركود على الشاشة
4. الطلاب يمسحونه من **مسح الباركود** في حساباتهم
5. عند الانتهاء اضغط **إنهاء الجلسة** لتسجيل الغيابات تلقائياً

### نظام الغيابات
| الغيابات | اللون | الحالة |
|---------|-------|--------|
| 0-1 | 🔵 | آمن |
| 2-3 | 🟠 | تحذير |
| 4-6 | 🔴 | خطر |
| 7+  | ⛔ | محروم |

---

## 👨‍🎓 دليل الطالب

### أول دخول
1. اختر **طالب** في شاشة الدخول
2. أدخل رقمك الجامعي
3. كلمة المرور = رقمك الجامعي
4. ستُطلب منك تغييرها فوراً

### تسجيل الحضور
1. انتقل إلى **مسح الباركود**
2. اضغط **التحقق من موقعي** (يجب أن تكون في الجامعة)
3. بعد التحقق، افتح الكاميرا وامسح الباركود الظاهر على شاشة المشرف

---

## 🔧 API Endpoints

| Endpoint | Method | الوصف |
|----------|--------|-------|
| `api/setup.php` | POST | إعداد النظام أول مرة |
| `api/auth.php?action=login` | POST | تسجيل الدخول |
| `api/auth.php?action=change_password` | POST | تغيير كلمة المرور |
| `api/students.php` | GET/POST/PUT/DELETE | إدارة الطلاب |
| `api/instructors.php` | GET/POST/PUT/DELETE | إدارة المشرفين |
| `api/sessions.php?action=start` | POST | بدء جلسة |
| `api/sessions.php?action=scan` | POST | مسح الباركود |
| `api/sessions.php?action=end` | POST | إنهاء الجلسة |
| `api/reports.php?type=summary` | GET | تقرير الحضور |
| `api/settings.php` | GET/PUT | الإعدادات |

---

## 🛠️ التقنيات المستخدمة
| الطبقة | التقنية |
|--------|---------|
| Frontend | HTML5 + CSS3 + JavaScript (ES2020) |
| Backend | PHP 8.0 |
| Database | MySQL 8.0 |
| Barcode | JsBarcode (توليد) + ZXing (مسح) |
| Auth | JWT (JSON Web Tokens) |
| GPS | HTML5 Geolocation API |

---

## 📝 ملاحظات
- النظام يعمل بالكامل عبر المتصفح — لا يحتاج تطبيق
- الباركود يتجدد كل 30 ثانية لمنع إرسال الصورة بين الطلاب
- الموقع الجغرافي إجباري للطالب عند مسح الباركود
- يدعم المسح بالكاميرا أو الإدخال اليدوي
