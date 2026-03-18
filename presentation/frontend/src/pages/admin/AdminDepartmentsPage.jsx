import { useEffect, useState } from "react";
import GlassCard from "../../components/GlassCard";
import api from "../../services/api";

export default function AdminDepartmentsPage() {
  const [form, setForm] = useState({ name: "", code: "" });
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", code: "" });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDepartments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/admin/departments");
      setDepartments(response.data.departments || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api.post("/admin/departments", form);
      setMessage("Department created successfully");
      setForm({ name: "", code: "" });
      loadDepartments();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to create department");
    }
  };

  const handleEditStart = (item) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, code: item.code });
  };

  const handleEditSave = async (departmentId) => {
    setMessage("");
    setError("");
    try {
      await api.put(`/admin/departments/${departmentId}`, {
        name: editForm.name.trim(),
        code: editForm.code.trim().toUpperCase()
      });
      setMessage("Department updated");
      setEditingId("");
      loadDepartments();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to update department");
    }
  };

  const handleDelete = async (departmentId) => {
    const confirmed = window.confirm("Delete this department?");
    if (!confirmed) return;

    setMessage("");
    setError("");
    try {
      await api.delete(`/admin/departments/${departmentId}`);
      setMessage("Department deleted");
      loadDepartments();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to delete department");
    }
  };

  return (
    <section className="space-y-5">
      <GlassCard>
        <h3 className="font-display text-lg text-white">Create Department</h3>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
          <input
            className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:border-brand-300"
            placeholder="Department name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:border-brand-300"
            placeholder="Code (ECE/CSE...)"
            value={form.code}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
            }
            required
          />
          <button
            className="rounded-xl bg-gradient-to-r from-violetBrand-500 to-brand-500 px-4 py-3 text-sm font-semibold text-white md:col-span-2"
            type="submit"
          >
            Create Department
          </button>
        </form>
      </GlassCard>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg text-white">Department List</h3>
          <button
            type="button"
            onClick={loadDepartments}
            className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
          >
            Refresh
          </button>
        </div>

        {loading ? <p className="mt-3 text-soft">Loading departments...</p> : null}

        {!loading && departments.length === 0 ? (
          <p className="mt-3 text-soft">No departments created yet.</p>
        ) : null}

        {departments.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-soft">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((item) => (
                  <tr key={item.id} className="border-t border-white/10">
                    <td className="px-3 py-3">
                      {editingId === item.id ? (
                        <input
                          className="w-24 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-white"
                          value={editForm.code}
                          onChange={(event) =>
                            setEditForm((prev) => ({
                              ...prev,
                              code: event.target.value.toUpperCase()
                            }))
                          }
                        />
                      ) : (
                        item.code
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editingId === item.id ? (
                        <input
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-white"
                          value={editForm.name}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-soft">{item.id}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {editingId === item.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditSave(item.id)}
                              className="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId("")}
                              className="rounded-lg bg-white/15 px-2 py-1 text-xs text-white"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditStart(item)}
                              className="rounded-lg bg-white/15 px-2 py-1 text-xs text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="rounded-lg bg-red-500/20 px-2 py-1 text-xs text-red-100"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </GlassCard>
    </section>
  );
}
