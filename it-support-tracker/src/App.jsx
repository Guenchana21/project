import { useEffect, useState } from "react";
import "./App.css";

const STATUSES = ["Pending", "In Progress", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High"];
const AUTH_TOKEN_KEY = "it-support-auth-token";

async function apiRequest(endpoint, options = {}) {
    const { auth = true, ...fetchOptions } = options;
    let token = "";
    try {
        token = auth ? localStorage.getItem(AUTH_TOKEN_KEY) || "" : "";
    } catch {
        // Requests can still proceed when browser storage is unavailable.
    }
    const response = await fetch(`/api${endpoint}`, {
        ...fetchOptions,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...fetchOptions.headers,
        },
    });
    if (response.status === 204) return null;
    const responseText = await response.text();
    let result;
    try {
        result = responseText ? JSON.parse(responseText) : {};
    } catch {
        throw new Error(`Backend returned a non-JSON response (${response.status}). Check that the API server is running on the configured port.`);
    }
    if (!response.ok) throw new Error(result.error || "The API request failed.");
    return result;
}

function getLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
    });
}

const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "tickets", label: "Tickets" },
    { id: "employees", label: "Employees" },
    { id: "devices", label: "Devices" },
    { id: "reports", label: "Reports" },
    { id: "settings", label: "Settings" },
];

