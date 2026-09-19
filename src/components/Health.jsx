import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../UserContext';
import { parseFiles, patchItem, removeFile } from '../services/api';
import { HeartPulse, ChevronLeft, Loader2, Edit2, Check, Paperclip, Trash2, Stethoscope } from 'lucide-react';

const EMPTY = '—';

function fileLabel(f) {
    return f.file_name || f.file_id;
}

export default function Health() {
    const navigate = useNavigate();
    const { items, loading, error, refetch } = useUser();
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState({});
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(null);

    const rawRecords = Array.isArray(items) ? items.filter(i => i.category === 'health') : [];
    const email = localStorage.getItem('mindflow_user_email') || '';

    const startEdit = (record) => {
        const f = record.fields || {};
        setEditingId(record.id);
        setDraft({
            title: f.title || '',
            description: f.description || '',
            doctor: f.doctor || '',
            specialty: f.specialty || '',
            diagnosis: f.diagnosis || '',
            visit_date: f.visit_date || '',
        });
    };

    const handleSave = async (id) => {
        setSaving(true);
        try {
            await patchItem(email, id, { fields: { ...draft } });
            if (refetch) await refetch(true);
        } catch (e) {
            console.error('Failed to save health record', e);
        } finally {
            setSaving(false);
            setEditingId(null);
        }
    };

    const handleRemoveFile = async (recordId, file_id) => {
        setRemoving(file_id);
        try {
            await removeFile(email, recordId, { file_id });
            if (refetch) await refetch(true);
        } catch (e) {
            console.error('Failed to remove file', e);
        } finally {
            setRemoving(null);
        }
    };

    const set = (key) => (e) => setDraft(prev => ({ ...prev, [key]: e.target.value }));

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-rose-500">
                    <Loader2 className="animate-spin" size={24} />
                    <span className="text-sm font-medium">Health loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-10 w-full max-w-5xl mx-auto">
            <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 mb-4 transition"
            >
                <ChevronLeft size={16} />
                Dashboard
            </button>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#FFF1F2] text-rose-500 flex items-center justify-center shadow-sm flex-shrink-0">
                        <HeartPulse size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Health</h1>
                        <p className="text-xs text-gray-400 mt-0.5">{rawRecords.length} records - Bot vasitəsilə yenilənir</p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-6 text-xs text-red-600">{error}</div>
            )}

            <div className="space-y-8 sm:space-y-10">
                <div>
                    <div className="flex justify-between items-center mb-4 px-1">
                        <h2 className="text-xs sm:text-sm font-bold text-gray-800 uppercase tracking-wider">Records</h2>
                        <span className="text-xs font-medium text-gray-400">{rawRecords.length} records</span>
                    </div>

                    <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        {rawRecords.length === 0 ? (
                            <p className="p-4 text-xs text-gray-400">Heç bir sağlamlıq qeydi tapılmadı. Telegram bot vasitəsilə əlavə edin.</p>
                        ) : (
                            rawRecords.map((record, rIndex) => {
                                const f = record.fields || {};
                                const files = parseFiles(f.files);
                                const isEditing = editingId === record.id;
                                return (
                                    <div
                                        key={record.id}
                                        className={`p-4 sm:p-6 transition hover:bg-gray-50/50 ${rIndex === 0 ? 'bg-[#FFF1F2]/30' : ''} ${rIndex !== rawRecords.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    >
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2 mb-2">
                                            {isEditing ? (
                                                <input
                                                    value={draft.title}
                                                    onChange={set('title')}
                                                    placeholder="Title"
                                                    className="font-bold text-sm sm:text-base w-full border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-rose-500"
                                                />
                                            ) : (
                                                <h3 className={`font-bold text-sm sm:text-base ${rIndex === 0 ? 'text-rose-700' : 'text-gray-900'}`}>
                                                    {f.title || 'Health record'}
                                                </h3>
                                            )}
                                            <div className="flex items-center gap-2 flex-shrink-0 mt-1 sm:mt-0">
                                                <span className="text-xs font-medium text-gray-400">
                                                    {f.visit_date || ''}
                                                </span>
                                                <button
                                                    onClick={() => isEditing ? handleSave(record.id) : startEdit(record)}
                                                    disabled={saving && isEditing}
                                                    className="p-1 text-gray-400 hover:text-rose-600 transition rounded hover:bg-rose-50 disabled:opacity-50"
                                                    title={isEditing ? 'Save record' : 'Edit record'}
                                                >
                                                    {isEditing ? <Check size={14} /> : <Edit2 size={14} />}
                                                </button>
                                            </div>
                                        </div>

                                        {isEditing ? (
                                            <div className="flex flex-col gap-2 mt-1">
                                                <textarea
                                                    value={draft.description}
                                                    onChange={set('description')}
                                                    placeholder="Description"
                                                    className="text-xs text-gray-700 w-full border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-rose-500 h-20 resize-none"
                                                />
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    <input value={draft.doctor} onChange={set('doctor')} placeholder="Doctor (name, surname)" className="text-xs text-gray-700 w-full border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-rose-500" />
                                                    <input value={draft.specialty} onChange={set('specialty')} placeholder="Specialty" className="text-xs text-gray-700 w-full border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-rose-500" />
                                                    <input value={draft.diagnosis} onChange={set('diagnosis')} placeholder="Diagnosis" className="text-xs text-gray-700 w-full border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-rose-500" />
                                                    <input value={draft.visit_date} onChange={set('visit_date')} placeholder="Visit date (YYYY-MM-DD)" className="text-xs text-gray-700 w-full border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-rose-500" />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {f.description ? (
                                                    <p className="text-xs text-gray-500 leading-relaxed mb-3">{f.description}</p>
                                                ) : null}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs mb-3">
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <Stethoscope size={13} className="text-gray-400 flex-shrink-0" />
                                                        <span className="font-medium text-gray-400">Doctor:</span>
                                                        <span className="text-gray-700">{[f.doctor, f.specialty].filter(Boolean).join(' — ') || EMPTY}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <span className="font-medium text-gray-400">Diagnosis:</span>
                                                        <span className="text-gray-700">{f.diagnosis || EMPTY}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <span className="font-medium text-gray-400">Visit date:</span>
                                                        <span className="text-gray-700">{f.visit_date || EMPTY}</span>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                                                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                                                        <Paperclip size={13} className="text-gray-400" />
                                                        <span className="text-xs font-semibold">
                                                            Files{files.length > 0 ? ` (${files.length})` : ''}
                                                        </span>
                                                    </div>
                                                    {files.length === 0 ? (
                                                        <p className="text-[11px] text-gray-400">
                                                            No files yet. Send prescriptions or lab results to this record via the Telegram bot.
                                                        </p>
                                                    ) : (
                                                        <ul className="space-y-1.5">
                                                            {files.map((file) => (
                                                                <li key={file.file_id} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                                                                    <span className="truncate">{fileLabel(file)}</span>
                                                                    <button
                                                                        onClick={() => handleRemoveFile(record.id, file.file_id)}
                                                                        disabled={removing === file.file_id}
                                                                        className="p-1 text-gray-400 hover:text-red-600 transition rounded hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
                                                                        title="Remove file"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
