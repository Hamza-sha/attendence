'use strict';
// ============================================================
// student.js — صفحات الطالب
// ============================================================

// ── صفحة غياباتي ──────────────────────────────────────────
async function myAbsences() {
    // نُحاول تحديث البيانات من السيرفر
    // لو فشل، نستخدم البيانات المحفوظة في currentUser
    const res = await api('auth.php?action=login', 'POST', {
        role:       'student',
        student_id: currentUser.student_id,
        password:   '_refresh_' // باسوورد غير صحيح — سيفشل ونستخدم البيانات المحفوظة
    });

    // نقرأ البيانات من currentUser (المحفوظة عند تسجيل الدخول)
    const abs    = currentUser.absences  || 0;     // عدد الغيابات (0 لو غير محدد)
    const banned = currentUser.is_banned || false;  // محروم؟
    const name   = currentUser.name;               // الاسم الكامل
    const sid    = currentUser.student_id;         // الرقم الجامعي
    const max    = 6;                              // الحد الأقصى للغيابات المسموح بها

    // نحسب النسبة المئوية لشريط التقدم
    // Math.min: يضمن عدم تجاوز 100% حتى لو الغيابات أكثر من 7
    const pct = Math.min(abs / 7 * 100, 100);

    // نحدد لون الشريط حسب عدد الغيابات
    // absCol: دالة من app.js ترجع لون CSS
    const col = absCol(abs, banned);

    // نُعدّ نص الحالة
    const status = banned    ? '⛔ محروم'   :
                   abs >= 4  ? '🔴 خطر'    :
                   abs >= 2  ? '🟠 تحذير'  :
                               '🟢 آمن';

    html(`
    <div class="page-hdr"><h2>غياباتي</h2></div>
    <div class="card" style="max-width:480px">
      <div class="card-body">

        <!-- معلومات الطالب -->
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:17px;font-weight:700">${name}</div>
          <div style="font-size:12px;color:var(--text2)">الرقم الجامعي: ${sid}</div>
        </div>

        <!-- العداد الكبير: عدد الغيابات -->
        <div class="big-counter">
          <!-- اللون يتغير حسب الحالة -->
          <div class="num" style="color:${col}">${abs}</div>
          <div class="lbl">غياب من أصل ${max} مسموح</div>
        </div>

        <!-- شريط التقدم المرئي -->
        <div class="prog-bg" style="margin:10px 0">
          <!-- width: نسبة مئوية من الحد الأقصى 7 -->
          <!-- background: اللون حسب الحالة -->
          <div class="prog-fill" style="width:${pct}%;background:${col}"></div>
        </div>

        <!-- الحالة بالنص والرمز -->
        <div style="text-align:center;font-size:20px;font-weight:700;margin:12px 0">${status}</div>

        <!-- تحذير إذا اقترب من الحرمان (5 غيابات وليس محروماً بعد) -->
        ${abs >= 5 && !banned
            ? `<div class="warn-box">⚠️ لديك ${abs} غياب. غياب واحد آخر وستكون محروماً!</div>`
            : ''
        }

        <!-- رسالة الحرمان لو محروم -->
        ${banned
            ? `<div class="warn-box">⛔ لقد تجاوزت حد الغياب المسموح وأنت محروم من هذه المادة.</div>`
            : ''
        }

      </div>
    </div>
    `);
}

// ── صفحة سجل الحضور ───────────────────────────────────────
async function myHistory() {
    // نُحاول جلب سجل الجلسات
    // ملاحظة: sessions.php للمشرف فقط، لذا نعرض رسالة توضيحية للطالب
    const res = await api('sessions.php');

    html(`
    <div class="page-hdr"><h2>سجل الحضور</h2></div>
    <div class="info-box">
      سجل حضورك التفصيلي يمكن مراجعته مع المشرف.<br>
      الغيابات الحالية موضحة في صفحة <strong>غياباتي</strong>.
    </div>
    `);
}

// ── صفحة مسح الباركود ─────────────────────────────────────

// stuGPS: يخزّن موقع الطالب بعد التحقق منه
let stuGPS = null;

