import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TYPES, documentMeta, documentTotal } from "@/lib/documents";
import { money } from "@/lib/format";

export default function EstimatePanel({ job }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Document.filter({ job_id: job.id }, "-created_date", 200).then(setDocuments).finally(() => setLoading(false));
  }, [job.id]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
        <p className="text-xs text-slate-400 mt-1">Estimates, work orders, change orders, material orders, and invoices</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {DOCUMENT_TYPES.map((item) => (
          <Button key={item.id} variant="outline" size="sm" asChild>
            <Link to={`/documents/new?type=${item.id}&job_id=${job.id}`}><Plus className="w-3.5 h-3.5 mr-1" /> {item.label}</Link>
          </Button>
        ))}
      </div>
      {loading ? <div className="text-sm text-slate-400">Loading...</div> : documents.length ? (
        <div className="divide-y divide-slate-100">
          {documents.map((doc) => (
            <Link key={doc.id} to={`/documents/${doc.id}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{documentMeta(doc.type).label} #{doc.number}</div>
                <div className="text-xs text-slate-400 truncate">{doc.title}</div>
              </div>
              <span className="text-sm font-semibold text-slate-800">{money(documentTotal(doc))}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4" /> No documents yet.</div>
      )}
    </div>
  );
}
