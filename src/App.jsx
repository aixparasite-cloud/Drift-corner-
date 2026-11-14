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


  async function removeItem(item) {
    if (profile?.role !== "admin" || !profile?.active) {
      flash("Only an active admin can remove products.");
      return;
    }

    if (item.status === "sold") {
      flash("Sold products cannot be deleted.");
      return;
    }

    if (!window.confirm(
      `Permanently delete "${item.name}"? This cannot be undone.`
    )) return;

    try {
      const { data, error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", item.id)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(
          "Product not deleted. Check admin permissions or sales history."
        );
      }

      setSelected(prev => prev.filter(id => id !== item.id));
      await loadInventory();
      flash("Product removed successfully.");
    } catch (error) {
      console.error("Remove product failed:", error);
      flash(error.message || "Unable to remove product.");
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

  const nav = [
    ["inventory","Inventory",Package],["add","Add item",Plus],["sales","Sales & profit",BarChart3],["team","Team",Users]
  ];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark">DC</div><div><b>DRIFT CORNER</b><small>THRIFT MANAGEMENT</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileMenu(false)}><X/></button></div>
      <div className="workspace"><span className="live-dot"/> Shared workspace <span className="workspace-tag">INR</span></div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setMobileMenu(false)}}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="profile-chip"><div className="avatar">{(profile?.full_name || session.user.email)[0].toUpperCase()}</div><div><b>{profile?.full_name || "Team member"}</b><small>{admin?"Administrator":"Team member"}</small></div></div><button className="logout" onClick={signOut}><LogOut size={16}/> Sign out</button></div>
    </aside>
    {mobileMenu && <div className="scrim" onClick={()=>setMobileMenu(false)}/>}
    <main className="main">
      <header className="topbar"><button className="icon-btn menu-trigger" onClick={()=>setMobileMenu(true)}><Menu/></button><div><span className="eyebrow">DRIFT CORNER / WORKSPACE</span><h1>{nav.find(x=>x[0]===tab)?.[1]}</h1></div><div className="top-actions"><span className="sync"><span className="live-dot"/> Live sync</span><button className="icon-btn" onClick={loadAll} title="Refresh"><RefreshCw size={17}/></button></div></header>
      {notice && <div className="toast">{notice}</div>}
      <section className="content">
        <div className="stats-grid">
          <Stat label="Total pieces" value={items.length} icon={<Package/>}/>
          <Stat label="Available" value={items.filter(x=>x.status==="available").length} tone="green" icon={<CheckCircle2/>}/>
          <Stat label="Reserved" value={items.filter(x=>x.status==="reserved").length} tone="amber" icon={<Clock3/>}/>
          <Stat label="Sold out" value={items.filter(x=>x.status==="sold").length} tone="red" icon={<XCircle/>}/>
        </div>

        {tab==="inventory" && <section className="panel">
          <div className="panel-heading"><div><h2>All inventory</h2><p>Every unique piece, tracked individually.</p></div><button className="btn primary" onClick={()=>setTab("add")}><Plus size={16}/> Add item</button></div>
          <div className="toolbar"><div className="searchbox"><Search size={17}/><input placeholder="Search item, SKU or category..." value={search} onChange={e=>setSearch(e.target.value)}/></div><select value={filter} onChange={e=>{setFilter(e.target.value);setSelected([])}}><option value="all">All status</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold out</option></select></div>
          {selected.length>0 && <div className="bulkbar"><b>{selected.length} selected</b><div><button className="btn success small" onClick={()=>sell(selected)}>Sell selected</button><button className="btn warning small" onClick={()=>updateStatus(selected,"reserved")}>Reserve</button><button className="btn ghost small" onClick={()=>setSelected([])}>Clear</button></div></div>}
          <div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={filtered.filter(x=>x.status!=="sold").length>0 && filtered.filter(x=>x.status!=="sold").every(x=>selected.includes(x.id))} onChange={e=>setSelected(e.target.checked?filtered.filter(x=>x.status!=="sold").map(x=>x.id):[])}/></th><th>Product</th><th>SKU</th><th>Size</th><th>Price</th><th>Status</th><th>Added by</th><th>Action</th></tr></thead><tbody>
            {filtered.map(item=><tr key={item.id}><td><input type="checkbox" disabled={item.status==="sold"} checked={selected.includes(item.id)} onChange={e=>setSelected(e.target.checked?[...selected,item.id]:selected.filter(x=>x!==item.id))}/></td>
<td>
  <div style={{
    display: "flex",
    alignItems: "center",
    gap: 12
  }}>
    {item.photo_url && (
      <img
        src={item.photo_url}
        alt={item.name}
        loading="lazy"
        style={{
          width: 56,
          height: 56,
          objectFit: "cover",
          borderRadius: 8
        }}
      />
    )}

    <div>
      <b>{item.name}</b>
      <small>{item.category}</small>
    </div>
  </div>
</td>
<td>{item.sku || "—"}</td><td>{item.size || "—"}</td><td><b>{money(item.selling_price)}</b></td><td><Status status={item.status}/></td><td>{item.added_by_profile?.full_name || "—"}</td><td><div className="row-actions">{item.status==="available" && <><button className="mini-action" onClick={()=>sell([item.id])}>Sell</button><button className="mini-action" onClick={()=>updateStatus([item.id],"reserved")}>Reserve</button></>}{item.status==="reserved" && <button className="mini-action" onClick={()=>updateStatus([item.id],"available")}>Release</button>}</div></td></tr>)}
          </tbody></table>{filtered.length===0 && <div className="empty">No matching products. Add your first thrift piece.</div>}</div>
        </section>}

        {tab==="add" && <section className="panel form-panel"><div className="panel-heading"><div><h2>Add a unique piece</h2><p>Each thrift item gets its own stock record.</p></div></div><form className="form-grid" onSubmit={addItem}>
          <Field label="Item name" required><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Vintage graphic tee"/></Field>
          <Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["T-Shirt","Shirt","Jeans","Hoodie","Jacket","Shoes","Accessories","Other"].map(x=><option>{x}</option>)}</select></Field>
          <Field label="Size"><input value={form.size} onChange={e=>setForm({...form,size:e.target.value})} placeholder="M / L / 32 / UK 8"/></Field>
          <Field label="SKU / item code"><input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} placeholder="Optional"/></Field>
          <Field label="Purchase cost (₹)"><input type="number" min="0" step="0.01" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} placeholder="What the business paid"/></Field>
          <Field label="Selling price (₹)" required><input required type="number" min="1" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="Expected selling price"/></Field>
          <div className="full"><Field label="Notes"><textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Condition, flaws, brand details..."/></Field></div>
         
