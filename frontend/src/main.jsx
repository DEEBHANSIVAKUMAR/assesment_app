import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, LayoutDashboard, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));
  const [mode, setMode] = useState("login");

  const auth = useMemo(() => ({ token, user }), [token, user]);

  function saveSession(data) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setMode("login");
  }

  if (token && user) {
    return <Dashboard auth={auth} onLogout={logout} />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-row">
          <div className="brand-mark">😊</div>
          <div>
            <h1>CRUD TOOL APP</h1>
            <p>Registration and login FORM </p>
          </div>
        </div>

        <div className="tabs" role="tablist">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
        </div>

        <AuthForm mode={mode} onSuccess={saveSession} />
      </section>

      <aside className="auth-side">
        <h2>Features OF The App</h2>
        <p>Build a clean full-stack app with authentication, protected routes, validation, and CRUD operations.</p>
        <div className="feature-list">
          <span><CheckCircle2 size={18} /> React frontend</span>
          <span><CheckCircle2 size={18} /> Python FastAPI backend</span>
          <span><CheckCircle2 size={18} /> MongoDB database</span>
        </div>
      </aside>
    </main>
  );
}

function AuthForm({ mode, onSuccess }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function validate() {
    if (mode === "register" && form.name.trim().length < 2) return "Name must be at least 2 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email address.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "register" ? "/register" : "/login";
      const payload = mode === "register" ? form : { email: form.email, password: form.password };
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Something went wrong.");
      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {mode === "register" && (
        <label>
          Full name
          <input name="name" value={form.name} onChange={updateField} placeholder="Enter your name" />
        </label>
      )}
      <label>
        Email address
        <input name="email" type="email" value={form.email} onChange={updateField} placeholder="you@example.com" />
      </label>
      <label>
        Password
        <input name="password" type="password" value={form.password} onChange={updateField} placeholder="Minimum 6 characters" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={loading}>{loading ? "Please wait..." : mode === "register" ? "Create account" : "Login"}</button>
    </form>
  );
}

function Dashboard({ auth, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", status: "pending" });
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
        ...(options.headers || {}),
      },
    });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  }

  async function loadTasks() {
    try {
      setTasks(await api("/tasks"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function resetForm() {
    setEditingId("");
    setForm({ title: "", description: "", status: "pending" });
  }

  async function submit(event) {
    event.preventDefault();
    if (form.title.trim().length < 3) return setError("Title must be at least 3 characters.");
    if (form.description.trim().length < 5) return setError("Description must be at least 5 characters.");

    try {
      setError("");
      if (editingId) {
        await api(`/tasks/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api("/tasks", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  function editTask(task) {
    setEditingId(task.id);
    setForm({ title: task.title, description: task.description, status: task.status });
  }

  async function deleteTask(id) {
    try {
      await api(`/tasks/${id}`, { method: "DELETE" });
      setTasks((current) => current.filter((task) => task.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <span className="eyebrow"><LayoutDashboard size={16} /> Dashboard</span>
          <h1>Welcome, {auth.user.name}</h1>
        </div>
        <button className="ghost" onClick={onLogout}><LogOut size={18} /> Logout</button>
      </header>

      <section className="content-grid">
        <form className="task-form" onSubmit={submit}>
          <h2>{editingId ? "Update Item" : "Create Item"}</h2>
          <label>
            Title
            <input name="title" value={form.title} onChange={updateField} placeholder="Example: Candidate profile" />
          </label>
          <label>
            Description
            <textarea name="description" value={form.description} onChange={updateField} placeholder="Add meaningful task details" />
          </label>
          <label>
            Status
            <select name="status" value={form.status} onChange={updateField}>
              <option value="pending">Pending</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="primary"><Plus size={18} /> {editingId ? "Save changes" : "Add item"}</button>
            {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancel</button>}
          </div>
        </form>

        <section className="list-panel">
          <div className="list-header">
            <h2>CRUD Records</h2>
            <span>{tasks.length} items</span>
          </div>
          {tasks.length === 0 ? (
            <div className="empty-state">No records yet. Create your first item from the form.</div>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <article className="task-card" key={task.id}>
                  <div>
                    <span className={`status ${task.status}`}>{task.status.replace("-", " ")}</span>
                    <h3>{task.title}</h3>
                    <p>{task.description}</p>
                  </div>
                  <div className="icon-actions">
                    <button title="Edit" onClick={() => editTask(task)}><Pencil size={17} /></button>
                    <button title="Delete" onClick={() => deleteTask(task.id)}><Trash2 size={17} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
