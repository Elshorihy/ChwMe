import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, LogIn, LogOut, RefreshCw, Search, ShieldCheck, XCircle, MessageCircle, Copy } from 'lucide-react';
import { supabase, BrandLogo, type Session } from './App';

type VerificationRequest = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  whatsapp_phone: string | null;
  verification_code: string | null;
  verification_status: string | null;
  created_at: string;
};

const statusLabel: Record<string, string> = {
  pending_manual_review: 'معلق',
  approved: 'مقبول',
  rejected: 'مرفوض',
};

export default function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [workingId, setWorkingId] = useState('');

  const loadRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_whatsapp_requests');
      if (rpcError) throw new Error(rpcError.message || 'تعذر تحميل الطلبات');
      setRequests(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الطلبات. تأكد من تشغيل ملف SQL وإضافة إيميل الأدمن.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setCheckingSession(false);
      if (data.session) void loadRequests();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) void loadRequests();
      else setRequests([]);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (filter === 'pending' && request.verification_status !== 'pending_manual_review') return false;
      const haystack = [request.display_name, request.email, request.whatsapp_phone, request.verification_code]
        .filter(Boolean).join(' ').toLowerCase();
      return !query || haystack.includes(query);
    });
  }, [requests, filter, search]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (loginError) setError(loginError.message || 'فشل تسجيل الدخول');
  };

  const handleReview = async (request: VerificationRequest, approve: boolean) => {
    const label = approve ? 'قبول وتأكيد البريد' : 'رفض الطلب';
    if (!window.confirm(`متأكد إنك عايز ${label} للطلب ده؟`)) return;
    setWorkingId(request.user_id);
    setError('');
    setNotice('');
    const { data, error: reviewError } = await supabase.rpc('admin_review_whatsapp_request', {
      p_user_id: request.user_id,
      p_approve: approve,
    });
    setWorkingId('');
    if (reviewError) {
      setError(reviewError.message || 'تعذر تحديث الطلب');
      return;
    }
    setNotice(approve ? 'تم قبول الطلب وتأكيد البريد الإلكتروني.' : 'تم رفض الطلب.');
    await loadRequests();
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('تم النسخ.');
    } catch {
      setNotice('النسخ غير متاح في المتصفح ده؛ حدّد الرقم وانسخه يدويًا.');
    }
  };

  const pendingCount = requests.filter((r) => r.verification_status === 'pending_manual_review').length;

  return (
    <div dir="rtl" className="min-h-screen bg-[#071E31] text-slate-100 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" showText />
            <div>
              <h1 className="text-xl font-extrabold">لوحة الأدمن</h1>
              <p className="text-sm text-slate-400">طلبات توثيق واتساب — ChwMe</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/5"><ArrowLeft size={16}/> الموقع</a>
            {session && <button onClick={() => void supabase.auth.signOut()} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/5"><LogOut size={16}/> خروج</button>}
          </div>
        </header>

        {(error || notice) && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}>{error || notice}</div>}

        {checkingSession ? (
          <div className="py-20 text-center text-slate-400"><RefreshCw className="mx-auto mb-3 animate-spin" />بنراجع جلسة الدخول...</div>
        ) : !session ? (
          <div className="mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <div className="mb-5 flex justify-center"><div className="rounded-2xl bg-orange-500/15 p-4 text-orange-300"><ShieldCheck size={30}/></div></div>
            <h2 className="text-center text-xl font-extrabold">دخول الأدمن</h2>
            <p className="mb-6 mt-2 text-center text-sm leading-6 text-slate-400">سجّل دخول بحساب الأدمن المضاف في إعدادات Supabase. معرفة رابط الصفحة وحدها لا تمنح صلاحية الإدارة.</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block text-sm font-bold">الإيميل<input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left outline-none focus:border-orange-400"/></label>
              <label className="block text-sm font-bold">كلمة المرور<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-orange-400"/></label>
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-extrabold hover:bg-orange-500 disabled:opacity-60"><LogIn size={18}/>{loading ? 'جاري الدخول...' : 'دخول لوحة الأدمن'}</button>
            </form>
          </div>
        ) : (
          <main className="mt-7">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-sm text-slate-400">كل الطلبات</p><p className="mt-2 text-3xl font-black">{requests.length}</p></div>
              <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-5"><p className="text-sm text-orange-200">طلبات معلقة</p><p className="mt-2 text-3xl font-black">{pendingCount}</p></div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5"><p className="text-sm text-emerald-200">طلبات مقبولة</p><p className="mt-2 text-3xl font-black">{requests.filter((r) => r.verification_status === 'approved').length}</p></div>
            </div>

            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div><h2 className="text-lg font-extrabold">طلبات التوثيق</h2><p className="mt-1 text-sm text-slate-400">راجع رقم المرسل في واتساب والكود قبل القبول.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFilter('pending')} className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === 'pending' ? 'bg-orange-600 text-white' : 'bg-white/5 text-slate-300'}`}>المعلقة</button>
                  <button onClick={() => setFilter('all')} className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === 'all' ? 'bg-orange-600 text-white' : 'bg-white/5 text-slate-300'}`}>الكل</button>
                  <button onClick={() => void loadRequests()} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> تحديث</button>
                </div>
              </div>
              <div className="relative mt-4"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الإيميل أو رقم واتساب أو الكود..." className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pr-10 pl-4 text-sm outline-none focus:border-orange-400"/></div>

              <div className="mt-5 grid gap-4">
                {loading && requests.length === 0 ? <div className="py-12 text-center text-slate-400"><RefreshCw className="mx-auto mb-3 animate-spin"/>جاري تحميل الطلبات...</div> :
                filteredRequests.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 py-12 text-center text-slate-400"><Clock3 className="mx-auto mb-3"/>مفيش طلبات مطابقة للبحث.</div> :
                filteredRequests.map((request) => (
                  <article key={request.user_id} className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="text-lg font-extrabold">{request.display_name || 'بدون اسم'}</h3><p className="mt-1 break-all text-sm text-slate-400" dir="ltr">{request.email || 'بدون إيميل'}</p></div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${request.verification_status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : request.verification_status === 'rejected' ? 'bg-red-500/15 text-red-300' : 'bg-orange-500/15 text-orange-200'}`}>{statusLabel[request.verification_status || ''] || request.verification_status || 'غير معروف'}</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white/[0.04] p-3"><p className="mb-1 text-xs text-slate-400">رقم واتساب المسجل</p><div className="flex items-center justify-between gap-2"><b dir="ltr" className="text-left">{request.whatsapp_phone || 'غير موجود'}</b>{request.whatsapp_phone && <button onClick={() => void copy(request.whatsapp_phone!)} aria-label="نسخ الرقم" className="rounded-lg p-2 hover:bg-white/10"><Copy size={15}/></button>}</div></div>
                      <div className="rounded-xl bg-white/[0.04] p-3"><p className="mb-1 text-xs text-slate-400">كود التحقق</p><div className="flex items-center justify-between gap-2"><b dir="ltr" className="font-mono text-xl tracking-[0.25em]">{request.verification_code || '—'}</b>{request.verification_code && <button onClick={() => void copy(request.verification_code!)} aria-label="نسخ الكود" className="rounded-lg p-2 hover:bg-white/10"><Copy size={15}/></button>}</div></div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">تاريخ التسجيل: {new Date(request.created_at).toLocaleString('ar-EG')}</p>
                    {request.verification_status === 'pending_manual_review' && <div className="mt-4 flex flex-wrap gap-2"><a href={`https://wa.me/${request.whatsapp_phone || ''}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/10"><MessageCircle size={17}/> فتح واتساب</a><button disabled={workingId === request.user_id} onClick={() => void handleReview(request, true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={17}/> قبول وتأكيد الإيميل</button><button disabled={workingId === request.user_id} onClick={() => void handleReview(request, false)} className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"><XCircle size={17}/> رفض</button></div>}
                  </article>
                ))}
              </div>
            </section>
          </main>
        )}
        <p className="mt-8 text-center text-xs text-slate-500">لوحة محمية بصلاحيات Supabase • لا توافق على طلب إلا بعد مطابقة رقم المرسل والكود يدويًا.</p>
      </div>
    </div>
  );
}
