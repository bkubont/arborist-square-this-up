import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { DOCUMENT_TYPES, documentTotal } from "@/lib/documents";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Estimates() {
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const clientId = params.get("client_id");
  const tab = DOCUMENT_TYPES.some((item) => item.id === params.get("tab")) ? params.get("tab") : "estimate";

  useEffect(() => {
    Promise.all([
      api.entities.Document.list("-created_date", 500),
      api.entities.Job.list("-created_date", 200),
    ]).then(([docs, jobRows]) => { setDocuments(docs); setJobs(jobRows); }).finally(() => setLoading(false));
  }, []);

  const jobById = Object.fromEntries(jobs.map((job) => [job.id, job]));
  const rows = documents.filter((doc) => doc.type === tab && (!clientId || jobById[doc.job_id]?.client_id === clientId || doc.client_id === clientId));
  const meta = DOCUMENT_TYPES.find((item) => item.id === tab) || DOCUMENT_TYPES[0];
  const setTab = (value) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next);
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estimates & Invoices</h1>
          <p className="text-sm text-slate-500">Estimates, work orders, change orders, material orders, and invoices</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => navigate(`/documents/new?type=${tab}${clientId ? `&client_id=${clientId}` : ""}`)}>
          <Plus className="w-4 h-4 mr-1" /> Add {meta.label}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {DOCUMENT_TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium", tab === item.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300")}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <section className="bg-white rounded-xl border border-slate-200 p-4">
        {loading ? <div className="text-sm text-slate-400 py-6">Loading...</div> : rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((doc) => {
              const job = jobById[doc.job_id];
              return (
                <Link key={doc.id} to={`/documents/${doc.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 hover:text-amber-600">{doc.title}</div>
                    <div className="text-xs text-slate-400">#{doc.number} · {doc.client_name || job?.client_name || "No client"} {doc.date && `· ${shortDate(doc.date)}`}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800">{money(documentTotal(doc))}</span>
                    {job && <StatusBadge status={job.status} />}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-400">
            <FileText className="mx-auto mb-2 w-6 h-6" />
            No {meta.tab.toLowerCase()} yet. Use Add {meta.label.toLowerCase()} to open the full form.
          </div>
        )}
      </section>
    </div>
  );
}
