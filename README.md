# ChwMe — تواصل

واجهة مراسلة عربية مبنية باستخدام React وTypeScript وVite وTailwind CSS، مع تكامل Supabase للمصادقة وقاعدة البيانات والتخزين وRealtime.

## التشغيل محليًا
```bash
npm install
npm run dev
```

## اختبار بناء الإنتاج
```bash
npm run build
npm run preview
```

## إعداد Supabase
- المشروع الحالي يستخدم عنوان Supabase ومفتاح publishable الموجودين داخل `src/App.tsx`.
- من لوحة Supabase، تأكد من إعداد Authentication URL Configuration وRedirect URLs لرابط النشر.
- راجع نافذة وثائق المشروع داخل التطبيق وشغّل SQL المطلوب في Supabase SQL Editor قبل الاعتماد على رفع الصور والمرفقات.
- لا تضع أبدًا مفتاح `service_role` أو أي مفتاح سري داخل تطبيق المتصفح.

## النشر
يمكن نشر المشروع على Vercel أو Netlify أو أي استضافة تدعم Vite. أمر البناء هو `npm run build` ومجلد الناتج `dist`.
