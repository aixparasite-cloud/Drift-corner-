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