async function scanBarcode() {
    // نوقف الكاميرا لو كانت مفتوحة من قبل
    stopCam();
    stuGPS = null; // نُعيد تعيين الموقع

    // نجلب إعدادات GPS من السيرفر
    const settRes = await api('settings.php');

    // ?. (Optional Chaining): لو settRes.data فارغ لا خطأ، يُرجع null
    const uniLat = settRes.data?.gps_lat   || null; // خط عرض الجامعة
    const uniLng = settRes.data?.gps_lng   || null; // خط طول الجامعة
    const radius = settRes.data?.gps_radius || 200; // النطاق بالمتر

    html(`
    <div class="page-hdr"><h2>مسح باركود الجلسة</h2></div>
    <div class="card" style="max-width:480px">
      <div class="card-body">

        <!-- الخطوة 1: التحقق من GPS -->
        <div style="margin-bottom:20px">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <!-- رقم الخطوة في دائرة -->
            <span style="background:var(--accent);color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px">1</span>
            التحقق من موقع GPS
          </div>
          <!-- gpsArea: يُحدَّث بـ JavaScript حسب نتيجة GPS -->
          <div id="gpsArea">
            <!-- نُمرّر إحداثيات الجامعة للدالة -->
            <button type="button" class="btn btn-primary" style="width:100%"
              onclick="checkGPS(${uniLat},${uniLng},${radius})">📍 التحقق من موقعي</button>
          </div>
        </div>

        <!-- الخطوة 2: مسح الباركود -->
        <!-- opacity:.35;pointer-events:none: معطّل حتى تنجح الخطوة 1 -->
        <div id="scanArea" style="opacity:.35;pointer-events:none">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span style="background:var(--accent);color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px">2</span>
            مسح باركود الجلسة
          </div>

          <!-- صندوق الكاميرا: مخفي حتى يُضغط زر فتح الكاميرا -->
          <div id="camWrap" style="display:none">
            <div class="scan-wrap">
              <!-- video: يعرض صورة الكاميرا مباشرة -->
              <!-- autoplay: يبدأ التشغيل فوراً -->
              <!-- playsinline: يمنع ملء الشاشة على iPhone -->
              <!-- muted: يوقف الصوت -->
              <video id="camVid" autoplay playsinline muted></video>

              <!-- إطار المسح المتحرك فوق الكاميرا -->
              <div class="scan-overlay">
                <div class="scan-frame">
                  <!-- زوايا الإطار -->
                  <div class="sc tl"></div><div class="sc tr"></div>
                  <div class="sc bl"></div><div class="sc br"></div>
                  <!-- خط المسح المتحرك -->
                  <div class="scan-line"></div>
                </div>
              </div>

              <!-- زر إيقاف الكاميرا -->
              <button class="cam-stop" onclick="stopCamScan()">✕ إيقاف</button>
            </div>

            <!-- canvas مخفي: يُستخدم لمعالجة صور الكاميرا بـ ZXing -->
            <canvas id="camCanvas" style="display:none"></canvas>
          </div>

          <!-- رسالة خطأ الكاميرا -->
          <div id="camErr" style="display:none" class="alert alert-err"></div>

          <!-- زر فتح الكاميرا -->
          <button type="button" id="openCamBtn" class="btn btn-ghost"
            style="width:100%;margin-bottom:10px" onclick="startCamScan()">📷 فتح الكاميرا للمسح</button>

          <!-- بديل: إدخال الرمز يدوياً -->
          <div class="divider">أو أدخل الرمز يدوياً</div>
          <div class="flex-row">
            <!-- direction:ltr: التوكن SAS-... يُكتب من اليسار -->
            <!-- onkeydown Enter: يُرسل عند الضغط Enter -->
            <input id="bcInput" placeholder="الصق رمز الباركود هنا..."
              style="flex:1;padding:9px 13px;background:var(--bg);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-size:13px;font-family:var(--font);direction:ltr;outline:none"
              onkeydown="if(event.key==='Enter')verifyToken()" />
            <button type="button" class="btn btn-success" onclick="verifyToken()">✅</button>
          </div>

          <!-- نتيجة المسح تظهر هنا -->
          <div id="scanResult" style="margin-top:10px"></div>
        </div>

      </div>
    </div>
    `);
}

