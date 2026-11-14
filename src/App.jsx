import React, { useEffect, useMemo, useState } from "react";
import { supabase, configured } from "./supabase";
import {
  Package, Plus, Search, ShoppingBag, BarChart3, Users, LogOut,
  CheckCircle2, Clock3, XCircle, Trash2, RefreshCw, Menu, X
} from "lucide-react";

const money = n => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(Number(n || 0));

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("inventory");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [form, setForm] = useState({ name:"", category:"T-Shirt", size:"", sku:"", cost:"", price:"", notes:"" });
  const [inviteEmail, setInviteEmail] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadAll();
    else { setProfile(null); setItems([]); setSales([]); setMembers([]); }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel("drift-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"inventory_items" }, loadInventory)
      .on("postgres_changes", { event:"*", schema:"public", table:"sales" }, loadSales)
      .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, loadMembers)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadProfile(), loadInventory(), loadSales(), loadMembers()]);
    setLoading(false);
  }
  async function loadProfile() {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (!error) setProfile(data);
  }
  async function loadInventory() {
    const { data, error } = await supabase.from("inventory_items").select("*, added_by_profile:profiles!inventory_items_added_by_fkey(full_name), sold_by_profile:profiles!inventory_items_sold_by_fkey(full_name)").order("created_at", { ascending:false });
    if (!error) setItems(data || []);
  }
  async function loadSales() {
    const { data, error } = await supabase.from("sales").select("*, seller:profiles!sales_sold_by_fkey(full_name), sale_lines(quantity, unit_price, item:inventory_items(name, sku))").order("created_at", { ascending:false });
    if (!error) setSales(data || []);
  }
  async function loadMembers() {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at");
    if (!error) setMembers(data || []);
  }
  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(""), 3500); }

  async function authenticate(e) {
    e.preventDefault();
    setLoading(true);
    const fn = authMode === "login" ? supabase.auth.signInWithPassword({ email, password }) :
      supabase.auth.signUp({ email, password, options:{ data:{ full_name: email.split("@")[0] } } });
    const { error } = await fn;
    setLoading(false);
    flash(error ? error.message : (authMode === "login" ? "Signed in." : "Account created. Ask the admin to approve your membership."));
  }
  async function signOut() { await supabase.auth.signOut(); }

  async function addItem(e) {
  e.preventDefault();

  if (uploading) return;

  setUploading(true);
  let uploadedPath = null;

  try {
    let photoUrl = null;

    if (photo) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
        throw new Error("Only JPG, PNG and WebP images are supported.");
      }

      if (photo.size > 5 * 1024 * 1024) {
        throw new Error("Image must be 5 MB or smaller.");
      }

      const extension = photo.type === "image/png"
        ? "png"
        : photo.type === "image/webp"
        ? "webp"
        : "jpg";

      uploadedPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("product-photos")
        .upload(uploadedPath, photo, {
          contentType: photo.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("product-photos")
        .getPublicUrl(uploadedPath);

      photoUrl = data.publicUrl;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      size: form.size.trim() || null,
      sku: form.sku.trim() || null,
      cost_price: Number(form.cost || 0),
      selling_price: Number(form.price),
      notes: form.notes.trim() || null,
      status: "available",
      added_by: session.user.id,
      photo_url: photoUrl
    };

    const { error } = await supabase
      .from("inventory_items")
      .insert(payload);

    if (error) throw error;

    setForm({
      name: "",
      category: "T-Shirt",
      size: "",
      sku: "",
      cost: "",
      price: "",
      notes: ""
    });

    setPhoto(null);
    setTab("inventory");
    flash("Product and photo saved successfully.");

  } catch (error) {
    console.error("Add item failed:", error);

    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage
        .from("product-photos")
        .remove([uploadedPath]);

      if (cleanupError) {
        console.error("Photo cleanup failed:", cleanupError);
      }
    }

    flash(error.message || "Unable to save product.");
  } finally {
    setUploading(false);
  }
}


  async function updateStatus(ids, status) {
    if (!ids.length) return;
    const { data, error } = await supabase.rpc("update_item_status_bulk", { item_ids:ids, new_status:status });
    if (error) return flash(error.message);
    setSelected([]); await loadAll();
    flash(`${data ?? ids.length} item(s) updated.`);
  }

  async function sell(ids) {
    if (!ids.length) return;
    const { error } = await supabase.rpc("sell_items_bulk", { item_ids:ids });
    if (error) return flash(error.message);
    setSelected([]); await loadAll(); flash("Sale recorded.");
  }

  async function inviteMember(e) {
    e.preventDefault();
    const { error } = await supabase.rpc("create_member_invite", { invite_email:inviteEmail.trim().toLowerCase() });
    if (error) return flash(error.message);
    setInviteEmail(""); flash("Invitation created. Share the invite link from your Supabase Auth dashboard or invite workflow.");
  }

  async function removeMember(id) {
    if (!window.confirm("Remove this member's access? Their sales history will remain.")) return;
    const { error } = await supabase.rpc("remove_team_member", { member_id:id });
    if (error) return flash(error.message);
    await loadMembers(); flash("Member access removed.");
  }

  const activeItems = items.filter(x => x.status !== "sold");
  const filtered = useMemo(() => items.filter(x =>
    (filter === "all" || x.status === filter) &&
    (`${x.name} ${x.sku || ""} ${x.category || ""}`).toLowerCase().includes(search.toLowerCase())
  ), [items, filter, search]);
  const revenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const costs = sales.reduce((sum, s) => sum + Number(s.total_cost || 0), 0);
  const expenses = sales.reduce((sum, s) => sum + Number(s.expenses || 0), 0);
  const profit = revenue - costs - expenses;
  const admin = profile?.role === "admin";

if (!configured) return <SetupScreen />;
if (!session) return <AuthScreen {...{email,setEmail,password,setPassword,authMode,setAuthMode,authenticate,loading,notice}} />;
