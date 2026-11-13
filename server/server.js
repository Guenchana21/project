const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));
const PORT = Number(process.env.PORT || 5000);
const STATUSES = ["Pending", "In Progress", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High"];
const DEVICE_STATUSES = ["Available", "In Use", "Maintenance"];
const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 7;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.db");
const LEGACY_FILE = path.join(DATA_DIR, "tickets.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
const database = new Database(DATA_FILE);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee TEXT NOT NULL,
        issue TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Resolved')),
        priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
        technician TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL DEFAULT '',
        activity_json TEXT NOT NULL DEFAULT '[]',
        comments_json TEXT NOT NULL DEFAULT '[]',
        attachments_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        avatar_data_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        department TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique_idx ON employees(email COLLATE NOCASE) WHERE email <> '';
    CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance')),
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status);
    CREATE INDEX IF NOT EXISTS tickets_due_date_idx ON tickets(due_date);
    CREATE INDEX IF NOT EXISTS devices_employee_idx ON devices(employee_id);
`);
if (!database.pragma("table_info(staff)").some((column) => column.name === "active")) {
    database.exec("ALTER TABLE staff ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))");
}
if (!database.pragma("table_info(staff)").some((column) => column.name === "employee_id")) {
    database.exec("ALTER TABLE staff ADD COLUMN employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE");
}
if (!database.pragma("table_info(staff)").some((column) => column.name === "avatar_data_url")) {
    database.exec("ALTER TABLE staff ADD COLUMN avatar_data_url TEXT NOT NULL DEFAULT ''");
}
database.exec("CREATE UNIQUE INDEX IF NOT EXISTS staff_employee_id_unique_idx ON staff(employee_id) WHERE employee_id IS NOT NULL");
if (!database.pragma("table_info(technicians)").some((column) => column.name === "email")) {
    database.exec("ALTER TABLE technicians ADD COLUMN email TEXT NOT NULL DEFAULT ''");
}
database.exec("CREATE UNIQUE INDEX IF NOT EXISTS technicians_email_unique_idx ON technicians(email COLLATE NOCASE) WHERE email <> ''");

const selectTickets = database.prepare("SELECT * FROM tickets ORDER BY id DESC");
const selectTicketById = database.prepare("SELECT * FROM tickets WHERE id = ?");
const insertTicket = database.prepare(`
    INSERT INTO tickets (id, employee, issue, status, priority, technician, due_date, activity_json, comments_json, attachments_json)
    VALUES (@id, @employee, @issue, @status, @priority, @technician, @due_date, @activity_json, @comments_json, @attachments_json)
`);
const insertNewTicket = database.prepare(`
    INSERT INTO tickets (employee, issue, status, priority, technician, due_date, activity_json, comments_json, attachments_json)
    VALUES (@employee, @issue, @status, @priority, @technician, @due_date, @activity_json, @comments_json, @attachments_json)
`);
const updateTicket = database.prepare(`
    UPDATE tickets SET
        employee = @employee,
        issue = @issue,
        status = @status,
        priority = @priority,
        technician = @technician,
        due_date = @due_date,
        activity_json = @activity_json,
        comments_json = @comments_json,
        attachments_json = @attachments_json
    WHERE id = @id
`);

function fromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        employee: row.employee,
        issue: row.issue,
        status: row.status,
        priority: row.priority,
        technician: row.technician,
        dueDate: row.due_date,
        activity: JSON.parse(row.activity_json),
        comments: JSON.parse(row.comments_json),
        attachments: JSON.parse(row.attachments_json),
    };
}

function toRow(ticket) {
    return {
        ...ticket,
        due_date: ticket.dueDate || "",
        activity_json: JSON.stringify(ticket.activity || []),
        comments_json: JSON.stringify(ticket.comments || []),
        attachments_json: JSON.stringify(ticket.attachments || []),
    };
}

function normalizeTicket(ticket) {
    return {
        ...ticket,
        employee: ticket.employee.trim(),
        issue: ticket.issue.trim(),
        technician: typeof ticket.technician === "string" ? ticket.technician.trim() : "",
        dueDate: typeof ticket.dueDate === "string" ? ticket.dueDate : "",
        activity: Array.isArray(ticket.activity) ? ticket.activity : [],
        comments: Array.isArray(ticket.comments) ? ticket.comments : [],
        attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    };
}

function validTicket(ticket) {
    return ticket && typeof ticket.employee === "string" && ticket.employee.trim() &&
        typeof ticket.issue === "string" && ticket.issue.trim() &&
        STATUSES.includes(ticket.status) && PRIORITIES.includes(ticket.priority);
}

async function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const derived = await scrypt(password, salt, 64);
    return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, savedHash) {
    const [salt, savedHex] = savedHash.split(":");
    const expected = Buffer.from(savedHex, "hex");
    const actual = await scrypt(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicStaff(staff, includeAvatar = false) {
    return {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.employee_id ? "employee" : staff.role,
        employeeId: staff.employee_id || null,
        active: Boolean(staff.active),
        ...(includeAvatar ? { avatar: staff.avatar_data_url || "" } : {}),
    };
}

function publicEmployee(row) {
    return row ? {
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        hasAccount: Boolean(row.has_account),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    } : null;
}

function publicDevice(row) {
    return row ? {
        id: row.id,
        assetTag: row.asset_tag,
        name: row.name,
        type: row.type,
        status: row.status,
        employeeId: row.employee_id,
        employeeName: row.employee_name || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    } : null;
}

const selectEmployees = database.prepare("SELECT employees.*, EXISTS(SELECT 1 FROM staff WHERE staff.employee_id = employees.id) AS has_account FROM employees ORDER BY name COLLATE NOCASE, id");
const selectEmployeeById = database.prepare("SELECT employees.*, EXISTS(SELECT 1 FROM staff WHERE staff.employee_id = employees.id) AS has_account FROM employees WHERE employees.id = ?");
const selectDevices = database.prepare(`
    SELECT devices.*, employees.name AS employee_name
    FROM devices LEFT JOIN employees ON employees.id = devices.employee_id
    ORDER BY devices.id DESC
`);
const selectDeviceById = database.prepare(`
    SELECT devices.*, employees.name AS employee_name
    FROM devices LEFT JOIN employees ON employees.id = devices.employee_id
    WHERE devices.id = ?
`);

function issueSession(staff) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    database.prepare("INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, staff.id, expiresAt);
    return { token, staff: publicStaff(staff, true), expiresAt };
}

function requireAuth(request, response, next) {
    const authorization = request.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return response.status(401).json({ error: "Sign in to continue." });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const row = database.prepare(`
        SELECT staff.id, staff.name, staff.email, staff.role, staff.active, staff.employee_id, staff.avatar_data_url, sessions.token_hash
        FROM sessions JOIN staff ON staff.id = sessions.staff_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND staff.active = 1
    `).get(tokenHash, new Date().toISOString());
    if (!row) return response.status(401).json({ error: "Your session expired. Please sign in again." });
    request.staff = publicStaff(row, true);
    request.sessionTokenHash = row.token_hash;
    return next();
}

function requireAdmin(request, response, next) {
    if (request.staff.role !== "admin") return response.status(403).json({ error: "Administrator access is required." });
    return next();
}

app.get("/api/auth/status", (_request, response) => {
    const staffCount = database.prepare("SELECT COUNT(*) AS count FROM staff").get().count;
    response.json({ setupRequired: staffCount === 0 });
});

app.post("/api/auth/bootstrap", async (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = request.body.password;
    if (database.prepare("SELECT COUNT(*) AS count FROM staff").get().count > 0) {
        return response.status(409).json({ error: "Initial administrator is already set up. Sign in instead." });
    }
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8) {
        return response.status(400).json({ error: "Enter a name, valid email, and password with at least 8 characters." });
    }
    const passwordHash = await hashPassword(password);
    const createFirstAdmin = database.transaction(() => {
        if (database.prepare("SELECT COUNT(*) AS count FROM staff").get().count > 0) return null;
        const result = database.prepare("INSERT INTO staff (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)")
            .run(name, email, passwordHash, new Date().toISOString());
        return database.prepare("SELECT * FROM staff WHERE id = ?").get(result.lastInsertRowid);
    });
    let staff;
    try {
        staff = createFirstAdmin();
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That email address is already registered." });
        throw error;
    }
    if (!staff) return response.status(409).json({ error: "Administrator setup has already completed." });
    return response.status(201).json(issueSession(staff));
});

app.post("/api/auth/login", async (request, response) => {
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = request.body.password;
    const staff = database.prepare("SELECT * FROM staff WHERE email = ? COLLATE NOCASE AND active = 1").get(email);
    if (!staff || typeof password !== "string" || !(await verifyPassword(password, staff.password_hash))) {
        return response.status(401).json({ error: "Email or password is incorrect." });
    }
    database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
    return response.json(issueSession(staff));
});

app.get("/api/auth/me", requireAuth, (request, response) => {
    response.json({ staff: request.staff });
});

app.patch("/api/auth/profile", requireAuth, (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const avatar = typeof request.body.avatar === "string" ? request.body.avatar : "";
    if (name.length < 2) return response.status(400).json({ error: "Name must have at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid email address." });
    if (avatar && (avatar.length > 1_400_000 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(avatar))) {
        return response.status(400).json({ error: "Profile pictures must be PNG, JPEG, WebP, or GIF images no larger than 1 MB." });
    }
    try {
        const updateProfile = database.transaction(() => {
            database.prepare("UPDATE staff SET name = ?, email = ?, avatar_data_url = ? WHERE id = ?")
                .run(name, email, avatar, request.staff.id);
            if (request.staff.employeeId) {
                database.prepare("UPDATE employees SET name = ?, email = ?, updated_at = ? WHERE id = ?")
                    .run(name, email, new Date().toISOString(), request.staff.employeeId);
            }
        });
        updateProfile();
        const staff = database.prepare("SELECT id, name, email, role, active, employee_id, avatar_data_url FROM staff WHERE id = ?").get(request.staff.id);
        return response.json({ staff: publicStaff(staff, true) });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That email address is already in use." });
        throw error;
    }
});

app.post("/api/auth/logout", requireAuth, (request, response) => {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(request.sessionTokenHash);
    return response.status(204).end();
});

app.get("/api/auth/staff", requireAuth, requireAdmin, (_request, response) => {
    const staff = database.prepare("SELECT id, name, email, role, employee_id, active, created_at AS createdAt FROM staff ORDER BY id").all()
        .map((member) => ({ ...publicStaff(member), createdAt: member.createdAt }));
    response.json(staff);
});

app.post("/api/auth/staff", requireAuth, requireAdmin, async (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = request.body.password;
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8) {
        return response.status(400).json({ error: "Enter a name, valid email, and password with at least 8 characters." });
    }
    const passwordHash = await hashPassword(password);
    try {
        const result = database.prepare("INSERT INTO staff (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'staff', ?)")
            .run(name, email, passwordHash, new Date().toISOString());
        const staff = database.prepare("SELECT id, name, email, role, active, created_at AS createdAt FROM staff WHERE id = ?").get(result.lastInsertRowid);
        staff.active = Boolean(staff.active);
        return response.status(201).json(staff);
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That email address is already registered." });
        throw error;
    }
});

app.patch("/api/auth/staff/:id/status", requireAuth, requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    const active = request.body.active;
    if (typeof active !== "boolean") return response.status(400).json({ error: "Active must be true or false." });
    if (id === request.staff.id && !active) return response.status(400).json({ error: "You cannot deactivate your own account." });
    const result = database.prepare("UPDATE staff SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
    if (!result.changes) return response.status(404).json({ error: "Staff account not found." });
    if (!active) database.prepare("DELETE FROM sessions WHERE staff_id = ?").run(id);
    const member = database.prepare("SELECT id, name, email, role, active, created_at AS createdAt FROM staff WHERE id = ?").get(id);
    return response.json({ ...member, active: Boolean(member.active) });
});

app.patch("/api/auth/staff/:id/password", requireAuth, requireAdmin, async (request, response) => {
    const id = Number(request.params.id);
    const { password } = request.body;
    if (typeof password !== "string" || password.length < 8) return response.status(400).json({ error: "Password must have at least 8 characters." });
    if (!database.prepare("SELECT id FROM staff WHERE id = ?").get(id)) return response.status(404).json({ error: "Staff account not found." });
    const passwordHash = await hashPassword(password);
    database.prepare("UPDATE staff SET password_hash = ? WHERE id = ?").run(passwordHash, id);
    database.prepare("DELETE FROM sessions WHERE staff_id = ?").run(id);
    return response.json({ id, passwordUpdated: true, sessionsRevoked: true });
});

app.delete("/api/auth/staff/:id/sessions", requireAuth, requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    if (!database.prepare("SELECT id FROM staff WHERE id = ?").get(id)) return response.status(404).json({ error: "Staff account not found." });
    const result = database.prepare("DELETE FROM sessions WHERE staff_id = ?").run(id);
    return response.json({ revokedSessions: result.changes });
});

app.get("/api/technicians", requireAuth, (_request, response) => {
    response.json(database.prepare("SELECT id, name, email, created_at AS createdAt FROM technicians ORDER BY name COLLATE NOCASE, id").all());
});

app.post("/api/technicians", requireAuth, requireAdmin, (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    if (name.length < 2) return response.status(400).json({ error: "Technician name must have at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid technician email address." });
    try {
        const result = database.prepare("INSERT INTO technicians (name, email, created_at) VALUES (?, ?, ?)").run(name, email, new Date().toISOString());
        const technician = database.prepare("SELECT id, name, email, created_at AS createdAt FROM technicians WHERE id = ?").get(result.lastInsertRowid);
        return response.status(201).json(technician);
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That technician name or email is already on the list." });
        throw error;
    }
});

app.patch("/api/technicians/:id", requireAuth, requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid technician email address." });
    try {
        const result = database.prepare("UPDATE technicians SET email = ? WHERE id = ?").run(email, id);
        if (!result.changes) return response.status(404).json({ error: "Technician not found." });
        return response.json(database.prepare("SELECT id, name, email, created_at AS createdAt FROM technicians WHERE id = ?").get(id));
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That email address is already assigned to a technician." });
        throw error;
    }
});

app.delete("/api/technicians/:id", requireAuth, requireAdmin, (request, response) => {
    const result = database.prepare("DELETE FROM technicians WHERE id = ?").run(Number(request.params.id));
    if (!result.changes) return response.status(404).json({ error: "Technician not found." });
    return response.status(204).end();
});

function activity(action, text, by = "IT Support Staff") {
    return { id: `${Date.now()}-${Math.random()}`, action, text, by, at: new Date().toISOString() };
}

function save(ticket) {
    updateTicket.run(toRow(ticket));
    return fromRow(selectTicketById.get(ticket.id));
}

function migrateLegacyJson() {
    const migrationKey = "legacy_json_migrated";
    if (database.prepare("SELECT value FROM app_metadata WHERE key = ?").get(migrationKey)) return;
    const markMigrated = database.prepare("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)");
    if (database.prepare("SELECT COUNT(*) AS count FROM tickets").get().count > 0 || !fs.existsSync(LEGACY_FILE)) {
        markMigrated.run(migrationKey, new Date().toISOString());
        return;
    }
    let legacyTickets;
    try {
        legacyTickets = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
    } catch (error) {
        console.warn("Skipping unreadable legacy ticket JSON:", error.message);
        markMigrated.run(migrationKey, new Date().toISOString());
        return;
    }
    if (!Array.isArray(legacyTickets)) return;

    const seenIds = new Set();
    const validTickets = legacyTickets.filter((ticket) => {
        const valid = ticket && Number.isSafeInteger(ticket.id) && ticket.id > 0 && !seenIds.has(ticket.id) &&
            typeof ticket.employee === "string" && ticket.employee.trim() &&
            typeof ticket.issue === "string" && ticket.issue.trim() && STATUSES.includes(ticket.status);
        if (valid) seenIds.add(ticket.id);
        return valid;
    }).map((ticket) => normalizeTicket({
        ...ticket,
        priority: PRIORITIES.includes(ticket.priority) ? ticket.priority : "Medium",
    }));

    const migrate = database.transaction((items) => {
        for (const ticket of items) {
            insertTicket.run(toRow(ticket));
        }
        markMigrated.run(migrationKey, new Date().toISOString());
    });
    migrate(validTickets);
    if (validTickets.length) console.log(`Imported ${validTickets.length} existing ticket(s) from JSON into SQLite.`);
}

migrateLegacyJson();

app.get("/", (_request, response) => {
    response.json({ message: "IT Support Ticket Tracker API is running." });
});

app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", storage: "sqlite" });
});

app.use("/api/employees", requireAuth);

app.get("/api/employees", (_request, response) => {
    response.json(selectEmployees.all().map(publicEmployee));
});

app.get("/api/employees/:id", (request, response) => {
    const employee = publicEmployee(selectEmployeeById.get(Number(request.params.id)));
    if (!employee) return response.status(404).json({ error: "Employee not found." });
    return response.json(employee);
});

app.post("/api/employees", requireAdmin, async (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const department = typeof request.body.department === "string" ? request.body.department.trim() : "";
    if (name.length < 2) return response.status(400).json({ error: "Employee name must have at least 2 characters." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid employee email address." });
    const now = new Date().toISOString();
    const password = request.body.password;
    if (password !== undefined && (!email || typeof password !== "string" || password.length < 8)) {
        return response.status(400).json({ error: "An employee account needs a valid email and password with at least 8 characters." });
    }
    try {
        const passwordHash = password ? await hashPassword(password) : null;
        const createEmployee = database.transaction(() => {
            const result = database.prepare("INSERT INTO employees (name, email, department, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
                .run(name, email, department, now, now);
            if (passwordHash) {
                database.prepare("INSERT INTO staff (name, email, password_hash, role, created_at, employee_id) VALUES (?, ?, ?, 'staff', ?, ?)")
                    .run(name, email.toLowerCase(), passwordHash, now, result.lastInsertRowid);
            }
            return result.lastInsertRowid;
        });
        const id = createEmployee();
        return response.status(201).json(publicEmployee(selectEmployeeById.get(id)));
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That email address is already registered to an employee or account." });
        throw error;
    }
});

app.put("/api/employees/:id", requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    const current = selectEmployeeById.get(id);
    if (!current) return response.status(404).json({ error: "Employee not found." });
    const name = typeof request.body.name === "string" ? request.body.name.trim() : current.name;
    const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : current.email;
    const department = typeof request.body.department === "string" ? request.body.department.trim() : current.department;
    if (name.length < 2) return response.status(400).json({ error: "Employee name must have at least 2 characters." });
    if (current.has_account && !email) return response.status(400).json({ error: "An employee with a sign-in account must have an email address." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid employee email address." });
    try {
        const updateEmployee = database.transaction(() => {
            database.prepare("UPDATE employees SET name = ?, email = ?, department = ?, updated_at = ? WHERE id = ?")
                .run(name, email, department, new Date().toISOString(), id);
            database.prepare("UPDATE staff SET name = ?, email = ? WHERE employee_id = ?").run(name, email.toLowerCase(), id);
        });
        updateEmployee();
        return response.json(publicEmployee(selectEmployeeById.get(id)));
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That email address is already registered to an employee or account." });
        throw error;
    }
});

app.delete("/api/employees/:id", requireAdmin, (request, response) => {
    const result = database.prepare("DELETE FROM employees WHERE id = ?").run(Number(request.params.id));
    if (!result.changes) return response.status(404).json({ error: "Employee not found." });
    return response.status(204).end();
});

app.use("/api/devices", requireAuth);

app.get("/api/devices", (_request, response) => {
    response.json(selectDevices.all().map(publicDevice));
});

app.get("/api/devices/:id", (request, response) => {
    const device = publicDevice(selectDeviceById.get(Number(request.params.id)));
    if (!device) return response.status(404).json({ error: "Device not found." });
    return response.json(device);
});

function normalizeDeviceInput(body, current = null) {
    const assetTag = typeof body.assetTag === "string" ? body.assetTag.trim() : current?.asset_tag || "";
    const name = typeof body.name === "string" ? body.name.trim() : current?.name || "";
    const type = typeof body.type === "string" ? body.type.trim() : current?.type || "";
    const status = typeof body.status === "string" ? body.status : current?.status || "Available";
    const rawEmployeeId = body.employeeId === undefined ? current?.employee_id ?? null : body.employeeId;
    const employeeId = rawEmployeeId === "" || rawEmployeeId === null ? null : Number(rawEmployeeId);
    if (assetTag.length < 2 || name.length < 2) return { error: "Asset tag and device name must have at least 2 characters." };
    if (!DEVICE_STATUSES.includes(status)) return { error: "Choose a valid device status." };
    if (employeeId !== null && (!Number.isSafeInteger(employeeId) || employeeId < 1 || !selectEmployeeById.get(employeeId))) {
        return { error: "The selected employee does not exist." };
    }
    return { assetTag, name, type, status, employeeId };
}

app.post("/api/devices", (request, response) => {
    const device = normalizeDeviceInput(request.body);
    if (device.error) return response.status(400).json({ error: device.error });
    const now = new Date().toISOString();
    try {
        const result = database.prepare(`
            INSERT INTO devices (asset_tag, name, type, status, employee_id, created_at, updated_at)
            VALUES (@assetTag, @name, @type, @status, @employeeId, @now, @now)
        `).run({ ...device, now });
        return response.status(201).json(publicDevice(selectDeviceById.get(result.lastInsertRowid)));
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "A device with that asset tag already exists." });
        throw error;
    }
});

app.put("/api/devices/:id", (request, response) => {
    const id = Number(request.params.id);
    const current = selectDeviceById.get(id);
    if (!current) return response.status(404).json({ error: "Device not found." });
    const device = normalizeDeviceInput(request.body, current);
    if (device.error) return response.status(400).json({ error: device.error });
    try {
        database.prepare(`
            UPDATE devices SET asset_tag = @assetTag, name = @name, type = @type,
                status = @status, employee_id = @employeeId, updated_at = @now
            WHERE id = @id
        `).run({ ...device, now: new Date().toISOString(), id });
        return response.json(publicDevice(selectDeviceById.get(id)));
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "A device with that asset tag already exists." });
        throw error;
    }
});

app.delete("/api/devices/:id", (request, response) => {
    const result = database.prepare("DELETE FROM devices WHERE id = ?").run(Number(request.params.id));
    if (!result.changes) return response.status(404).json({ error: "Device not found." });
    return response.status(204).end();
});

app.use("/api/tickets", requireAuth);

app.get("/api/tickets", (_request, response) => {
    response.json(selectTickets.all().map(fromRow));
});

app.put("/api/tickets/import", (request, response) => {
    if (database.prepare("SELECT COUNT(*) AS count FROM tickets").get().count > 0) {
        return response.json(selectTickets.all().map(fromRow));
    }
    const imported = request.body;
    if (!Array.isArray(imported)) return response.status(400).json({ error: "Expected an array of tickets." });
    const ids = new Set();
    const valid = imported.every((ticket) => {
        if (!Number.isSafeInteger(ticket?.id) || ticket.id < 1 || ids.has(ticket.id) || !validTicket(ticket)) return false;
        ids.add(ticket.id);
        return true;
    });
    if (!valid) return response.status(400).json({ error: "Imported tickets contain invalid or duplicate data." });
    const normalized = imported.map(normalizeTicket);
    const importTickets = database.transaction((items) => {
        for (const ticket of items) insertTicket.run(toRow(ticket));
    });
    importTickets(normalized);
    return response.json(selectTickets.all().map(fromRow));
});

app.post("/api/tickets", (request, response) => {
    const body = request.body;
    const candidate = { ...body, status: body.status || "Pending", priority: body.priority || "Medium" };
    if (!validTicket(candidate)) return response.status(400).json({ error: "Employee, issue, status, and priority must be valid." });
    const ticket = normalizeTicket({
        ...candidate,
        technician: body.technician,
        dueDate: body.dueDate,
        activity: [activity("created", "Ticket created", request.staff.name)],
        comments: [],
        attachments: [],
    });
    const result = insertNewTicket.run(toRow(ticket));
    return response.status(201).json(fromRow(selectTicketById.get(result.lastInsertRowid)));
});

app.put("/api/tickets/:id", (request, response) => {
    const id = Number(request.params.id);
    const current = fromRow(selectTicketById.get(id));
    if (!current) return response.status(404).json({ error: "Ticket not found." });
    const nextTechnician = typeof request.body.technician === "string" ? request.body.technician.trim() : current.technician;
    const assignmentChanged = nextTechnician !== current.technician;
    const updated = normalizeTicket({
        ...current,
        ...request.body,
        id,
        activity: assignmentChanged
            ? [...current.activity, activity("assignment", nextTechnician ? `Assigned to ${nextTechnician}` : `Unassigned from ${current.technician}`, request.staff.name)]
            : current.activity,
        comments: current.comments,
        attachments: current.attachments,
    });
    if (!validTicket(updated)) return response.status(400).json({ error: "Ticket fields are invalid." });
    return response.json(save(updated));
});

app.patch("/api/tickets/:id/status", (request, response) => {
    const id = Number(request.params.id);
    const current = fromRow(selectTicketById.get(id));
    if (!current) return response.status(404).json({ error: "Ticket not found." });
    const { status } = request.body;
    if (!STATUSES.includes(status)) return response.status(400).json({ error: "Invalid ticket status." });
    if (status === current.status) return response.json(current);
    const updated = {
        ...current,
        status,
        activity: [...current.activity, activity("status", `Status changed from ${current.status} to ${status}`, request.staff.name)],
    };
    return response.json(save(updated));
});

app.post("/api/tickets/:id/comments", (request, response) => {
    const id = Number(request.params.id);
    const current = fromRow(selectTicketById.get(id));
    if (!current) return response.status(404).json({ error: "Ticket not found." });
    if (typeof request.body.text !== "string" || !request.body.text.trim()) return response.status(400).json({ error: "Comment text is required." });
    const by = request.staff.name;
    const comment = { id: `${Date.now()}-${Math.random()}`, text: request.body.text.trim(), by, at: new Date().toISOString() };
    const updated = {
        ...current,
        comments: [...current.comments, comment],
        activity: [...current.activity, activity("comment", "Added a comment", by)],
    };
    return response.status(201).json(save(updated));
});

app.post("/api/tickets/:id/attachments", (request, response) => {
    const id = Number(request.params.id);
    const current = fromRow(selectTicketById.get(id));
    if (!current) return response.status(404).json({ error: "Ticket not found." });
    const incoming = request.body.attachments;
    if (!Array.isArray(incoming) || !incoming.length) return response.status(400).json({ error: "Select at least one attachment." });
    if (incoming.some((file) => !file || typeof file.name !== "string" || typeof file.dataUrl !== "string" || !Number.isFinite(file.size) || file.size > 1024 * 1024)) {
        return response.status(400).json({ error: "Each attachment must be valid and 1 MB or smaller." });
    }
    const currentTotal = selectTickets.all().reduce((sum, row) => sum + fromRow(row).attachments.reduce((size, file) => size + file.size, 0), 0);
    const incomingTotal = incoming.reduce((sum, file) => sum + file.size, 0);
    if (currentTotal + incomingTotal > 3 * 1024 * 1024) return response.status(413).json({ error: "Attachment storage is limited to 3 MB." });
    const by = request.staff.name;
    const files = incoming.map((file) => ({ ...file, id: `${Date.now()}-${Math.random()}`, by, at: new Date().toISOString() }));
    const updated = {
        ...current,
        attachments: [...current.attachments, ...files],
        activity: [...current.activity, activity("attachment", `Attached ${files.map((file) => file.name).join(", ")}`, by)],
    };
    return response.status(201).json(save(updated));
});

app.delete("/api/tickets/:id", (request, response) => {
    const result = database.prepare("DELETE FROM tickets WHERE id = ?").run(Number(request.params.id));
    if (!result.changes) return response.status(404).json({ error: "Ticket not found." });
    return response.status(204).end();
});

app.use((_request, response) => {
    response.status(404).json({ error: "API route not found." });
});

app.use((error, _request, response, _next) => {
    const status = error.status || (error.type === "entity.too.large" ? 413 : 500);
    console.error(error);
    response.status(status).json({ error: status === 500 ? "Internal server error." : error.message });
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(`Backend server running at http://127.0.0.1:${PORT} (SQLite)`);
});
