import React, { useState, useMemo } from "react";

type OpType = "read" | "write" | "commit";

type Operation = {
    id: number;
    type: OpType;
    tx: string;
    item?: string;
};

type SimResult = {
    op: Operation;
    status: "ok" | "aborted" | "ignored" | "commit";
    message: string;
};

export default function TimestampProtocolChecker() {
    const [operations, setOperations] = useState<Operation[]>([]);
    const [txInput, setTxInput] = useState("1");
    const [itemInput, setItemInput] = useState("A");
    const [typeInput, setTypeInput] = useState<OpType>("read");
    const [editId, setEditId] = useState<number | null>(null);
    const [useThomas, setUseThomas] = useState(true);
    const [showTimeline, setShowTimeline] = useState(true);

    const [log, setLog] = useState<SimResult[]>([]);
    const [dataTs, setDataTs] = useState<Record<string, { rts: number; wts: number }>>({});
    const [txTs, setTxTs] = useState<Record<string, number>>({});
    const [abortedTx, setAbortedTx] = useState<Record<string, boolean>>({});
    const [scheduleValid, setScheduleValid] = useState<boolean | null>(null);
    const [abortDetails, setAbortDetails] = useState<string[]>([]);

    function addOrUpdateOp() {
        const raw = txInput.trim();
        if (!raw) return;
        const tx = /^\d+$/.test(raw) ? `T${raw}` : raw.toUpperCase().startsWith("T") ? raw.toUpperCase() : `T${raw}`;
        const item = itemInput.trim() || undefined;
        if ((typeInput === "read" || typeInput === "write") && !item) return;

        if (editId !== null) {
            setOperations((prev) =>
                prev.map((op) => (op.id === editId ? { ...op, type: typeInput, tx, item } : op))
            );
            setEditId(null);
        } else {
            setOperations((prev) => [
                ...prev,
                { id: Date.now() + Math.floor(Math.random() * 1000), type: typeInput, tx, item },
            ]);
        }

        setTxInput("1");
        setItemInput("A");
        setTypeInput("read");
        setScheduleValid(null);
        setAbortDetails([]);
    }

    function editOp(op: Operation) {
        setEditId(op.id);
        setTxInput(op.tx.replace(/^T/i, ""));
        setItemInput(op.item || "A");
        setTypeInput(op.type);
    }

    function deleteOp(id: number) {
        setOperations((prev) => prev.filter((p) => p.id !== id));
        setScheduleValid(null);
        setAbortDetails([]);
    }

    function resetSimulation() {
        setLog([]);
        setDataTs({});
        setTxTs({});
        setAbortedTx({});
        setScheduleValid(null);
        setAbortDetails([]);
    }

    function getOrAssignTs(tx: string, assignMap: Record<string, number>, counterRef: { v: number }) {
        if (assignMap[tx] !== undefined) return assignMap[tx];
        assignMap[tx] = ++counterRef.v;
        return assignMap[tx];
    }

    function simulate() {
        resetSimulation();
        const localDataTs: Record<string, { rts: number; wts: number }> = {};
        const localTxTs: Record<string, number> = {};
        const localAborted: Record<string, boolean> = {};
        const results: SimResult[] = [];
        const counterRef = { v: 0 };

        function ensureItem(d: string) {
            if (!localDataTs[d]) localDataTs[d] = { rts: 0, wts: 0 };
        }

        for (let op of operations) {
            const { type, tx, item } = op;

            if (localAborted[tx]) {
                results.push({ op, status: "aborted", message: `Transaction ${tx} already aborted; operation ignored.` });
                continue;
            }

            const ts = getOrAssignTs(tx, localTxTs, counterRef);

            if (type === "read") {
                if (!item) {
                    results.push({ op, status: "aborted", message: "Read must specify an item." });
                    localAborted[tx] = true;
                    continue;
                }
                ensureItem(item);

                if (ts < localDataTs[item].wts) {
                    localAborted[tx] = true;
                    results.push({ op, status: "aborted", message: `Read(${item}) by ${tx} rejected: TS(${tx})=${ts} < WTS(${item})=${localDataTs[item].wts} -> abort.` });
                    continue;
                }

                localDataTs[item].rts = Math.max(localDataTs[item].rts, ts);
                results.push({ op, status: "ok", message: `Read(${item}) by ${tx} succeeds. RTS(${item}) = ${localDataTs[item].rts}` });
            }

            else if (type === "write") {
                if (!item) {
                    results.push({ op, status: "aborted", message: "Write must specify an item." });
                    localAborted[tx] = true;
                    continue;
                }
                ensureItem(item);

                if (ts < localDataTs[item].rts) {
                    localAborted[tx] = true;
                    results.push({ op, status: "aborted", message: `Write(${item}) by ${tx} rejected: TS(${tx})=${ts} < RTS(${item})=${localDataTs[item].rts} -> abort.` });
                    continue;
                }

                if (ts < localDataTs[item].wts) {
                    if (useThomas) {
                        results.push({ op, status: "ignored", message: `Write(${item}) by ${tx} ignored by Thomas' rule: TS(${tx})=${ts} < WTS(${item})=${localDataTs[item].wts}.` });
                        continue;
                    } else {
                        localAborted[tx] = true;
                        results.push({ op, status: "aborted", message: `Write(${item}) by ${tx} rejected: TS(${tx})=${ts} < WTS(${item})=${localDataTs[item].wts} -> abort.` });
                        continue;
                    }
                }

                localDataTs[item].wts = ts;
                results.push({ op, status: "ok", message: `Write(${item}) by ${tx} succeeds. WTS(${item}) = ${localDataTs[item].wts}` });
            }

            else if (type === "commit") {
                results.push({ op, status: "commit", message: `Commit request for ${tx} -- ${localAborted[tx] ? "but transaction was aborted" : "committed"}.` });
            }
        }

        const abortedList = Object.keys(localAborted).filter((t) => localAborted[t]);
        const isValid = abortedList.length === 0;
        const abortMsgs = results.filter((r) => r.status === "aborted").map((r) => r.message);

        setLog(results);
        setDataTs(localDataTs);
        setTxTs(localTxTs);
        setAbortedTx(localAborted);
        setScheduleValid(isValid);
        setAbortDetails(abortMsgs);
    }

    const txOrder = useMemo(() => {
        const arr: string[] = [];
        for (const op of operations) {
            if (!arr.includes(op.tx)) arr.push(op.tx);
        }
        return arr;
    }, [operations]);

    function statusColor(status: SimResult["status"]) {
        switch (status) {
            case "ok":
                return "bg-green-500";
            case "commit":
                return "bg-blue-500";
            case "ignored":
                return "bg-yellow-500";
            case "aborted":
                return "bg-red-500";
            default:
                return "bg-gray-300";
        }
    }

    const resultMap = useMemo(() => {
        const m: Record<number, SimResult> = {};
        for (const r of log) m[r.op.id] = r;
        return m;
    }, [log]);

    return (
        <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-10 px-4 text-right">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white shadow-xl rounded-2xl p-6">
                    <h1 className="text-2xl font-bold mb-2">Timestamp Ordering Protocol Checker</h1>
                    <p className="text-sm text-gray-600 mb-4">پیاده‌سازی کامل پروتکل مهر‌زمانی (Timestamp Ordering). می‌توانید عملیاتِ خواندن/نوشتن/commit را برای تراکنش‌ها اضافه کنید، سپس شبیه‌سازی را اجرا کنید تا ببینید کدام عملیات قبول، رد، یا نادیده گرفته شده و دلیل آن چیست.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">نوع عملیات</label>
                            <select
                                value={typeInput}
                                onChange={(e) => setTypeInput(e.target.value as OpType)}
                                className="mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2"
                            >
                                <option value="read">Read</option>
                                <option value="write">Write</option>
                                <option value="commit">Commit</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700">شماره تراکنش (مثال: 1)</label>
                            <input
                                value={txInput}
                                onChange={(e) => setTxInput(e.target.value.replace(/\D/g, ""))}
                                className="mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2"
                                placeholder="مثال: 1"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700">آیتم داده (برای Read/Write)</label>
                            <input
                                value={itemInput}
                                onChange={(e) => setItemInput(e.target.value)}
                                className={`mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2 ${typeInput === 'commit' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={typeInput === 'commit'}
                                placeholder={typeInput === 'commit' ? 'غیرفعال برای commit' : 'مثال: A'}
                            />
                        </div>

                        <div className="md:col-span-3 flex gap-2 mt-2">
                            <button
                                onClick={addOrUpdateOp}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700"
                            >
                                {editId ? "به‌روزرسانی عملیات" : "افزودن عملیات"}
                            </button>
                            <button
                                onClick={() => {
                                    setOperations([]);
                                    resetSimulation();
                                }}
                                className="px-4 py-2 bg-red-50 text-red-600 rounded-md border border-red-100"
                            >
                                حذف همه عملیات
                            </button>

                            <label className="mr-auto flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={useThomas} onChange={(e) => setUseThomas(e.target.checked)} />
                                استفاده از Thomas' Write Rule (اگر فعال باشد، نوشتن قدیمی نادیده گرفته می‌شود به‌جای Abort)
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={showTimeline} onChange={(e) => setShowTimeline(e.target.checked)} />
                                نمایش Timeline گرافیکی
                            </label>
                        </div>

                    </div>

                    {scheduleValid !== null && (
                        <div className={`mt-4 p-3 rounded-md ${scheduleValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            {scheduleValid ? (
                                <div className="text-green-700 font-semibold">✅ زمانبندی معتبر است — هیچ تراکنشی abort نشده است.</div>
                            ) : (
                                <div>
                                    <div className="text-red-700 font-semibold">❌ زمانبندی نامعتبر است — حداقل یک تراکنش abort شده.</div>
                                    <ul className="mt-2 list-disc mr-5 text-sm text-gray-700">
                                        {abortDetails.length === 0 ? (
                                            <li>جزئیات abort در لاگ موجود است.</li>
                                        ) : (
                                            abortDetails.map((m, i) => <li key={i}>{m}</li>)
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mt-6">
                        <h2 className="text-lg font-semibold">لیست عملیات‌ها</h2>
                        <div className="mt-2 space-y-2">
                            {operations.length === 0 ? (
                                <div className="text-sm text-gray-500">هیچ عملیاتی تعریف نشده.</div>
                            ) : (
                                operations.map((op, idx) => (
                                    <div key={op.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                                        <div>
                                            <div className="text-sm font-medium">{idx + 1}. {op.type.toUpperCase()} {op.item ? `(${op.item})` : ""} — {op.tx}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => editOp(op)} className="px-2 py-1 text-sm bg-yellow-50 border rounded">ویرایش</button>
                                            <button onClick={() => deleteOp(op.id)} className="px-2 py-1 text-sm bg-red-50 border text-red-600 rounded">حذف</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button onClick={simulate} className="px-4 py-2 bg-green-600 text-white rounded-md shadow hover:bg-green-700">اجرای شبیه‌سازی</button>
                        <button onClick={resetSimulation} className="px-4 py-2 bg-gray-50 text-gray-700 rounded-md">ریست شبیه‌سازی</button>
                    </div>

                    <div className="mt-6 grid md:grid-cols-2 gap-4">
                        <div className="bg-white border rounded-lg p-4">
                            <h3 className="font-semibold mb-2">لاگ عملیات</h3>
                            <div className="space-y-2 max-h-64 overflow-auto">
                                {log.length === 0 ? (
                                    <div className="text-sm text-gray-500">لاگ خالی است. شبیه‌سازی را اجرا کنید.</div>
                                ) : (
                                    log.map((r, i) => (
                                        <div key={i} className={`p-2 rounded ${r.status === 'ok' ? 'bg-green-50' : r.status === 'commit' ? 'bg-blue-50' : r.status === 'ignored' ? 'bg-yellow-50' : 'bg-red-50'}`}>
                                            <div className="text-sm font-medium">{i + 1}. {r.op.type.toUpperCase()} {r.op.item ? `(${r.op.item})` : ''} — {r.op.tx}</div>
                                            <div className="text-xs text-gray-700">{r.message}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="bg-white border rounded-lg p-4">
                            <h3 className="font-semibold mb-2">حالت آیتم‌ها و تراکنش‌ها</h3>

                            <div className="mb-3">
                                <div className="text-sm font-medium">Data items (RTS / WTS)</div>
                                <div className="mt-2 space-y-2">
                                    {Object.keys(dataTs).length === 0 ? (
                                        <div className="text-sm text-gray-500">هیچ آیتمی وجود ندارد.</div>
                                    ) : (
                                        Object.entries(dataTs).map(([d, v]) => (
                                            <div key={d} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                                                <div className="font-medium">{d}</div>
                                                <div className="text-sm text-gray-700">RTS: {v.rts} — WTS: {v.wts}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="text-sm font-medium">Timestamps (Transaction → TS)</div>
                                <div className="mt-2 space-y-2">
                                    {Object.keys(txTs).length === 0 ? (
                                        <div className="text-sm text-gray-500">هیچ تراکنشی هنوز مهرزمانی نگرفته.</div>
                                    ) : (
                                        Object.entries(txTs).map(([t, v]) => (
                                            <div key={t} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                                                <div className="font-medium">{t}</div>
                                                <div className="text-sm">TS: {v} {abortedTx[t] ? <span className="text-red-600">(aborted)</span> : <span className="text-green-600">(active)</span>}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {showTimeline && (
                        <div className="mt-6 bg-white border rounded-lg p-4 overflow-auto">
                            <h3 className="font-semibold mb-2">Timeline گرافیکی</h3>
                            {operations.length === 0 ? (
                                <div className="text-sm text-gray-500">ابتدا چند عملیات اضافه کنید و سپس شبیه‌سازی را اجرا کنید.</div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="text-xs text-gray-600 mb-2">ستون‌ها ترتیب اجرای عملیات را نشان می‌دهند؛ هر ردیف مختص یک تراکنش است.</div>

                                    <div className="flex gap-3 items-center mb-3">
                                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500" /> OK</div>
                                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500" /> Ignored</div>
                                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" /> Aborted</div>
                                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500" /> Commit</div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <div className="inline-block min-w-full">
                                            <div className="grid border rounded" style={{ gridTemplateColumns: `repeat(${operations.length || 1}, minmax(140px, 1fr))` }}>
                                                {operations.map((op, cidx) => (
                                                    <div key={op.id + "-hdr"} className="p-2 border-b border-l bg-slate-50 text-xs font-medium text-center">
                                                        <div>{cidx + 1}</div>
                                                        <div className="text-xxs text-gray-500">{op.type.toUpperCase()}{op.item ? `(${op.item})` : ''}</div>
                                                    </div>
                                                ))}

                                                {txOrder.map((tx) => (
                                                    <React.Fragment key={tx}>
                                                        {operations.map((op, cidx) => {
                                                            const r = resultMap[op.id];
                                                            const isThis = op.tx === tx;
                                                            const color = r ? statusColor(r.status) : 'bg-gray-300';
                                                            return (
                                                                <div key={tx + '-' + cidx} className={`p-4 border-b border-l h-24 flex items-center justify-center`} title={isThis && r ? `${r.op.type.toUpperCase()} ${r.op.item ? '('+r.op.item+')' : ''} — ${r.message}` : ''}>
                                                                    {isThis ? (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs`}>{op.type[0].toUpperCase()}</div>
                                                                            <div className="text-xs text-gray-700">{op.tx}</div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-xs text-gray-400">-</div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <div className="text-sm font-medium mb-2">جزئیات ستون‌ها</div>
                                        <div className="grid gap-2">
                                            {operations.map((op, i) => {
                                                const r = resultMap[op.id];
                                                return (
                                                    <div key={op.id} className="p-2 rounded border bg-slate-50 flex items-center justify-between">
                                                        <div className="text-sm">{i + 1}. {op.type.toUpperCase()} {op.item ? `(${op.item})` : ''} — {op.tx}</div>
                                                        <div className="text-xs text-gray-600">{r ? r.status.toUpperCase() : 'PENDING'}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mt-6 text-sm text-gray-500">
                        <strong>توضیح قواعد:</strong>
                        <ul className="list-disc mr-5 mt-2">
                            <li>برای Read(X) توسط T: اگر TS(T) &lt; WTS(X) آنگاه T باید abort شود. در غیر این صورت، R-Timestamp(X) = max(RTS(X), TS(T)).</li>
                            <li>برای Write(X) توسط T: اگر TS(T) &lt; RTS(X) آنگاه T باید abort شود. در غیر این صورت اگر TS(T) &lt; WTS(X) آنگاه — بسته به Thomas' rule — یا Abort (قواعد کلاسیک) یا Ignore (قاعده توماس).</li>
                            <li>Commit صرفاً نتیجهٔ تراکنش را نشان می‌دهد؛ اگر تراکنش قبلاً abort شده باشد commit ناموفق است.</li>
                        </ul>
                    </div>
                </div>

                <div className="text-center text-xs text-gray-400 mt-4">نسخهٔ آموزشی — مناسب برای تمرین و مشاهدهٔ رفتار پروتکل مهرزمانی</div>
            </div>
        </div>
    );
}