<div className="full">
  <Field label="Product photo (optional)">
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={e => setPhoto(e.target.files?.[0] || null)}
    />
  </Field>

  {photo && (
    <img
      src={URL.createObjectURL(photo)}
      alt="Selected product preview"
      style={{
        width: 160,
        height: 160,
        objectFit: "cover",
        borderRadius: 12,
        marginTop: 12
      }}
    />
  )}
</div>
 <div className="full form-footer"><button className="btn primary" type="submit" disabled={uploading}><Plus size={16}/> {uploading ? "Saving..." : "Save item"}</button></div>
        </form></section>}

        {tab==="sales" && <><div className="stats-grid finance"><Stat label="Sales revenue" value={money(revenue)} tone="green"/><Stat label="Product cost" value={money(costs)}/><Stat label="Expenses" value={money(expenses)} tone="amber"/><Stat label="Gross profit*" value={money(profit)} tone={profit>=0?"green":"red"}/></div><section className="panel"><div className="panel-heading"><div><h2>Member performance</h2><p>Revenue credited to the member who completed each sale.</p></div></div><div className="member-sales">{members.map(m=>{const mine=sales.filter(s=>s.sold_by===m.id);const total=mine.reduce((a,s)=>a+Number(s.total_amount||0),0);const count=mine.reduce((a,s)=>a+(s.sale_lines||[]).reduce((b,l)=>b+Number(l.quantity||1),0),0);return <div className="member-row" key={m.id}><div className="member-avatar">{(m.full_name||m.email||"?")[0].toUpperCase()}</div><div className="member-info"><b>{m.full_name||m.email}</b><small>{count} item(s) sold</small></div><strong>{money(total)}</strong></div>})}</div><p className="footnote">*Profit shown here is revenue minus recorded product cost and expenses. Add operating expenses in the accounting module when enabled.</p></section><section className="panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Recorded transactions across the team.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Sold by</th><th>Items</th><th>Revenue</th><th>Cost</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>{new Date(s.created_at).toLocaleString("en-IN")}</td><td>{s.seller?.full_name||"Member"}</td><td>{(s.sale_lines||[]).map(l=>l.item?.name).filter(Boolean).join(", ")}</td><td>{money(s.total_amount)}</td><td>{money(s.total_cost)}</td></tr>)}</tbody></table>{!sales.length&&<div className="empty">No sales recorded yet.</div>}</div></section></>}

        {tab==="team" && <section className="panel"><div className="panel-heading"><div><h2>Team members</h2><p>All approved members can add, reserve and sell inventory.</p></div><span className="role-pill">You: {admin?"Admin":"Member"}</span></div>{admin&&<form className="invite-form" onSubmit={inviteMember}><input type="email" required placeholder="New member's email address" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/><button className="btn primary"><Plus size={16}/> Invite member</button></form>}<div className="team-list">{members.map(m=><div className="team-row" key={m.id}><div className="member-avatar">{(m.full_name||m.email||"?")[0].toUpperCase()}</div><div className="member-info"><b>{m.full_name||"Team member"}</b><small>{m.email}</small></div><span className={`role-pill ${m.role==="admin"?"admin":""}`}>{m.role}</span>{admin&&m.role!=="admin"&&<button className="icon-btn danger-icon" title="Remove member" onClick={()=>removeMember(m.id)}><Trash2 size={17}/></button>}</div>)}</div>{!admin&&<p className="footnote">Only the workspace admin can invite or remove members.</p>}</section>}
      </section>
      <footer>DRIFT CORNER <span>Shared inventory • Indian Rupees</span></footer>
    </main>
  </div>;
}