// checkGPS(): يتحقق من موقع الطالب ويقارنه بموقع الجامعة
window.checkGPS = function(uniLat, uniLng, radius) {
    const area = g('gpsArea'); // منطقة عرض حالة GPS

    // نُظهر رسالة التحميل مع دوار
    area.innerHTML = `<div class="gps-checking"><div class="spinner"></div>جاري تحديد موقعك...</div>`;

    // نتحقق أن المتصفح يدعم GPS
    if (!navigator.geolocation) {
        area.innerHTML = '<div class="alert alert-err">المتصفح لا يدعم GPS</div>';
        return;
    }

    // نطلب الموقع من الجهاز
    navigator.geolocation.getCurrentPosition(pos => {
        // نحسب المسافة بين الطالب والجامعة
        // haversine: دالة من app.js
        // لو uniLat = null (لم يُعدّ GPS)، ترجع 0
        const dist = uniLat
            ? haversine(pos.coords.latitude, pos.coords.longitude, uniLat, uniLng)
            : 0;

        // نحفظ موقع الطالب وهو الموقع الذي سيُرسَل للسيرفر
        stuGPS = {
            lat:  pos.coords.latitude,
            lng:  pos.coords.longitude,
            dist: dist
        };

        // نتحقق: هل الطالب داخل النطاق المسموح؟
        if (dist <= radius || !uniLat) {
            // نجح: يُظهر رسالة نجاح ويُفعّل منطقة المسح
            area.innerHTML = `<div class="alert alert-ok">✅ تم التحقق من الموقع — ${Math.round(dist)}م من الحرم الجامعي</div>`;

            // نُفعّل الخطوة الثانية (المسح)
            const sa = g('scanArea');
            sa.style.opacity      = '1';    // نُظهرها بالكامل
            sa.style.pointerEvents = '';    // نُمكّن التفاعل
        } else {
            // فشل: يُظهر المسافة ورسالة خطأ وزر إعادة المحاولة
            area.innerHTML = `
              <div class="alert alert-err">
                ❌ أنت على بُعد ${Math.round(dist)}م — يجب أن تكون ضمن ${radius}م من الجامعة
              </div>
              <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px"
                onclick="checkGPS(${uniLat},${uniLng},${radius})">🔄 إعادة المحاولة</button>`;
        }
    }, () => {
        // الدالة الثانية: تُستدعى عند الفشل (رفض الصلاحية أو لا إشارة)
        area.innerHTML = `
          <div class="alert alert-err">❌ تعذر تحديد الموقع</div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px"
            onclick="checkGPS(${uniLat},${uniLng},${radius})">🔄 إعادة المحاولة</button>`;
    }, {
        enableHighAccuracy: true,  // استخدم GPS الحقيقي وليس WiFi (أدق)
        timeout:            12000  // انتظر 12 ثانية كحد أقصى
    });
};

// startCamScan(): يفتح الكاميرا ويبدأ المسح
window.startCamScan = function() {
    const err = g('camErr');
    err.style.display = 'none'; // نُخفي أي خطأ سابق

    // نتحقق أن المتصفح يدعم الكاميرا
    // ?. (Optional Chaining): لو mediaDevices غير موجود لا خطأ
    if (!navigator.mediaDevices?.getUserMedia) {
        err.textContent   = 'الكاميرا غير مدعومة في هذا المتصفح';
        err.style.display = 'block';
        return;
    }

    // نطلب صلاحية الكاميرا من المستخدم
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment' // الكاميرا الخلفية للهاتف
        }
    })
    .then(stream => {
        // نجح فتح الكاميرا
        camStream = stream; // نحفظ المجرى لإمكانية إيقافه لاحقاً

        g('camWrap').style.display  = 'block'; // نُظهر صندوق الكاميرا
        g('openCamBtn').style.display = 'none'; // نُخفي زر الفتح

        const v = g('camVid');
        v.srcObject = stream; // نوصّل الكاميرا بعنصر video
        v.play();             // نبدأ التشغيل

        // loadeddata: حدث يُطلق عندما تصبح الكاميرا جاهزة للمعاينة
        // {once:true}: ننتظره مرة واحدة فقط
        v.addEventListener('loadeddata', () => {
            // نبدأ دورة المسح
            // requestAnimationFrame: ينفذ scanFrame قبل كل frame جديد
            camRAF = requestAnimationFrame(scanFrame);
        }, { once: true });
    })
    .catch(e => {
        // فشل: المستخدم رفض الصلاحية أو لا توجد كاميرا
        err.textContent   = 'تعذر الوصول للكاميرا: ' + (e.message || e);
        err.style.display = 'block';
    });
};

// stopCamScan(): يوقف الكاميرا ويُعيد إظهار زر فتحها
window.stopCamScan = function() {
    stopCam(); // يوقف الكاميرا (دالة من app.js)
    const w = g('camWrap');
    const b = g('openCamBtn');
    if (w) w.style.display = 'none'; // يُخفي صندوق الكاميرا
    if (b) b.style.display = 'block'; // يُظهر زر الفتح مجدداً
};