function NavIcon({ name }) {
    const icons = {
        dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
        tickets: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v3a2.5 2.5 0 0 0 0 5v3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-3a2.5 2.5 0 0 0 0-5z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
        employees: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
        devices: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
        reports: <><path d="M4 19V5m0 14h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
        settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8z" /></>,
    };
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

function Sidebar({ activePage, onNavigate, staff, onSignOut, onProfileUpdated, collapsed, onToggle }) {
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
    const [profileDraft, setProfileDraft] = useState({ name: staff.name, email: staff.email, avatar: staff.avatar || "" });
    const [profileError, setProfileError] = useState("");
    const [profileSaving, setProfileSaving] = useState(false);

    function openProfileSettings() {
        setProfileDraft({ name: staff.name, email: staff.email, avatar: staff.avatar || "" });
        setProfileError("");
        setProfileMenuOpen(false);
        setProfileSettingsOpen(true);
    }

    async function saveProfile(event) {
        event.preventDefault();
        setProfileError("");
        setProfileSaving(true);
        try {
            const result = await apiRequest("/auth/profile", { method: "PATCH", body: JSON.stringify(profileDraft) });
            onProfileUpdated(result.staff);
            setProfileSettingsOpen(false);
        } catch (saveError) {
            setProfileError(saveError.message);
        } finally {
            setProfileSaving(false);
        }
    }

    async function chooseProfilePicture(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
            setProfileError("Choose a PNG, JPEG, WebP, or GIF image.");
            return;
        }
        if (file.size > 1024 * 1024) {
            setProfileError("Profile pictures must be 1 MB or smaller.");
            return;
        }
        try {
            const avatar = await readFileAsDataUrl(file);
            setProfileDraft((draft) => ({ ...draft, avatar }));
            setProfileError("");
        } catch (fileError) {
            setProfileError(fileError.message);
        }
    }

    return (
        <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
            <div className="sidebar-brand">
                <span className="brand-mark">IT</span>
                {!collapsed && <span className="brand-name">Support desk</span>}
                <button className="sidebar-toggle" type="button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
                    {collapsed ? "›" : "‹"}
                </button>
            </div>
            <nav aria-label="Main navigation" className="sidebar-nav">
                {NAV_ITEMS.map((item) => (
                    <button
                        className={`nav-item${activePage === item.id ? " nav-item-active" : ""}`}
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate(item.id)}
                        title={collapsed ? item.label : undefined}
                        aria-current={activePage === item.id ? "page" : undefined}
                    >
                        <NavIcon name={item.id} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
            <footer className="sidebar-account">
                <button className="account-profile-trigger" type="button" onClick={() => setProfileMenuOpen((open) => !open)} aria-expanded={profileMenuOpen} aria-haspopup="menu" title="Open profile menu">
                    <span className="account-avatar" aria-hidden="true">{staff.avatar ? <img src={staff.avatar} alt="" /> : staff.name.slice(0, 1).toUpperCase()}</span>
                    {!collapsed && <span className="account-copy"><strong>{staff.name}</strong><span>{staff.email}</span></span>}
                </button>
                {profileMenuOpen && <div className="profile-menu" role="menu">
                    <div className="profile-menu-heading"><strong>{staff.name}</strong><span>{staff.role}</span></div>
                    <button className="profile-settings-button" type="button" role="menuitem" onClick={openProfileSettings}>Profile settings</button>
                    <button className="profile-logout-button" type="button" role="menuitem" onClick={onSignOut}>Log out</button>
                </div>}
            </footer>
            {profileSettingsOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setProfileSettingsOpen(false)}>
                <form className="ticket-modal profile-settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title" onSubmit={saveProfile}>
                    <div className="modal-title-row"><div><p className="page-eyebrow">YOUR ACCOUNT</p><h2 id="profile-settings-title">Profile settings</h2></div><button className="modal-close" type="button" onClick={() => setProfileSettingsOpen(false)} aria-label="Close">×</button></div>
                    <div className="profile-picture-editor">
                        <span className="profile-picture-preview">{profileDraft.avatar ? <img src={profileDraft.avatar} alt="Profile preview" /> : profileDraft.name.slice(0, 1).toUpperCase()}</span>
                        <div><label className="profile-picture-upload">Choose picture<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseProfilePicture} /></label><small>PNG, JPEG, WebP, or GIF. Maximum 1 MB.</small>{profileDraft.avatar && <button className="text-button" type="button" onClick={() => setProfileDraft((draft) => ({ ...draft, avatar: "" }))}>Remove picture</button>}</div>
                    </div>
                    <label>Full name<input required minLength="2" autoComplete="name" value={profileDraft.name} onChange={(event) => setProfileDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
                    <label>Email<input type="email" required autoComplete="email" value={profileDraft.email} onChange={(event) => setProfileDraft((draft) => ({ ...draft, email: event.target.value }))} /></label>
                    {profileError && <p className="form-error" role="alert">{profileError}</p>}
                    <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setProfileSettingsOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save profile"}</button></div>
                </form>
            </div>}
        </aside>
    );
}

function TicketCard({ title, number, tone = "neutral", compact = false }) {
    return (
        <article className={`ticket-card ticket-card-${tone}${compact ? " ticket-card-compact" : ""}`}>
            <p>{title}</p>
            <strong>{number}</strong>
        </article>
    );
}

function App() {
    const [activePage, setActivePage] = useState("dashboard");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showTicketModal, setShowTicketModal] = useState(false);
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [devices, setDevices] = useState([]);
    const [entitiesLoading, setEntitiesLoading] = useState(false);
    const [entityModalOpen, setEntityModalOpen] = useState(false);
    const [editingEntity, setEditingEntity] = useState(null);
    const [entityDraft, setEntityDraft] = useState({ name: "", email: "", department: "", assetTag: "", type: "", status: "Available", employeeId: "", createAccount: false, password: "" });
    const [entityError, setEntityError] = useState("");
    const [openActionId, setOpenActionId] = useState(null);
    const [filterTechnician, setFilterTechnician] = useState("All");
    const [currentPage, setCurrentPage] = useState(1);
    const [confirmAction, setConfirmAction] = useState(null);
    const [resetPasswordStaff, setResetPasswordStaff] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [authToken, setAuthToken] = useState("");
    const [currentStaff, setCurrentStaff] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [setupRequired, setSetupRequired] = useState(false);
    const [authName, setAuthName] = useState("");
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authError, setAuthError] = useState("");
    const [staffMembers, setStaffMembers] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    const [newTechnicianName, setNewTechnicianName] = useState("");
    const [newTechnicianEmail, setNewTechnicianEmail] = useState("");
    const [editingTechnicianId, setEditingTechnicianId] = useState(null);
    const [technicianEmailDraft, setTechnicianEmailDraft] = useState("");
    const [technicianAdminError, setTechnicianAdminError] = useState("");
    const [technicianAdminMessage, setTechnicianAdminMessage] = useState("");
    const [assigningTicketId, setAssigningTicketId] = useState(null);
    const [assignmentDraft, setAssignmentDraft] = useState("");
    const [newStaffName, setNewStaffName] = useState("");
    const [newStaffEmail, setNewStaffEmail] = useState("");
    const [newStaffPassword, setNewStaffPassword] = useState("");
    const [staffPasswordDrafts, setStaffPasswordDrafts] = useState({});
    const [staffAdminError, setStaffAdminError] = useState("");
    const [staffAdminMessage, setStaffAdminMessage] = useState("");
    const [employee, setEmployee] = useState("");
    const [issue, setIssue] = useState("");
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [priority, setPriority] = useState("Medium");
    const [priorityFilter, setPriorityFilter] = useState("All");
    const [technician, setTechnician] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [editingTicket, setEditingTicket] = useState(null);
    const [detailsTicketId, setDetailsTicketId] = useState(null);
    const staffName = currentStaff?.name || "IT Support Staff";
    const [commentDraft, setCommentDraft] = useState("");
    const [attachmentError, setAttachmentError] = useState("");

    useEffect(() => {
        let cancelled = false;
        async function restoreSession() {
            try {
                const status = await apiRequest("/auth/status", { auth: false });
                if (cancelled) return;
                setSetupRequired(status.setupRequired);
                let savedToken = "";
                try {
                    savedToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
                } catch {
                    // Sign-in remains available without session persistence.
                }
                if (savedToken) {
                    try {
                        const session = await apiRequest("/auth/me");
                        if (!cancelled) {
                            setAuthToken(savedToken);
                            setCurrentStaff(session.staff);
                        }
                    } catch {
                        localStorage.removeItem(AUTH_TOKEN_KEY);
                    }
                }
            } catch (loadError) {
                if (!cancelled) setAuthError(`Could not connect to the backend: ${loadError.message}`);
            } finally {
                if (!cancelled) setAuthReady(true);
            }
        }
        restoreSession();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!currentStaff) {
            setTickets([]);
            setLoading(false);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        async function loadFromApi() {
            try {
                let loadedTickets = await apiRequest("/tickets");
                if (loadedTickets.length === 0) {
                    try {
                        const previousData = JSON.parse(localStorage.getItem("it-support-tickets") || "[]");
                        if (Array.isArray(previousData) && previousData.length) {
                            const seenIds = new Set();
                            const legacyTickets = previousData.filter((ticket) => {
                                const valid = ticket && Number.isSafeInteger(ticket.id) && ticket.id > 0 &&
                                    typeof ticket.employee === "string" && typeof ticket.issue === "string" &&
                                    STATUSES.includes(ticket.status) && !seenIds.has(ticket.id);
                                if (valid) seenIds.add(ticket.id);
                                return valid;
                            }).map((ticket) => ({
                                ...ticket,
                                priority: PRIORITIES.includes(ticket.priority) ? ticket.priority : "Medium",
                                technician: typeof ticket.technician === "string" ? ticket.technician : "",
                                dueDate: typeof ticket.dueDate === "string" ? ticket.dueDate : "",
                                activity: Array.isArray(ticket.activity) ? ticket.activity : [],
                                comments: Array.isArray(ticket.comments) ? ticket.comments : [],
                                attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
                            }));
                            if (!legacyTickets.length) return;
                            loadedTickets = await apiRequest("/tickets/import", {
                                method: "PUT",
                                body: JSON.stringify(legacyTickets),
                            });
                            localStorage.removeItem("it-support-tickets");
                        }
                    } catch (migrationError) {
                        console.warn("Could not import old browser tickets:", migrationError);
                    }
                }
                if (!cancelled) setTickets(loadedTickets);
            } catch (loadError) {
                if (!cancelled) setError(`Could not load tickets from the backend: ${loadError.message}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadFromApi();
        return () => { cancelled = true; };
    }, [currentStaff, authToken]);

    useEffect(() => {
        if (currentStaff?.role !== "admin") return undefined;
        let cancelled = false;
        apiRequest("/auth/staff")
            .then((members) => { if (!cancelled) setStaffMembers(members); })
            .catch((loadError) => { if (!cancelled) setStaffAdminError(loadError.message); });
        return () => { cancelled = true; };
    }, [currentStaff, authToken]);

    useEffect(() => {
        if (!currentStaff) {
            setTechnicians([]);
            return undefined;
        }
        let cancelled = false;
        apiRequest("/technicians")
            .then((items) => { if (!cancelled) setTechnicians(items); })
            .catch((loadError) => { if (!cancelled) setTechnicianAdminError(loadError.message); });
        return () => { cancelled = true; };
    }, [currentStaff, authToken]);

    useEffect(() => {
        if (!currentStaff) {
            setEmployees([]);
            setDevices([]);
            return undefined;
        }
        let cancelled = false;
        setEntitiesLoading(true);
        Promise.all([apiRequest("/employees"), apiRequest("/devices")])
            .then(([loadedEmployees, loadedDevices]) => {
                if (!cancelled) {
                    setEmployees(loadedEmployees);
                    setDevices(loadedDevices);
                    setEntityError("");
                }
            })
            .catch((loadError) => { if (!cancelled) setEntityError(`Could not load employees and devices: ${loadError.message}`); })
            .finally(() => { if (!cancelled) setEntitiesLoading(false); });
        return () => { cancelled = true; };
    }, [currentStaff, authToken]);

    const countFor = (status) => tickets.filter((ticket) => ticket.status === status).length;
    const resolvedCount = countFor("Resolved");
    const pendingCount = countFor("Pending");
    const resolutionRate = tickets.length === 0
        ? 0
        : Math.round((resolvedCount / tickets.length) * 100);
    const inProgressCount = countFor("In Progress");
    const totalTickets = tickets.length;
    const overdueCount = tickets.filter((ticket) => ticket.status !== "Resolved" && ticket.dueDate && ticket.dueDate < getLocalDate()).length;

    const pendingPercent = totalTickets === 0
        ? 0
        : Math.round((pendingCount / totalTickets) * 100);

    const inProgressPercent = totalTickets === 0
        ? 0
        : Math.round((inProgressCount / totalTickets) * 100);

    const resolvedPercent = totalTickets === 0
        ? 0
        : Math.round((resolvedCount / totalTickets) * 100);

    const priorityCounts = PRIORITIES.map((level) => ({
        level,
        count: tickets.filter((ticket) => ticket.priority === level).length,
    }));
    const maxPriorityCount = Math.max(1, ...priorityCounts.map(({ count }) => count));
    const technicianOptions = technicians.map((item) => item.name).sort((a, b) => a.localeCompare(b));
    const ticketTechnicianOptions = [...new Set([...technicianOptions, ...tickets.map((ticket) => ticket.technician).filter(Boolean)])].sort();
    const matchingTickets = tickets.filter((ticket) => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query ||
            String(ticket.id).includes(query.replace(/^#/, "")) ||
            ticket.employee.toLowerCase().includes(query) ||
            ticket.issue.toLowerCase().includes(query);
        const matchesStatus = statusFilter === "All" || ticket.status === statusFilter;
        const matchesPriority = priorityFilter === "All" || ticket.priority === priorityFilter;
        const matchesTechnician = filterTechnician === "All" ||
            (filterTechnician === "Unassigned" ? !ticket.technician && ticket.status !== "Resolved" : ticket.technician === filterTechnician);
        return matchesSearch && matchesStatus && matchesPriority && matchesTechnician;
    });
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(matchingTickets.length / pageSize));
    const safePage = Math.min(currentPage, pageCount);
    const pageTickets = matchingTickets.slice((safePage - 1) * pageSize, safePage * pageSize);
    const overdueTickets = tickets.filter((ticket) => ticket.status !== "Resolved" && ticket.dueDate && ticket.dueDate < getLocalDate());
    const highPriorityTickets = tickets.filter((ticket) => ticket.priority === "High" && ticket.status !== "Resolved");
    const unassignedTickets = tickets.filter((ticket) => !ticket.technician && ticket.status !== "Resolved");
    const reportNow = new Date();
    const reportMonthStart = new Date(reportNow.getFullYear(), reportNow.getMonth() - 11, 1);
    const reportTicketDates = tickets.map((ticket) => {
        const history = ticket.activity || [];
        const createdEvent = history.find((item) => item.action === "created");
        const createdAt = createdEvent?.at ? new Date(createdEvent.at) : null;
        const statusEvents = history.filter((item) => item.action === "status" && item.at)
            .sort((a, b) => new Date(a.at) - new Date(b.at));
        const lastStatusEvent = statusEvents[statusEvents.length - 1];
        const resolvedAt = ticket.status === "Resolved" && /\bto Resolved\b/.test(lastStatusEvent?.text || "")
            ? new Date(lastStatusEvent.at)
            : null;
        const resolutionMs = createdAt && resolvedAt && resolvedAt >= createdAt ? resolvedAt - createdAt : null;
        return { ticket, createdAt, resolvedAt, resolutionMs };
    });
    const reportResolvedByMonth = Array.from({ length: 12 }, (_, index) => {
        const date = new Date(reportMonthStart.getFullYear(), reportMonthStart.getMonth() + index, 1);
        return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleDateString(undefined, { month: "short" }), count: 0 };
    });
    const reportMonthLookup = new Map(reportResolvedByMonth.map((item, index) => [item.key, index]));
    for (const item of reportTicketDates) {
        if (!item.resolvedAt || item.resolvedAt < reportMonthStart) continue;
        const monthIndex = reportMonthLookup.get(`${item.resolvedAt.getFullYear()}-${item.resolvedAt.getMonth()}`);
        if (monthIndex !== undefined) reportResolvedByMonth[monthIndex].count += 1;
    }
    const reportResolvedThisMonth = reportResolvedByMonth[reportResolvedByMonth.length - 1].count;
    const reportMaxResolvedMonth = Math.max(1, ...reportResolvedByMonth.map((item) => item.count));
    const reportPriorityCounts = PRIORITIES.map((level) => ({ label: level, count: tickets.filter((ticket) => ticket.priority === level).length }));
    const reportMaxPriority = Math.max(1, ...reportPriorityCounts.map((item) => item.count));
    const resolvedWithTimes = reportTicketDates.filter((item) => item.resolutionMs !== null);
    const averageResolutionMs = resolvedWithTimes.length
        ? resolvedWithTimes.reduce((sum, item) => sum + item.resolutionMs, 0) / resolvedWithTimes.length
        : null;
    const formatResolutionTime = (milliseconds) => {
        if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
        const hours = milliseconds / (60 * 60 * 1000);
        return hours < 24 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`;
    };
    const reportTechnicianPerformance = [...new Set([...technicianOptions, ...tickets.map((ticket) => ticket.technician).filter(Boolean)])]
        .map((name) => {
            const completed = reportTicketDates.filter((item) => item.ticket.technician === name && item.ticket.status === "Resolved");
            const timed = completed.filter((item) => item.resolutionMs !== null);
            return {
                name,
                resolved: completed.length,
                open: tickets.filter((ticket) => ticket.technician === name && ticket.status !== "Resolved").length,
                averageMs: timed.length ? timed.reduce((sum, item) => sum + item.resolutionMs, 0) / timed.length : null,
            };
        })
        .sort((a, b) => b.resolved - a.resolved || a.name.localeCompare(b.name));
    reportTechnicianPerformance.push({
        name: "Unassigned",
        resolved: tickets.filter((ticket) => !ticket.technician && ticket.status === "Resolved").length,
        open: unassignedTickets.length,
        averageMs: null,
    });
    const reportMaxTechnicianResolved = Math.max(1, ...reportTechnicianPerformance.map((item) => item.resolved));
    const storedAttachments = tickets.flatMap((ticket) => (ticket.attachments || []).map((file) => ({ ...file, ticketId: ticket.id, employee: ticket.employee })))
        .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
    const detailsTicket = tickets.find((ticket) => ticket.id === detailsTicketId);

    function navigateTo(page) {
        setActivePage(page);
        setOpenActionId(null);
    }

    function clearFilters() {
        setSearch("");
        setStatusFilter("All");
        setPriorityFilter("All");
        setFilterTechnician("All");
        setCurrentPage(1);
    }

    function downloadTicketReport() {
        const headers = ["Ticket ID", "Employee", "Issue", "Status", "Priority", "Assigned technician", "Due date", "Comments", "Attachments"];
        const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
        const rows = tickets.map((ticket) => [
            ticket.id,
            ticket.employee,
            ticket.issue,
            ticket.status,
            ticket.priority,
            ticket.technician || "Unassigned",
            ticket.dueDate || "",
            (ticket.comments || []).length,
            (ticket.attachments || []).map((file) => file.name).join("; "),
        ]);
        const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "it-support-ticket-report.csv";
        link.click();
        URL.revokeObjectURL(url);
    }

    function askToConfirm({ title, message, confirmLabel, action, danger = true }) {
        setConfirmAction({ title, message, confirmLabel, action, danger });
        setOpenActionId(null);
    }

    async function runConfirmedAction() {
        if (!confirmAction) return;
        const { action } = confirmAction;
        setConfirmAction(null);
        await action();
    }

    async function submitAuth(event) {
        event.preventDefault();
        setAuthError("");
        const endpoint = setupRequired ? "/auth/bootstrap" : "/auth/login";
        const body = setupRequired
            ? { name: authName, email: authEmail, password: authPassword }
            : { email: authEmail, password: authPassword };
        try {
            const session = await apiRequest(endpoint, { method: "POST", auth: false, body: JSON.stringify(body) });
            localStorage.setItem(AUTH_TOKEN_KEY, session.token);
            setAuthToken(session.token);
            setCurrentStaff(session.staff);
            setSetupRequired(false);
            setAuthPassword("");
        } catch (loginError) {
            setAuthError(loginError.message);
        }
    }

    async function signOut() {
        try {
            await apiRequest("/auth/logout", { method: "POST" });
        } catch {
            // Clear the local token even if the server session already expired.
        }
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken("");
        setCurrentStaff(null);
        setStaffMembers([]);
    }

    async function addStaffMember(event) {
        event.preventDefault();
        setStaffAdminError("");
        setStaffAdminMessage("");
        try {
            const member = await apiRequest("/auth/staff", {
                method: "POST",
                body: JSON.stringify({ name: newStaffName, email: newStaffEmail, password: newStaffPassword }),
            });
            setStaffMembers((current) => [...current, member]);
            setNewStaffName("");
            setNewStaffEmail("");
            setNewStaffPassword("");
            setShowStaffModal(false);
            setStaffAdminMessage(`Created account for ${member.name}.`);
        } catch (createError) {
            setStaffAdminError(createError.message);
        }
    }

    async function addTechnician(event) {
        event.preventDefault();
        setTechnicianAdminError("");
        setTechnicianAdminMessage("");
        try {
            const saved = await apiRequest("/technicians", {
                method: "POST",
                body: JSON.stringify({ name: newTechnicianName, email: newTechnicianEmail }),
            });
            setTechnicians((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
            setNewTechnicianName("");
            setNewTechnicianEmail("");
            setTechnicianAdminMessage(`${saved.name} was added to the technician list.`);
        } catch (saveError) {
            setTechnicianAdminError(saveError.message);
        }
    }

    async function removeTechnician(technicianRecord) {
        setTechnicianAdminError("");
        setTechnicianAdminMessage("");
        try {
            await apiRequest(`/technicians/${technicianRecord.id}`, { method: "DELETE" });
            setTechnicians((current) => current.filter((item) => item.id !== technicianRecord.id));
            setTechnicianAdminMessage(`${technicianRecord.name} was removed from the technician list.`);
        } catch (removeError) {
            setTechnicianAdminError(removeError.message);
        }
    }

    async function saveTechnicianEmail(technicianRecord) {
        setTechnicianAdminError("");
        setTechnicianAdminMessage("");
        try {
            const updated = await apiRequest(`/technicians/${technicianRecord.id}`, {
                method: "PATCH",
                body: JSON.stringify({ email: technicianEmailDraft }),
            });
            setTechnicians((current) => current.map((item) => item.id === updated.id ? updated : item));
            setEditingTechnicianId(null);
            setTechnicianEmailDraft("");
            setTechnicianAdminMessage(`${updated.name}'s email was saved.`);
        } catch (saveError) {
            setTechnicianAdminError(saveError.message);
        }
    }

    async function changeStaffStatus(member) {
        setStaffAdminError("");
        setStaffAdminMessage("");
        try {
            const updated = await apiRequest(`/auth/staff/${member.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ active: !member.active }),
            });
            setStaffMembers((current) => current.map((item) => item.id === updated.id ? updated : item));
            setStaffAdminMessage(`${updated.name}'s account is ${updated.active ? "active" : "deactivated"}${updated.active ? "." : "; their sessions were revoked."}`);
        } catch (updateError) {
            setStaffAdminError(updateError.message);
        }
    }

    async function resetStaffPassword(member) {
        const password = staffPasswordDrafts[member.id] || "";
        if (password.length < 8) {
            setStaffAdminError("Enter a temporary password with at least 8 characters.");
            return;
        }
        setStaffAdminError("");
        setStaffAdminMessage("");
        try {
            await apiRequest(`/auth/staff/${member.id}/password`, {
                method: "PATCH",
                body: JSON.stringify({ password }),
            });
            setStaffPasswordDrafts((current) => ({ ...current, [member.id]: "" }));
            setResetPasswordStaff(null);
            setStaffAdminMessage(`${member.name}'s password was changed and their sessions were revoked.`);
            if (member.id === currentStaff.id) await signOut();
        } catch (resetError) {
            setStaffAdminError(resetError.message);
        }
    }

    async function revokeStaffSessions(member) {
        setStaffAdminError("");
        setStaffAdminMessage("");
        try {
            const result = await apiRequest(`/auth/staff/${member.id}/sessions`, { method: "DELETE" });
            setStaffAdminMessage(`Revoked ${result.revokedSessions} session(s) for ${member.name}.`);
            if (member.id === currentStaff.id) await signOut();
        } catch (revokeError) {
            setStaffAdminError(revokeError.message);
        }
    }

    function openEntityForm(record = null) {
        setEditingEntity(record);
        setEntityError("");
        if (activePage === "employees") {
            setEntityDraft({ name: record?.name || "", email: record?.email || "", department: record?.department || "", assetTag: "", type: "", status: "Available", employeeId: "", createAccount: false, password: "" });
        } else {
            setEntityDraft({ name: record?.name || "", email: "", department: "", assetTag: record?.assetTag || "", type: record?.type || "", status: record?.status || "Available", employeeId: record?.employeeId ? String(record.employeeId) : "" });
        }
        setEntityModalOpen(true);
    }

    async function saveEntity(event) {
        event.preventDefault();
        setEntityError("");
        const isEmployee = activePage === "employees";
        const resource = isEmployee ? "employees" : "devices";
        const body = isEmployee
            ? { name: entityDraft.name, email: entityDraft.email, department: entityDraft.department, ...(!editingEntity && entityDraft.createAccount ? { password: entityDraft.password } : {}) }
            : { assetTag: entityDraft.assetTag, name: entityDraft.name, type: entityDraft.type, status: entityDraft.status, employeeId: entityDraft.employeeId ? Number(entityDraft.employeeId) : null };
        try {
            const saved = await apiRequest(`/${resource}${editingEntity ? `/${editingEntity.id}` : ""}`, {
                method: editingEntity ? "PUT" : "POST",
                body: JSON.stringify(body),
            });
            if (isEmployee) {
                setEmployees((current) => editingEntity
                    ? current.map((item) => item.id === saved.id ? saved : item)
                    : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
            } else {
                setDevices((current) => editingEntity
                    ? current.map((item) => item.id === saved.id ? saved : item)
                    : [saved, ...current]);
            }
            setEntityModalOpen(false);
            setEditingEntity(null);
        } catch (saveError) {
            setEntityError(saveError.message);
        }
    }

    async function deleteEntity(resource, record) {
        try {
            await apiRequest(`/${resource}/${record.id}`, { method: "DELETE" });
            if (resource === "employees") {
                setEmployees((current) => current.filter((item) => item.id !== record.id));
                setDevices((current) => current.map((item) => item.employeeId === record.id ? { ...item, employeeId: null, employeeName: "" } : item));
            } else {
                setDevices((current) => current.filter((item) => item.id !== record.id));
            }
            setEntityError("");
        } catch (deleteError) {
            setEntityError(`Could not delete ${resource === "employees" ? "employee" : "device"}: ${deleteError.message}`);
        }
    }

    async function addTicket(event) {
        event.preventDefault();
        const cleanEmployee = employee.trim();
        const cleanIssue = issue.trim();
        if (!cleanEmployee || !cleanIssue) {
            setError("Enter an employee name and issue description.");
            return;
        }
        if (!PRIORITIES.includes(priority)) {
            setError("Select a valid ticket priority.");
            return;
        }
        try {
            const ticket = await apiRequest("/tickets", {
                method: "POST",
                body: JSON.stringify({
                    employee: cleanEmployee,
                    issue: cleanIssue,
                    status: "Pending",
                    priority,
                    technician: technician.trim(),
                    dueDate,
                    by: staffName.trim() || "IT Support Staff",
                }),
            });
            setTickets((current) => [ticket, ...current]);
            setEmployee("");
            setIssue("");
            setPriority("Medium");
            setTechnician("");
            setDueDate("");
            setShowTicketModal(false);
            setError("");
        } catch (saveError) {
            setError(`Could not create ticket: ${saveError.message}`);
        }
    }

    async function saveEditedTicket(event) {
        event.preventDefault();
        const cleanEmployee = editingTicket.employee.trim();
        const cleanIssue = editingTicket.issue.trim();
        if (!cleanEmployee || !cleanIssue || !PRIORITIES.includes(editingTicket.priority)) return;

        try {
            const updated = await apiRequest(`/tickets/${editingTicket.id}`, {
                method: "PUT",
                body: JSON.stringify({ ...editingTicket, employee: cleanEmployee, issue: cleanIssue, technician: editingTicket.technician.trim() }),
            });
            setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket));
            setEditingTicket(null);
            setError("");
        } catch (saveError) {
            setError(`Could not update ticket: ${saveError.message}`);
        }
    }

    async function updateStatus(id, status) {
        try {
            const updated = await apiRequest(`/tickets/${id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status, by: staffName.trim() || "IT Support Staff" }),
            });
            setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket));
        } catch (saveError) {
            setError(`Could not update status: ${saveError.message}`);
        }
    }

    async function assignTicket(id, assignedTechnician) {
        if (!assignedTechnician) return;
        try {
            const updated = await apiRequest(`/tickets/${id}`, {
                method: "PUT",
                body: JSON.stringify({ technician: assignedTechnician }),
            });
            setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket));
            setError("");
            setAssigningTicketId(null);
            setAssignmentDraft("");
        } catch (assignError) {
            setError(`Could not assign ticket: ${assignError.message}`);
        }
    }

    async function addComment(event, ticketId) {
        event.preventDefault();
        const text = commentDraft.trim();
        if (!text) return;
        const by = staffName.trim() || "IT Support Staff";
        try {
            const updated = await apiRequest(`/tickets/${ticketId}/comments`, {
                method: "POST",
                body: JSON.stringify({ text, by }),
            });
            setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket));
            setCommentDraft("");
        } catch (saveError) {
            setError(`Could not post comment: ${saveError.message}`);
        }
    }

    async function addAttachments(event, ticketId) {
        const input = event.currentTarget;
        const selectedFiles = Array.from(input.files || []);
        input.value = "";
        setAttachmentError("");
        if (!selectedFiles.length) return;
        const existingBytes = tickets.reduce((total, ticket) => total + (ticket.attachments || []).reduce((sum, file) => sum + (file.size || 0), 0), 0);
        let selectedBytes = 0;
        const validFiles = selectedFiles.filter((file) => {
            if (file.size > 1024 * 1024 || existingBytes + selectedBytes + file.size > 3 * 1024 * 1024) return false;
            selectedBytes += file.size;
            return true;
        });
        if (validFiles.length < selectedFiles.length) {
            setAttachmentError("Each attachment must be 1 MB or smaller, and browser storage is limited to 3 MB of attachments.");
        }
        try {
            const filesWithData = await Promise.all(validFiles.map(async (file) => ({
                name: file.name,
                type: file.type || "application/octet-stream",
                size: file.size,
                dataUrl: await readFileAsDataUrl(file),
            })));
            if (!filesWithData.length) return;
            const updated = await apiRequest(`/tickets/${ticketId}/attachments`, {
                method: "POST",
                body: JSON.stringify({ attachments: filesWithData, by: staffName.trim() || "IT Support Staff" }),
            });
            setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket));
        } catch (readError) {
            setAttachmentError(readError.message);
        }
    }

    async function deleteTicket(id) {
        try {
            await apiRequest(`/tickets/${id}`, { method: "DELETE" });
            setTickets((current) => current.filter((ticket) => ticket.id !== id));
            setError("");
        } catch (deleteError) {
            setError(`Could not delete ticket: ${deleteError.message}`);
        }
    }

    if (!authReady) {
        return <main className="auth-page"><p>Connecting to the support system…</p></main>;
    }

    if (!currentStaff) {
        return (
            <main className="auth-page">
                <form className="auth-card" onSubmit={submitAuth}>
                    <p className="auth-eyebrow">IT SUPPORT</p>
                    <h1>{setupRequired ? "Create administrator account" : "Staff sign in"}</h1>
                    <p className="auth-description">
                        {setupRequired
                            ? "Set up the first administrator account to manage the tracker and create staff accounts."
                            : "Sign in with your staff account to access support tickets."}
                    </p>
                    {setupRequired && (
                        <label>Full name<input autoComplete="name" required value={authName} onChange={(event) => setAuthName(event.target.value)} /></label>
                    )}
                    <label>Email<input type="email" autoComplete="username" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>
                    <label>Password<input type="password" autoComplete={setupRequired ? "new-password" : "current-password"} minLength="8" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
                    {authError && <p className="form-error" role="alert">{authError}</p>}
                    <button className="submit-button auth-submit" type="submit">{setupRequired ? "Create admin account" : "Sign in"}</button>
                </form>
            </main>
        );
    }

    return (
        <div className={`dashboard${sidebarCollapsed ? " dashboard-sidebar-collapsed" : ""}`}>
            <Sidebar
                activePage={activePage}
                onNavigate={navigateTo}
                staff={currentStaff}
                onSignOut={signOut}
                onProfileUpdated={setCurrentStaff}
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
            />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <p className="page-eyebrow">IT SUPPORT / {activePage.toUpperCase()}</p>
                        <h1>{activePage === "dashboard" ? "Dashboard" : activePage === "tickets" ? "Tickets" : activePage === "settings" ? "Settings" : activePage[0].toUpperCase() + activePage.slice(1)}</h1>
                        <p>{activePage === "dashboard" ? "A clear view of your support workload." : activePage === "tickets" ? "Search, filter, and manage support requests." : activePage === "settings" ? "Manage staff access and account security." : activePage === "employees" ? "Manage employee directory and device assignments." : activePage === "devices" ? "Track company devices and assigned employees." : "Review support workload and ticket trends."}</p>
                    </div>
                    <div className="header-actions">
                        {activePage === "employees" && <button className="primary-button" type="button" onClick={() => openEntityForm()}>+ Add Employee</button>}
                        {activePage === "devices" && <button className="primary-button" type="button" onClick={() => openEntityForm()}>+ Add Device</button>}
                        {activePage === "tickets" && <button className="primary-button" type="button" onClick={() => { setError(""); setShowTicketModal(true); }}>＋ New Ticket</button>}
                        {activePage === "settings" && currentStaff.role === "admin" && <button className="primary-button" type="button" onClick={() => { setStaffAdminError(""); setShowStaffModal(true); }}>＋ Add Staff</button>}
                    </div>
                </header>

                {error && <p className="page-notice" role="alert">{error}</p>}
                {entityError && !entityModalOpen && <p className="page-notice" role="alert">{entityError}</p>}

                {activePage === "dashboard" && <>
                    <section className="metric-grid metric-grid-primary" aria-label="Primary ticket statistics">
                        <TicketCard title="Total Tickets" number={tickets.length} tone="purple" />
                        <TicketCard title="Pending" number={countFor("Pending")} tone="amber" />
                        <TicketCard title="In Progress" number={countFor("In Progress")} tone="blue" />
                        <TicketCard title="Resolved" number={countFor("Resolved")} tone="green" />
                    </section>
                    <section className="metric-grid metric-grid-secondary" aria-label="Additional ticket statistics">
                        <TicketCard title="Resolution Rate" number={`${resolutionRate}%`} tone="green" compact />
                        <TicketCard title="Overdue" number={overdueCount} tone="red" compact />
                        <TicketCard title="High Priority" number={tickets.filter((ticket) => ticket.priority === "High").length} tone="purple" compact />
                        <TicketCard title="Unassigned" number={unassignedTickets.length} tone="amber" compact />
                    </section>

                <section className="analytics-section" aria-label="Ticket status analytics">
                    <div className="section-heading">
                        <div><h2>Ticket status</h2><p>Current share of all tickets</p></div>
                        <span>{tickets.length} total</span>
                    </div>
                    <div className="status-chart">
                        {[{ label: "Pending", count: pendingCount, percent: pendingPercent, tone: "amber" }, { label: "In Progress", count: inProgressCount, percent: inProgressPercent, tone: "blue" }, { label: "Resolved", count: resolvedCount, percent: resolvedPercent, tone: "green" }].map((item) => (
                            <div className="status-chart-row" key={item.label}>
                                <span>{item.label}</span>
                                <div className="chart-track"><div className={`chart-bar chart-bar-${item.tone}`} style={{ width: `${item.percent}%` }} /></div>
                                <strong>{item.count}</strong>
                                <small>{item.percent}%</small>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="analytics-grid" aria-label="Ticket analytics">
                    <article className="analytics-card">
                        <div className="analytics-heading">
                            <div>
                                <h2>Tickets by priority</h2>
                                <p>Priority mix</p>
                            </div>
                        </div>
                        <div className="chart-rows">
                            {priorityCounts.map(({ level, count }) => (
                                <div className="chart-row" key={level}>
                                    <span className={`chart-label priority-text-${level.toLowerCase()}`}>{level}</span>
                                    <div className="chart-track" role="img" aria-label={`${level}: ${count} tickets`}>
                                        <div className={`chart-bar chart-bar-priority-${level.toLowerCase()}`} style={{ width: `${(count / maxPriorityCount) * 100}%` }} />
                                    </div>
                                    <strong>{count}</strong>
                                </div>
                            ))}
                        </div>
                    </article>
                </section>
                <section className="attention-grid" aria-label="Tickets requiring attention">
                    {[
                        { title: "Overdue", description: "Past the due date", tickets: overdueTickets, tone: "red" },
                        { title: "High priority", description: "Urgent, unresolved work", tickets: highPriorityTickets, tone: "purple" },
                        { title: "Unassigned", description: "Needs a technician", tickets: unassignedTickets, tone: "amber" },
                    ].map((group) => (
                        <article className="attention-card" key={group.title}>
                            <div className="attention-heading">
                                <div><h2>{group.title}</h2><p>{group.description}</p></div>
                                <strong className={`attention-count attention-count-${group.tone}`}>{group.tickets.length}</strong>
                            </div>
                            {group.tickets.length ? (
                                <ul className="attention-list">
                                    {group.tickets.slice(0, 4).map((ticket) => (
                                        <li key={ticket.id}>
                                            <button type="button" onClick={() => setDetailsTicketId(ticket.id)}>
                                                <span className="attention-ticket-id">#{ticket.id}</span>
                                                <span className="attention-ticket-copy"><strong>{ticket.issue}</strong><small>{ticket.employee}</small></span>
                                                <span className="attention-arrow">›</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="attention-empty">Nothing needs attention.</p>}
                        </article>
                    ))}
                </section>
                </>}

                {activePage === "settings" && currentStaff.role === "admin" && (
                    <section className="staff-admin-panel" aria-labelledby="staff-admin-title">
                        <div className="staff-admin-heading">
                            <div>
                                <h2 id="staff-admin-title">Staff accounts</h2>
                                <p>Manage staff access and account security.</p>
                            </div>
                            <span>{staffMembers.length} accounts</span>
                        </div>
                        {staffAdminError && <p className="form-error" role="alert">{staffAdminError}</p>}
                        {staffAdminMessage && <p className="staff-admin-message" role="status">{staffAdminMessage}</p>}
                        <div className="table-wrapper">
                            <table className="data-table staff-table">
                                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {staffMembers.map((member) => (
                                        <tr key={member.id}>
                                            <td><strong>{member.name}</strong>{member.id === currentStaff.id && <small className="you-label">You</small>}</td>
                                            <td>{member.email}</td>
                                            <td><span className="staff-role">{member.role}</span></td>
                                            <td><span className={`staff-state ${member.active ? "staff-state-active" : "staff-state-inactive"}`}>{member.active ? "Active" : "Inactive"}</span></td>
                                            <td>
                                                <div className="action-menu">
                                                    <button className="action-menu-trigger" type="button" aria-label={`Actions for ${member.name}`} aria-expanded={openActionId === `staff-${member.id}`} onClick={() => setOpenActionId(openActionId === `staff-${member.id}` ? null : `staff-${member.id}`)}>⋯</button>
                                                    {openActionId === `staff-${member.id}` && <div className="action-menu-popover">
                                                        <button type="button" onClick={() => { setOpenActionId(null); setResetPasswordStaff(member); }}>Reset password</button>
                                                        <button type="button" onClick={() => askToConfirm({ title: "Revoke sessions?", message: `Sign ${member.name} out of all active sessions?`, confirmLabel: "Revoke sessions", action: () => revokeStaffSessions(member) })}>Revoke sessions</button>
                                                        <button type="button" disabled={member.id === currentStaff.id && member.active} onClick={() => askToConfirm({ title: `${member.active ? "Deactivate" : "Activate"} account?`, message: member.active ? `Deactivate ${member.name}? They will be signed out and cannot sign in until reactivated.` : `Reactivate ${member.name}'s account?`, confirmLabel: member.active ? "Deactivate account" : "Activate account", action: () => changeStaffStatus(member) })}>{member.active ? "Deactivate account" : "Activate account"}</button>
                                                    </div>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activePage === "settings" && currentStaff.role === "admin" && <section className="staff-admin-panel technician-admin-panel" aria-labelledby="technician-admin-title">
                    <div className="staff-admin-heading">
                        <div><h2 id="technician-admin-title">Technician list</h2><p>Manage the names available when assigning tickets.</p></div>
                        <span>{technicians.length} technicians</span>
                    </div>
                    {technicianAdminError && <p className="form-error" role="alert">{technicianAdminError}</p>}
                    {technicianAdminMessage && <p className="staff-admin-message" role="status">{technicianAdminMessage}</p>}
                    <form className="technician-add-form" onSubmit={addTechnician}>
                        <label htmlFor="new-technician-name">Technician name</label>
                        <input id="new-technician-name" required minLength="2" value={newTechnicianName} onChange={(event) => setNewTechnicianName(event.target.value)} placeholder="e.g. Alex Tan" />
                        <label htmlFor="new-technician-email">Email</label>
                        <input id="new-technician-email" type="email" required value={newTechnicianEmail} onChange={(event) => setNewTechnicianEmail(event.target.value)} placeholder="alex@example.com" />
                        <button className="primary-button" type="submit">Add technician</button>
                    </form>
                    <div className="table-wrapper"><table className="data-table staff-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
                        <tbody>{technicians.length ? technicians.map((item) => <tr key={item.id}>
                            <td><strong>{item.name}</strong></td>
                            <td>{editingTechnicianId === item.id ? <form className="technician-email-form" onSubmit={(event) => { event.preventDefault(); saveTechnicianEmail(item); }}><input type="email" required aria-label={`Email for ${item.name}`} value={technicianEmailDraft} onChange={(event) => setTechnicianEmailDraft(event.target.value)} /><button className="text-button" type="submit">Save</button><button className="text-button" type="button" onClick={() => setEditingTechnicianId(null)}>Cancel</button></form> : item.email || "—"}</td>
                            <td><div className="entity-row-actions">{editingTechnicianId !== item.id && <button className="text-button" type="button" onClick={() => { setEditingTechnicianId(item.id); setTechnicianEmailDraft(item.email || ""); }}>Edit email</button>}<button className="text-button entity-delete" type="button" onClick={() => askToConfirm({ title: "Remove technician?", message: `Remove ${item.name} from the technician list? Existing ticket assignments will stay unchanged.`, confirmLabel: "Remove technician", action: () => removeTechnician(item) })}>Remove</button></div></td>
                        </tr>) : <tr><td className="empty-state" colSpan="3">No technicians listed yet.</td></tr>}</tbody>
                    </table></div>
                </section>}

                {activePage === "settings" && currentStaff.role !== "admin" && <section className="surface-card empty-page"><h2>Administrator access required</h2><p>Only administrators can manage staff accounts.</p></section>}

                {activePage === "reports" && <div className="reports-page">
                    <div className="reports-heading">
                        <div><h2>Ticket reports</h2><p>Graphs and files from tickets stored in the backend.</p></div>
                        <button className="primary-button" type="button" onClick={downloadTicketReport} disabled={!tickets.length}>Download ticket CSV</button>
                    </div>
                    <section className="report-summary-grid" aria-label="Ticket report totals">
                        <article><span>Resolved this month</span><strong>{reportResolvedThisMonth}</strong></article>
                        <article><span>Average resolution</span><strong>{formatResolutionTime(averageResolutionMs)}</strong><small>{resolvedWithTimes.length} dated tickets</small></article>
                        <article><span>Technicians</span><strong>{technicians.length}</strong></article>
                        <article><span>Stored files</span><strong>{storedAttachments.length}</strong></article>
                    </section>
                    <section className="report-chart-grid" aria-label="Ticket graphs">
                        <article className="report-chart-card">
                            <div className="section-heading"><div><h2>Tickets resolved per month</h2><p>Last 12 months, based on recorded ticket status history</p></div></div>
                            <div className="report-trend-scroll"><div className="report-trend-chart" role="img" aria-label="Tickets resolved per month for the last 12 months">
                                {reportResolvedByMonth.map((bucket) => <div className="report-trend-column" key={bucket.key} title={`${bucket.label}: ${bucket.count} resolved ticket${bucket.count === 1 ? "" : "s"}`}>
                                    <strong>{bucket.count || ""}</strong><div className="report-trend-bar" style={{ height: `${bucket.count ? Math.max(6, (bucket.count / reportMaxResolvedMonth) * 100) : 0}%` }} /><span>{bucket.label}</span>
                                </div>)}
                            </div></div>
                        </article>
                        <article className="report-chart-card">
                            <div className="section-heading"><div><h2>Tickets by priority</h2><p>All tickets in backend storage</p></div></div>
                            <div className="report-bar-list">{reportPriorityCounts.map((item) => <div className="report-bar-row" key={item.label}><span>{item.label}</span><div className="chart-track"><div className={`report-bar report-bar-priority-${item.label.toLowerCase()}`} style={{ width: `${(item.count / reportMaxPriority) * 100}%` }} /></div><strong>{item.count}</strong></div>)}</div>
                        </article>
                        <article className="report-chart-card report-chart-wide">
                            <div className="section-heading"><div><h2>Technician performance</h2><p>Resolved tickets, average resolution time, and open workload</p></div></div>
                            {reportTechnicianPerformance.some((item) => item.resolved || item.open) ? <div className="report-performance-scroll"><div className="report-performance-table"><div className="report-performance-header"><span>Technician</span><span>Resolved</span><span>Average time</span><span>Open</span></div>
                                {reportTechnicianPerformance.map((item) => <div className="report-performance-row" key={item.name}>
                                    <strong>{item.name}</strong><div className="report-performance-resolved"><div className="chart-track"><div className="report-bar report-bar-technician" style={{ width: `${(item.resolved / reportMaxTechnicianResolved) * 100}%` }} /></div><span>{item.resolved}</span></div><span>{formatResolutionTime(item.averageMs)}</span><span>{item.open}</span>
                                </div>)}
                            </div></div> : <p className="muted-message">No technician tickets to report yet.</p>}
                        </article>
                    </section>
                    <section className="staff-admin-panel report-files-panel" aria-labelledby="report-files-title">
                        <div className="staff-admin-heading"><div><h2 id="report-files-title">Ticket files</h2><p>Files attached to tickets in backend storage.</p></div><span>{storedAttachments.length} files</span></div>
                        <div className="table-wrapper"><table className="data-table report-files-table">
                            <thead><tr><th>File</th><th>Ticket</th><th>Employee</th><th>Added by</th><th>Uploaded</th><th>Download</th></tr></thead>
                            <tbody>{storedAttachments.length ? storedAttachments.map((file) => <tr key={`${file.ticketId}-${file.id}`}>
                                <td><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(0)} KB</small></td>
                                <td>#{file.ticketId}</td><td>{file.employee}</td><td>{file.by || "—"}</td><td>{file.at ? new Date(file.at).toLocaleString() : "—"}</td>
                                <td><a className="report-download-link" href={file.dataUrl} download={file.name}>Download</a></td>
                            </tr>) : <tr><td className="empty-state" colSpan="6">No files have been attached to tickets.</td></tr>}</tbody>
                        </table></div>
                    </section>
                </div>}
                {activePage === "employees" && <section className="staff-admin-panel entity-panel">
                    <div className="staff-admin-heading"><div><h2>Employee directory</h2><p>People who use the IT support system and company devices.</p></div><span>{employees.length} employees</span></div>
                    <div className="table-wrapper"><table className="data-table entity-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Devices</th><th>Actions</th></tr></thead>
                        <tbody>{entitiesLoading ? <tr><td className="empty-state" colSpan="5">Loading employees...</td></tr> : employees.length === 0 ? <tr><td className="empty-state" colSpan="5">No employees yet. Add an employee to get started.</td></tr> : employees.map((person) => (
                            <tr key={person.id}>
                                <td><strong>{person.name}</strong>{person.hasAccount && <span className="employee-account-badge">Account</span>}</td><td>{person.email || "—"}</td><td>{person.department || "—"}</td>
                                <td>{devices.filter((device) => device.employeeId === person.id).length}</td>
                                <td><div className="entity-row-actions"><button className="secondary-button" type="button" onClick={() => openEntityForm(person)}>Edit</button><button className="text-button entity-delete" type="button" onClick={() => askToConfirm({ title: "Delete employee?", message: `Delete ${person.name}? Their device records will remain and become unassigned.`, confirmLabel: "Delete employee", action: () => deleteEntity("employees", person) })}>Delete</button></div></td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                </section>}
                {activePage === "devices" && <section className="staff-admin-panel entity-panel">
                    <div className="staff-admin-heading"><div><h2>Device inventory</h2><p>Track assets, condition, and employee assignments.</p></div><span>{devices.length} devices</span></div>
                    <div className="table-wrapper"><table className="data-table entity-table">
                        <thead><tr><th>Asset tag</th><th>Device</th><th>Type</th><th>Assigned employee</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{entitiesLoading ? <tr><td className="empty-state" colSpan="6">Loading devices...</td></tr> : devices.length === 0 ? <tr><td className="empty-state" colSpan="6">No devices yet. Add a device to get started.</td></tr> : devices.map((device) => (
                            <tr key={device.id}>
                                <td>#{device.assetTag}</td><td><strong>{device.name}</strong></td><td>{device.type || "—"}</td><td>{device.employeeName || "Unassigned"}</td>
                                <td><span className={`device-status device-status-${device.status.toLowerCase().replaceAll(" ", "-")}`}>{device.status}</span></td>
                                <td><div className="entity-row-actions"><button className="secondary-button" type="button" onClick={() => openEntityForm(device)}>Edit</button><button className="text-button entity-delete" type="button" onClick={() => askToConfirm({ title: "Delete device?", message: `Remove ${device.assetTag} (${device.name}) from the device inventory?`, confirmLabel: "Delete device", action: () => deleteEntity("devices", device) })}>Delete</button></div></td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                </section>}

                {activePage === "tickets" && <section className="ticket-section" id="tickets">
                    <div className="section-heading">
                        <div><h2>All tickets</h2><p>Manage support requests and assignments.</p></div>
                        <span>{matchingTickets.length} of {tickets.length}</span>
                    </div>

                    <div className="ticket-filters">
                        <label>
                            Search
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }}
                                placeholder="ID, employee, or issue"
                            />
                        </label>
                        <label>
                            Filter by status
                            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }}>
                                <option value="All">All statuses</option>
                                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </label>
                        <label>
                            Filter by priority
                            <select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setCurrentPage(1); }}>
                                <option value="All">All priorities</option>
                                {PRIORITIES.map((level) => <option key={level} value={level}>{level}</option>)}
                            </select>
                        </label>
                        <label>
                            Technician
                            <select value={filterTechnician} onChange={(event) => { setFilterTechnician(event.target.value); setCurrentPage(1); }}>
                                <option value="All">All technicians</option>
                                <option value="Unassigned">Unassigned</option>
                                {ticketTechnicianOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </label>
                        <button className="text-button clear-filters-button" type="button" onClick={clearFilters}>Clear filters</button>
                    </div>

                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr><th>Ticket ID</th><th>Employee</th><th>Issue</th><th>Priority</th><th>Assigned technician</th><th>Due Date</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {pageTickets.length === 0 ? (
                                    <tr><td className="empty-state" colSpan="8">
                                        {loading
                                            ? "Loading tickets from the backend..."
                                            : tickets.length === 0
                                            ? "No tickets yet. Submit a ticket to get started."
                                            : "No tickets match your search and filters."}
                                    </td></tr>
                                ) : pageTickets.map((ticket) => (
                                    <tr key={ticket.id}>
                                        <td>#{ticket.id}</td>
                                        <td>{ticket.employee}</td>
                                        <td>{ticket.issue}</td>
                                        <td><span className={`priority-badge priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></td>
                                        <td>{ticket.technician || <span className="unassigned-cell">Unassigned<button className="assign-inline-button" type="button" disabled={!technicians.length} title={technicians.length ? "Assign this ticket" : "Add technicians in Settings first"} onClick={() => { setDetailsTicketId(ticket.id); setAssignmentDraft(technicians[0]?.name || ""); setAssigningTicketId(ticket.id); }}>Assign</button></span>}</td>
                                        <td>
                                            {ticket.dueDate || "—"}
                                            {ticket.status !== "Resolved" && ticket.dueDate && ticket.dueDate < getLocalDate() && <span className="overdue-badge">Overdue</span>}
                                        </td>
                                        <td>
                                            <select className={`status-select status-${ticket.status.toLowerCase().replaceAll(" ", "-")}`} aria-label={`Status for ticket ${ticket.id}`} value={ticket.status} onChange={(event) => updateStatus(ticket.id, event.target.value)}>
                                                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <div className="action-menu">
                                                <button className="action-menu-trigger" type="button" aria-label={`Actions for ticket ${ticket.id}`} aria-expanded={openActionId === `ticket-${ticket.id}`} onClick={() => setOpenActionId(openActionId === `ticket-${ticket.id}` ? null : `ticket-${ticket.id}`)}>⋯</button>
                                                {openActionId === `ticket-${ticket.id}` && <div className="action-menu-popover">
                                                    <button type="button" onClick={() => { setOpenActionId(null); setDetailsTicketId(ticket.id); setCommentDraft(""); setAttachmentError(""); }}>View details</button>
                                                    <button type="button" onClick={() => { setOpenActionId(null); setEditingTicket({ ...ticket }); }}>Edit ticket</button>
                                                    <button className="menu-danger" type="button" onClick={() => askToConfirm({ title: "Delete ticket?", message: `Delete ticket #${ticket.id} for ${ticket.employee}? This cannot be undone.`, confirmLabel: "Delete ticket", action: () => deleteTicket(ticket.id) })}>Delete ticket</button>
                                                </div>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="pagination-bar">
                        <span>{matchingTickets.length ? `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, matchingTickets.length)} of ${matchingTickets.length}` : "Showing 0 tickets"}</span>
                        <div className="pagination-actions">
                            <button className="secondary-button" type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</button>
                            <span>Page {safePage} of {pageCount}</span>
                            <button className="secondary-button" type="button" disabled={safePage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>Next</button>
                        </div>
                    </div>
                </section>}

                {entityModalOpen && (
                    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEntityModalOpen(false)}>
                        <form className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="entity-form-title" onSubmit={saveEntity}>
                            <div className="modal-title-row"><div><p className="page-eyebrow">{activePage === "employees" ? "EMPLOYEE DIRECTORY" : "DEVICE INVENTORY"}</p><h2 id="entity-form-title">{editingEntity ? "Edit" : "Add"} {activePage === "employees" ? "employee" : "device"}</h2></div><button className="modal-close" type="button" onClick={() => setEntityModalOpen(false)} aria-label="Close">×</button></div>
                            {activePage === "employees" ? <>
                                <label>Full name<input required minLength="2" autoComplete="name" value={entityDraft.name} onChange={(event) => setEntityDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
                                <label>Email<input type="email" autoComplete="email" required={entityDraft.createAccount || Boolean(editingEntity?.hasAccount)} value={entityDraft.email} onChange={(event) => setEntityDraft((draft) => ({ ...draft, email: event.target.value }))} /></label>
                                <label>Department<input value={entityDraft.department} onChange={(event) => setEntityDraft((draft) => ({ ...draft, department: event.target.value }))} placeholder="e.g. Finance" /></label>
                                {!editingEntity && <label className="account-create-toggle"><input type="checkbox" checked={entityDraft.createAccount} onChange={(event) => setEntityDraft((draft) => ({ ...draft, createAccount: event.target.checked }))} /> Create an employee sign-in account</label>}
                                {!editingEntity && entityDraft.createAccount && <label>Initial password<input type="password" required minLength="8" autoComplete="new-password" value={entityDraft.password} onChange={(event) => setEntityDraft((draft) => ({ ...draft, password: event.target.value }))} /><small>At least 8 characters. The employee will sign in with the email above.</small></label>}
                            </> : <>
                                <label>Asset tag<input required minLength="2" value={entityDraft.assetTag} onChange={(event) => setEntityDraft((draft) => ({ ...draft, assetTag: event.target.value }))} placeholder="e.g. LAP-001" /></label>
                                <label>Device name<input required minLength="2" value={entityDraft.name} onChange={(event) => setEntityDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. ThinkPad X1" /></label>
                                <div className="modal-form-row">
                                    <label>Type<input value={entityDraft.type} onChange={(event) => setEntityDraft((draft) => ({ ...draft, type: event.target.value }))} placeholder="Laptop, monitor..." /></label>
                                    <label>Status<select value={entityDraft.status} onChange={(event) => setEntityDraft((draft) => ({ ...draft, status: event.target.value }))}><option>Available</option><option>In Use</option><option>Maintenance</option></select></label>
                                </div>
                                <label>Assigned employee<select value={entityDraft.employeeId} onChange={(event) => setEntityDraft((draft) => ({ ...draft, employeeId: event.target.value }))}><option value="">Unassigned</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                            </>}
                            {entityError && <p className="form-error" role="alert">{entityError}</p>}
                            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEntityModalOpen(false)}>Cancel</button><button type="submit" className="primary-button">{editingEntity ? "Save changes" : `Add ${activePage === "employees" ? "employee" : "device"}`}</button></div>
                        </form>
                    </div>
                )}

                {showTicketModal && (
                    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowTicketModal(false)}>
                        <form className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="new-ticket-title" onSubmit={addTicket}>
                            <div className="modal-title-row"><div><p className="page-eyebrow">TICKET MANAGEMENT</p><h2 id="new-ticket-title">Create new ticket</h2></div><button className="modal-close" type="button" onClick={() => setShowTicketModal(false)} aria-label="Close">×</button></div>
                            <label>Employee<input required value={employee} onChange={(event) => setEmployee(event.target.value)} placeholder="Employee name" /></label>
                            <label>Issue description<textarea required rows="4" value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Describe the issue" /></label>
                            <div className="modal-form-row">
                                <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}>{PRIORITIES.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                                <label>Assigned technician<select value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="">Unassigned</option>{technicianOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                            </div>
                            <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                            {error && <p className="form-error" role="alert">{error}</p>}
                            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowTicketModal(false)}>Cancel</button><button type="submit" className="primary-button">Create ticket</button></div>
                        </form>
                    </div>
                )}

                {showStaffModal && (
                    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowStaffModal(false)}>
                        <form className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="new-staff-title" onSubmit={addStaffMember}>
                            <div className="modal-title-row"><div><p className="page-eyebrow">USER MANAGEMENT</p><h2 id="new-staff-title">Add staff account</h2></div><button className="modal-close" type="button" onClick={() => setShowStaffModal(false)} aria-label="Close">×</button></div>
                            <p className="modal-description">The new staff member can sign in with these credentials.</p>
                            <label>Name<input required minLength="2" autoComplete="name" value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} /></label>
                            <label>Email<input type="email" required autoComplete="email" value={newStaffEmail} onChange={(event) => setNewStaffEmail(event.target.value)} /></label>
                            <label>Temporary password<input type="password" required minLength="8" autoComplete="new-password" value={newStaffPassword} onChange={(event) => setNewStaffPassword(event.target.value)} /></label>
                            {staffAdminError && <p className="form-error" role="alert">{staffAdminError}</p>}
                            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowStaffModal(false)}>Cancel</button><button type="submit" className="primary-button">Add staff</button></div>
                        </form>
                    </div>
                )}

                {resetPasswordStaff && (
                    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setResetPasswordStaff(null)}>
                        <form className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" onSubmit={(event) => { event.preventDefault(); resetStaffPassword(resetPasswordStaff); }}>
                            <div className="modal-title-row"><div><p className="page-eyebrow">USER MANAGEMENT</p><h2 id="reset-password-title">Reset password</h2></div><button className="modal-close" type="button" onClick={() => setResetPasswordStaff(null)} aria-label="Close">×</button></div>
                            <p className="modal-description">Set a temporary password for <strong>{resetPasswordStaff.name}</strong>. Their active sessions will be revoked.</p>
                            <label>New password<input type="password" autoComplete="new-password" minLength="8" required value={staffPasswordDrafts[resetPasswordStaff.id] || ""} onChange={(event) => setStaffPasswordDrafts((current) => ({ ...current, [resetPasswordStaff.id]: event.target.value }))} /></label>
                            {staffAdminError && <p className="form-error" role="alert">{staffAdminError}</p>}
                            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setResetPasswordStaff(null)}>Cancel</button><button type="submit" className="primary-button">Reset password</button></div>
                        </form>
                    </div>
                )}

                {confirmAction && (
                    <div className="modal-backdrop confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setConfirmAction(null)}>
                        <section className="ticket-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title">
                            <h2 id="confirm-action-title">{confirmAction.title}</h2>
                            <p className="modal-description">{confirmAction.message}</p>
                            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setConfirmAction(null)}>Cancel</button><button type="button" className={confirmAction.danger ? "danger-button" : "primary-button"} onClick={runConfirmedAction}>{confirmAction.confirmLabel}</button></div>
                        </section>
                    </div>
                )}

                {editingTicket && (
                    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingTicket(null)}>
                        <form className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="edit-ticket-title" onSubmit={saveEditedTicket}>
                            <h2 id="edit-ticket-title">Edit ticket #{editingTicket.id}</h2>
                            <label>Employee name<input required value={editingTicket.employee} onChange={(event) => setEditingTicket({ ...editingTicket, employee: event.target.value })} /></label>
                            <label>Issue description<textarea required rows="3" value={editingTicket.issue} onChange={(event) => setEditingTicket({ ...editingTicket, issue: event.target.value })} /></label>
                            <label>Priority<select value={editingTicket.priority} onChange={(event) => setEditingTicket({ ...editingTicket, priority: event.target.value })}>{PRIORITIES.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                            <label>Assigned technician<select value={editingTicket.technician} onChange={(event) => setEditingTicket({ ...editingTicket, technician: event.target.value })}><option value="">Unassigned</option>{[...new Set([...technicianOptions, editingTicket.technician].filter(Boolean))].sort().map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                            <label>Due date<input type="date" value={editingTicket.dueDate} onChange={(event) => setEditingTicket({ ...editingTicket, dueDate: event.target.value })} /></label>
                            <div className="modal-actions">
                                <button type="button" className="cancel-button" onClick={() => setEditingTicket(null)}>Cancel</button>
                                <button type="submit" className="submit-button">Save changes</button>
                            </div>
                        </form>
                    </div>
                )}

                {detailsTicket && (
                    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetailsTicketId(null)}>
                        <section className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-details-title">
                            <h2 id="ticket-details-title">Ticket #{detailsTicket.id}</h2>
                            <dl className="ticket-details-list">
                                <dt>Employee</dt><dd>{detailsTicket.employee}</dd>
                                <dt>Issue</dt><dd>{detailsTicket.issue}</dd>
                                <dt>Status</dt><dd>{detailsTicket.status}</dd>
                                <dt>Priority</dt><dd>{detailsTicket.priority}</dd>
                                <dt>Assigned technician</dt><dd className="ticket-assignee-detail">{detailsTicket.technician || "Unassigned"}{!detailsTicket.technician && (assigningTicketId === detailsTicket.id ? <><select aria-label="Select technician" value={assignmentDraft} onChange={(event) => setAssignmentDraft(event.target.value)}><option value="">Choose a technician</option>{technicians.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><button className="text-button assign-ticket-button" type="button" disabled={!assignmentDraft} onClick={() => assignTicket(detailsTicket.id, assignmentDraft)}>Assign</button><button className="text-button assign-ticket-button" type="button" onClick={() => setAssigningTicketId(null)}>Cancel</button></> : <button className="text-button assign-ticket-button" type="button" disabled={!technicians.length} onClick={() => { setAssignmentDraft(technicians[0]?.name || ""); setAssigningTicketId(detailsTicket.id); }}>{technicians.length ? "Assign" : "No technicians listed"}</button>)}</dd>
                                <dt>Due date</dt><dd>{detailsTicket.dueDate || "Not set"}</dd>
                                <dt>SLA</dt><dd>{detailsTicket.status !== "Resolved" && detailsTicket.dueDate && detailsTicket.dueDate < getLocalDate() ? <span className="overdue-badge">Overdue</span> : "On track"}</dd>
                            </dl>
                            <section className="detail-subsection">
                                <h3>Activity history</h3>
                                {detailsTicket.activity.length ? (
                                    <ul className="activity-list">
                                        {[...detailsTicket.activity].reverse().map((item) => (
                                            <li key={item.id}>
                                                <strong>{item.by}</strong> {item.text}
                                                <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="muted-message">No activity recorded yet.</p>}
                            </section>
                            <section className="detail-subsection">
                                <h3>Comments</h3>
                                {detailsTicket.comments.length ? (
                                    <ul className="comment-list">
                                        {[...detailsTicket.comments].reverse().map((comment) => (
                                            <li key={comment.id}>
                                                <p>{comment.text}</p>
                                                <small>{comment.by} · {new Date(comment.at).toLocaleString()}</small>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="muted-message">No comments yet.</p>}
                                <form className="comment-form" onSubmit={(event) => addComment(event, detailsTicket.id)}>
                                    <label htmlFor="ticket-comment">Add an update</label>
                                    <textarea id="ticket-comment" rows="3" value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Share a progress update" />
                                    <button type="submit" className="submit-button">Post comment</button>
                                </form>
                            </section>
                            <section className="detail-subsection">
                                <h3>Attachments</h3>
                                {detailsTicket.attachments.length ? (
                                    <ul className="attachment-list">
                                        {detailsTicket.attachments.map((file) => (
                                            <li key={file.id}>
                                                <a href={file.dataUrl} download={file.name}>{file.name}</a>
                                                <span>{(file.size / 1024).toFixed(0)} KB · {file.by}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="muted-message">No attachments yet.</p>}
                                <label className="upload-control">
                                    Attach screenshots or logs (up to 1 MB each)
                                    <input type="file" multiple accept="image/*,.log,.txt,.pdf" onChange={(event) => addAttachments(event, detailsTicket.id)} />
                                </label>
                                {attachmentError && <p className="form-error" role="alert">{attachmentError}</p>}
                            </section>
                            <div className="modal-actions">
                                <button type="button" className="cancel-button" onClick={() => setDetailsTicketId(null)}>Close</button>
                            </div>
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
