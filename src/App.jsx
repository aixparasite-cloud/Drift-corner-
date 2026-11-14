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