function Stat({label,value,icon,tone=""}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span>{icon&&<i>{icon}</i>}</div><strong className={tone}>{value}</strong></div>; }
function Status({status}) { const map={available:["Available","green"],reserved:["Reserved","amber"],sold:["Sold out","red"]}; return <span className={`status ${map[status]?.[1]}`}>{map[status]?.[0]||status}</span>; }
function Field({label,required,children}) { return <label className="field"><span>{label}{required&&" *"}</span>{children}</label>; }
function AuthScreen(p) { return <div className="auth-wrap"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark">DC</div><div><b>DRIFT CORNER</b><small>THRIFT MANAGEMENT</small></div></div><h1>{p.authMode==="login"?"Welcome back":"Create your account"}</h1><p>Sign in to your shared team inventory.</p><form onSubmit={p.authenticate}><Field label="Email"><input type="email" required value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@example.com"/></Field><Field label="Password"><input type="password" minLength="8" required value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="At least 8 characters"/></Field><button className="btn primary wide" disabled={p.loading}>{p.loading?"Please wait…":p.authMode==="login"?"Sign in":"Create account"}</button></form><button className="text-btn" onClick={()=>p.setAuthMode(p.authMode==="login"?"signup":"login")}>{p.authMode==="login"?"New to Drift Corner? Create account":"Already have an account? Sign in"}</button>{p.notice&&<div className="notice">{p.notice}</div>}</div></div>; }
function SetupScreen() { return <div className="setup-wrap"><div className="setup-card"><div className="brand"><div className="brand-mark">DC</div><div><b>DRIFT CORNER</b><small>THRIFT MANAGEMENT</small></div></div><h1>Connect your workspace</h1><p>The app frontend is ready. Add your Supabase project credentials to connect shared accounts and live inventory.</p><ol><li>Create a Supabase project.</li><li>Run the SQL in <code>supabase/schema.sql</code>.</li><li>Copy <code>.env.example</code> to <code>.env</code> and add the project URL and anon key.</li><li>Run <code>npm install</code> then <code>npm run dev</code>.</li></ol><p className="notice">Setup is required before team logins and shared data work. Never put a service-role key in this app.</p></div></div>; }
