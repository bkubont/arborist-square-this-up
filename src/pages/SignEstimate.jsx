import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { lineTotal } from "@/lib/estimateMath";

/** Public client e-sign page for Estimates and Change Orders (no app login). */
export default function SignEstimate() {
  const { token } = useParams();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await api.sign.get(token);
        if (!cancelled) {
          setData(payload);
          const entity = payload.link?.entity;
          const signed = payload.link?.used
            || (entity === "Estimate" && payload.estimate?.status === "accepted")
            || (entity === "ChangeOrder" && payload.change_order?.status === "approved");
          if (signed) setDone(true);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Sign link is invalid or expired");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || done) return;
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = 160;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      return { x: point.clientX - rect.left, y: point.clientY - rect.top };
    };
    const start = (e) => {
      e.preventDefault();
      drawing.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setHasInk(true);
    };
    const end = () => { drawing.current = false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, [data, done]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasInk(false);
  };

  const submit = async () => {
    if (!signerName.trim()) {
      setError("Enter your name");
      return;
    }
    if (!hasInk) {
      setError("Please sign above");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const signature_data_url = canvasRef.current.toDataURL("image/png");
      await api.sign.submit(token, { signer_name: signerName.trim(), signature_data_url });
      setDone(true);
    } catch (e) {
      setError(e.message || "Could not submit signature");
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full text-center">
          <h1 className="text-lg font-bold text-slate-900 mb-2">Sign link unavailable</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">Loading…</div>;
  }

  const entity = data.link?.entity || "Estimate";
  const isCO = entity === "ChangeOrder";
  const estimate = data.estimate;
  const changeOrder = data.change_order;
  const { job, company, client } = data;
  const docNumber = isCO ? changeOrder?.number : estimate?.number;
  const signer = (isCO ? changeOrder?.signer_name : estimate?.signer_name) || signerName;

  if (done) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full text-center space-y-2">
          <h1 className="text-xl font-bold text-slate-900">Thank you</h1>
          <p className="text-sm text-slate-600">
            {isCO ? "Change order" : "Estimate"} {docNumber || ""} was signed
            {signer ? ` by ${signer}` : ""}.
          </p>
          {isCO && changeOrder?.revised_contract_total != null && (
            <p className="text-sm text-slate-500">Revised contract total {money(changeOrder.revised_contract_total)}</p>
          )}
          <p className="text-xs text-slate-400">You can close this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            {isCO ? "Change order signature" : "Estimate signature"}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{company?.name || "Jobsite Notebook"}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {job?.title}
            {client?.name ? ` · ${client.name}` : ""}
            {docNumber ? ` · ${docNumber}` : ""}
          </p>
        </div>

        {isCO ? (
          <div className="space-y-2 text-sm">
            {changeOrder.reason && <div><span className="text-slate-500">Reason:</span> {changeOrder.reason}</div>}
            {changeOrder.description && <p className="text-slate-700 whitespace-pre-wrap">{changeOrder.description}</p>}
            <div className="rounded-lg border border-slate-200 p-3 space-y-1 max-w-sm ml-auto">
              <div className="flex justify-between"><span className="text-slate-500">Added cost</span><span>{money(changeOrder.added_cost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Credit</span><span>{money(changeOrder.credit)}</span></div>
              <div className="flex justify-between font-semibold border-t border-slate-100 pt-1"><span>Net change</span><span>{money(changeOrder.net_change)}</span></div>
              {changeOrder.revised_contract_total != null && (
                <div className="flex justify-between"><span className="text-slate-500">Revised total</span><span>{money(changeOrder.revised_contract_total)}</span></div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(estimate.lines || []).length === 0 ? (
                    <tr><td colSpan={2} className="px-3 py-4 text-slate-400">No line items</td></tr>
                  ) : (
                    estimate.lines.map((line, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{line.description || "—"}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{money(lineTotal(line))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-sm space-y-1 max-w-xs ml-auto">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(estimate.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(estimate.tax_amount)}</span></div>
              <div className="flex justify-between font-semibold border-t border-slate-200 pt-1"><span>Total</span><span>{money(estimate.total)}</span></div>
            </div>
            {estimate.notes && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-3">{estimate.notes}</p>
            )}
          </>
        )}

        <div>
          <Label>Your name</Label>
          <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" className="mt-1" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Signature</Label>
            <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={clearSignature}>Clear</button>
          </div>
          <canvas
            ref={canvasRef}
            className="w-full h-40 border border-slate-300 rounded-lg bg-white touch-none cursor-crosshair"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : isCO ? "Sign & approve change order" : "Sign & accept estimate"}
        </Button>
      </div>
    </div>
  );
}
