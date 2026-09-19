export function profileIsComplete(profile) {
  return Boolean(profile?.name && profile?.city && profile?.state && profile?.zip && profile?.phone);
}

export function businessLines(profile) {
  if (!profile) return [];
  const cityLine = [profile.city, profile.state, profile.zip].filter(Boolean).join(", ");
  return [profile.business_name, profile.name, profile.address, cityLine, profile.phone, profile.email, profile.website]
    .filter(value => typeof value === "string" && value.trim());
}

export function emptyProfile() {
  return { name: "", business_name: "", labor_rate: "", address: "", city: "", state: "", zip: "", phone: "", email: "", website: "", logo_url: "" };
}

export function profilePayload(form) {
  const labor = form.labor_rate === "" || form.labor_rate == null ? undefined : Number(form.labor_rate);
  return {
    name: form.name.trim(),
    business_name: form.business_name.trim() || undefined,
    logo_url: form.logo_url || undefined,
    labor_rate: Number.isFinite(labor) ? labor : undefined,
    address: form.address.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim(),
    zip: form.zip.trim(),
    phone: form.phone.trim(),
    email: form.email.trim() || undefined,
    website: form.website.trim() || undefined,
  };
}
