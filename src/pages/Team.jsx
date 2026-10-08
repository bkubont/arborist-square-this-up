import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { userCan, ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { Navigate } from "react-router-dom";

/** Company members, invites, and crews (multi-crew Phase 1). */
export default function Team() {
  const { user } = useAuth();
  const canMembers = userCan(user, "manage_members");
  const canCrews = userCan(user, "manage_crews");

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [roles, setRoles] = useState([]);
  const [crews, setCrews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("crew_leader");
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const [crewName, setCrewName] = useState("");
  const [crewLeader, setCrewLeader] = useState("");
  const [crewMembers, setCrewMembers] = useState([]);
  const [crewTags, setCrewTags] = useState("");
  const [editingCrewId, setEditingCrewId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const tasks = [];
      if (canMembers) tasks.push(api.members.list());
      else tasks.push(Promise.resolve(null));
      if (canCrews || userCan(user, "view_all_crews")) {
        tasks.push(api.entities.Crew.list("-created_date", 100));
      } else {
        tasks.push(Promise.resolve([]));
      }
      const [memberPayload, crewRows] = await Promise.all(tasks);
      if (memberPayload) {
        setMembers(memberPayload.members || []);
        setInvites(memberPayload.invites || []);
        setRoles(memberPayload.roles || []);
      }
      setCrews(crewRows || []);
    } catch (err) {
      setError(err.message || "Could not load team");
    } finally {
      setLoading(false);
    }
  }, [canMembers, canCrews, user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canMembers && !canCrews) {
    return <Navigate to="/" replace />;
  }

  const sendInvite = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLastInviteUrl("");
    try {
      const result = await api.members.invite({ email: inviteEmail, role: inviteRole });
      setLastInviteUrl(result.inviteUrl);
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err.message || "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId, role) => {
    setBusy(true);
    setError("");
    try {
      await api.members.updateRole(userId, role);
      await load();
    } catch (err) {
      setError(err.message || "Could not update role");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId, email) => {
    if (!window.confirm(`Remove ${email} from this company?`)) return;
    setBusy(true);
    try {
      await api.members.remove(userId);
      await load();
    } catch (err) {
      setError(err.message || "Could not remove member");
    } finally {
      setBusy(false);
    }
  };

  const resetCrewForm = () => {
    setCrewName("");
    setCrewLeader("");
    setCrewMembers([]);
    setCrewTags("");
    setEditingCrewId(null);
  };

  const startEditCrew = (crew) => {
    setEditingCrewId(crew.id);
    setCrewName(crew.name || "");
    setCrewLeader(crew.leader_user_id || "");
    setCrewMembers(Array.isArray(crew.member_user_ids) ? crew.member_user_ids : []);
    setCrewTags(Array.isArray(crew.capability_tags) ? crew.capability_tags.join(", ") : "");
  };

  const saveCrew = async (event) => {
    event.preventDefault();
    if (!crewName.trim()) return;
    setBusy(true);
    setError("");
    const payload = {
      name: crewName.trim(),
      leader_user_id: crewLeader || undefined,
      member_user_ids: crewMembers,
      capability_tags: crewTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (editingCrewId) await api.entities.Crew.update(editingCrewId, payload);
      else await api.entities.Crew.create(payload);
      resetCrewForm();
      await load();
    } catch (err) {
      setError(err.message || "Could not save crew");
    } finally {
      setBusy(false);
    }
  };

  const deleteCrew = async (crew) => {
    if (!window.confirm(`Delete crew “${crew.name}”? Jobs keep their history; assignment is cleared separately.`)) return;
    setBusy(true);
    try {
      await api.entities.Crew.delete(crew.id);
      await load();
    } catch (err) {
      setError(err.message || "Could not delete crew");
    } finally {
      setBusy(false);
    }
  };

  const toggleCrewMember = (userId) => {
    setCrewMembers((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
  };

  const memberLabel = (id) => {
    const m = members.find((row) => row.user_id === id);
    return m ? `${m.email} (${ROLE_LABELS[m.role] || m.role})` : id;
  };

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Team" description="Members and crews" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-10 max-w-3xl">
      <PageHeader
        title="Team"
        description="Invite people into this company account and organize production crews."
      />

      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}

      {canMembers ? (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Members</h2>
          <ul className="divide-y border rounded-md">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.email}</div>
                  <div className="text-muted-foreground text-xs">
                    {m.role === "owner" ? ROLE_LABELS.owner : ROLE_LABELS[m.role] || m.role}
                  </div>
                </div>
                {m.role !== "owner" && m.user_id !== user?.id ? (
                  <>
                    <Select value={m.role} onValueChange={(role) => changeRole(m.user_id, role)} disabled={busy}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => remove(m.user_id, m.email)}>
                      Remove
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>

          <form onSubmit={sendInvite} className="space-y-3 border rounded-md p-4">
            <h3 className="text-sm font-semibold">Invite a member</h3>
            <p className="text-xs text-muted-foreground">
              They join this company and share its customers and jobs (filtered by role). Copy the private link after inviting.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Create invite link"}</Button>
            {lastInviteUrl ? (
              <div className="rounded-md bg-muted p-3 text-xs break-all">
                <div className="font-medium mb-1">Share this private link (48 hours):</div>
                <code>{lastInviteUrl}</code>
              </div>
            ) : null}
          </form>

          {invites.length ? (
            <div>
              <h3 className="text-sm font-semibold mb-2">Pending invites</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                {invites.map((inv) => (
                  <li key={`${inv.email}-${inv.created_date}`}>
                    {inv.email} — {inv.role_label || ROLE_LABELS[inv.role] || inv.role}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {canCrews ? (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Crews</h2>
          <ul className="divide-y border rounded-md">
            {crews.map((crew) => (
              <li key={crew.id} className="px-3 py-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium flex-1">{crew.name}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => startEditCrew(crew)} disabled={busy}>Edit</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => deleteCrew(crew)} disabled={busy}>Delete</Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Leader: {crew.leader_user_id ? memberLabel(crew.leader_user_id) : "—"}
                  {" · "}
                  Members: {(crew.member_user_ids || []).map(memberLabel).join(", ") || "—"}
                  {crew.capability_tags?.length ? ` · Tags: ${crew.capability_tags.join(", ")}` : ""}
                </div>
              </li>
            ))}
            {!crews.length ? <li className="px-3 py-2 text-sm text-muted-foreground">No crews yet.</li> : null}
          </ul>

          <form onSubmit={saveCrew} className="space-y-3 border rounded-md p-4">
            <h3 className="text-sm font-semibold">{editingCrewId ? "Edit crew" : "New crew"}</h3>
            <div>
              <Label htmlFor="crew-name">Name</Label>
              <Input id="crew-name" required value={crewName} onChange={(e) => setCrewName(e.target.value)} />
            </div>
            <div>
              <Label>Leader</Label>
              <Select value={crewLeader || "__none__"} onValueChange={(v) => setCrewLeader(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select leader" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Members</Label>
              <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                {members.filter((m) => m.role !== "owner").map((m) => (
                  <label key={m.user_id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={crewMembers.includes(m.user_id)}
                      onChange={() => toggleCrewMember(m.user_id)}
                    />
                    <span>{m.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="crew-tags">Capability tags (comma-separated)</Label>
              <Input
                id="crew-tags"
                value={crewTags}
                onChange={(e) => setCrewTags(e.target.value)}
                placeholder="removal, aerial, stump_grinding"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{editingCrewId ? "Save crew" : "Create crew"}</Button>
              {editingCrewId ? (
                <Button type="button" variant="outline" onClick={resetCrewForm}>Cancel</Button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