// scanFrame(): دورة المسح — تُستدعى مع كل frame من الكاميرا
function scanFrame() {
    const v = g('camVid');    // عنصر الفيديو
    const c = g('camCanvas'); // الـ canvas المخفي

    // HAVE_ENOUGH_DATA: حالة تعني أن الكاميرا لديها بيانات كافية للعرض
    // لو لم تجهز بعد، ننتظر الـ frame التالي
    if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) {
        camRAF = requestAnimationFrame(scanFrame);
        return;
    }

    const ctx = c.getContext('2d'); // نحصل على سياق رسم 2D

    // نُطابق حجم الـ canvas مع حجم الفيديو
    c.width  = v.videoWidth;
    c.height = v.videoHeight;

    // نُلتقط صورة من الكاميرا وننسخها للـ canvas
    // drawImage(مصدر, x, y): ينسخ الصورة في الإحداثيات المحددة
    ctx.drawImage(v, 0, 0);

    // ── محاولة 1: ZXing لقراءة الباركود ──────────────────
    if (window.ZXing) {
        try {
            // LuminanceSource: يستخرج بيانات الإضاءة من الـ canvas
            // ZXing تحتاج مصفوفة إضاءة لتحليل الباركود
            const lum = new ZXing.HTMLCanvasElementLuminanceSource(c);

            // BinaryBitmap: يحول بيانات الإضاءة لصورة ثنائية (أسود/أبيض)
            const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));

            // MultiFormatReader: يجرب قراءة أنواع باركود مختلفة
            const reader = new ZXing.MultiFormatReader();

            // decode: يحاول قراءة الباركود
            // لو نجح يُرجع نتيجة، لو فشل يُطلق Exception
            const result = reader.decode(bmp);

            if (result) {
                stopCam(); // نوقف الكاميرا فوراً

                // نضع النتيجة في حقل الإدخال اليدوي
                g('bcInput').value = result.getText();

                // نُرسل التوكن للسيرفر للتحقق
                verifyToken(result.getText());
                return; // نخرج من دورة المسح
            }
        } catch(e) {
            // لو لم يجد باركود في هذا الـ frame: ZXing تُطلق Exception
            // نتجاهله ونستمر للمحاولة الثانية
        }
    }

    // ── محاولة 2: jsQR (مكتبة بديلة لـ QR Code) ─────────
    if (window.jsQR) {
        // getImageData: يجلب بيانات كل بكسل في الـ canvas
        const code = jsQR(
            ctx.getImageData(0, 0, c.width, c.height).data,
            c.width,
            c.height
        );

        if (code) {
            stopCam();
            g('bcInput').value = code.data;
            verifyToken(code.data);
            return;
        }
    }

    // لم يُوجد باركود — نطلب الـ frame التالي وتستمر الدورة
    camRAF = requestAnimationFrame(scanFrame);
}

// verifyToken(): يُرسل التوكن للسيرفر للتحقق وتسجيل الحضور
window.verifyToken = async function(val) {
    // نحصل على التوكن: إما من المعامل (مسح الكاميرا) أو من حقل الإدخال
    const v = (val || (g('bcInput') ? g('bcInput').value : '')).trim();

    const res2 = g('scanResult'); // عنصر عرض نتيجة المسح

    // لو التوكن فارغ
    if (!v) {
        if (res2) res2.innerHTML = '<div class="scan-err">❌ أدخل رمز الباركود</div>';
        return;
    }

    // نُرسل التوكن وموقع الطالب للسيرفر
    const res = await api('sessions.php?action=scan', 'POST', {
        token: v,
        // stuGPS?.lat: لو stuGPS موجود استخدم lat، وإلا 0
        lat:   stuGPS?.lat || 0,
        lng:   stuGPS?.lng || 0,
    });

    // نعرض نتيجة المسح
    if (res2) {
        res2.innerHTML = res.success
            ? '<div class="scan-ok">✅ تم تسجيل حضورك بنجاح!</div>'
            : `<div class="scan-err">❌ ${res.message}</div>`;
    }

    // لو نجح، نُظهر رسالة Toast
    if (res.success) toast('✅ تم تسجيل الحضور!');
};

// ── صفحة باركودي ──────────────────────────────────────────
function myBarcode() {
    // نقرأ الرقم الجامعي من بيانات المستخدم المحفوظة
    const sid = currentUser.student_id;

    html(`
    <div class="page-hdr"><h2>باركودي</h2></div>
    <div class="card" style="max-width:440px">
      <div class="card-body" style="text-align:center">
        <p style="color:var(--text2);font-size:13px;margin-bottom:16px">
          اعرض هذا الباركود لمشرفك للتسجيل اليدوي، أو احفظه للرجوع إليه.
        </p>
        <!-- barcode-box: صندوق الباركود المُنسَّق -->
        <div class="barcode-box" style="display:inline-block">
          <!-- myBcSvg: SVG يُرسم فيه الباركود -->
          <svg id="myBcSvg"></svg>
          <!-- التسمية: الرقم الجامعي -->
          <div class="bc-label">${sid}</div>
        </div>
        <div style="margin-top:14px;font-size:13px;color:var(--text2)">${currentUser.name}</div>
      </div>
    </div>
    `);

    // setTimeout(50ms): ننتظر قليلاً حتى يُضاف SVG للصفحة قبل الرسم
    setTimeout(() => {
        try {
            // نرسم باركود الطالب من رقمه الجامعي
            JsBarcode(g('myBcSvg'), sid, {
                format:       'CODE128',
                width:        2,
                height:       70,
                displayValue: false, // لا نُظهر النص (يظهر في bc-label)
                lineColor:    '#111',
                background:   '#fff',
                margin:       0,
            });
        } catch(e) {
            // لو فشل رسم الباركود (JsBarcode غير محمّل)، نتجاهل الخطأ
        }
    }, 50);
}
