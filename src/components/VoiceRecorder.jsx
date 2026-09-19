import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { api } from '@/api/client';
export default function VoiceRecorder({ jobId, onTranscribed }) {
  const recognition = useRef(null);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const SpeechRecognition = window.SpeechRecognition || window['webkitSpeechRecognition'];
  useEffect(() => () => { if (recognition.current) { recognition.current.onend = null; recognition.current.onerror = null; recognition.current.onresult = null; recognition.current.abort(); } }, []);
  const start = () => {
    const recorder = new SpeechRecognition();
    recorder.lang = navigator.language; recorder.continuous = true;
    recorder.onresult = event => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) text += event.results[i][0].transcript + ' ';
      setDraft(current => current + text);
    };
    recorder.onerror = () => { setError('Dictation unavailable. Use your keyboard microphone or type a note.'); setRecording(false); };
    recorder.onend = () => setRecording(false);
    recognition.current = recorder;
    try { recorder.start(); setRecording(true); setError(''); } catch { setError('Could not start dictation. Try your keyboard microphone.'); }
  };
  const save = async () => {
    setSaving(true);
    try { await api.entities.TimelineEntry.create({ job_id: jobId, type: 'note', text: draft.trim(), category: 'note' }); setDraft(''); onTranscribed?.(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  if (!SpeechRecognition) return <p className="text-xs text-slate-500">To dictate a note, use the microphone on your phone keyboard.</p>;
  return <div className="space-y-2">
    <button className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white" onClick={() => recording ? recognition.current.stop() : start()}>
      {recording ? <Square size={14} /> : <Mic size={14} />}{recording ? 'Stop dictation' : 'Dictate a note'}
    </button>
    <p className="text-xs text-slate-500">Uses your browser’s speech service. Review the text before saving.</p>
    {draft && <><textarea aria-label="Dictated note" className="w-full rounded border p-2 text-sm" value={draft} onChange={e => setDraft(e.target.value)} /><button disabled={saving || recording || !draft.trim()} className="text-sm font-semibold disabled:opacity-50" onClick={save}>{saving ? 'Saving…' : 'Save dictated note'}</button></>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
