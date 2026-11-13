import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.API_PORT || 3001);
const STATUSES = ["Pending", "In Progress", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High"];
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");
const MAX_BODY_BYTES = 6 * 1024 * 1024;
let tickets = [];
let writeQueue = Promise.resolve();

function createActivity(action, text, by = "IT Support Staff") {
    return { id: `${Date.now()}-${Math.random()}`, action, text, by, at: new Date().toISOString() };
}

function json(response, status, data) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(data));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let tooLarge = false;
        const chunks = [];
        request.on("data", (chunk) => {
            if (tooLarge) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                tooLarge = true;
                reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
            } catch {
                reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
            }
        });
        request.on("error", reject);
    });
}

function saveTickets() {
    writeQueue = writeQueue.then(async () => {
        await mkdir(DATA_DIR, { recursive: true });
        await writeFile(DATA_FILE, `${JSON.stringify(tickets, null, 2)}\n`, "utf8");
    });
    return writeQueue;
}

function validateTicket(ticket) {
    return ticket &&
        typeof ticket.employee === "string" && ticket.employee.trim() &&
        typeof ticket.issue === "string" && ticket.issue.trim() &&
        STATUSES.includes(ticket.status) &&
        PRIORITIES.includes(ticket.priority);
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

async function handleRequest(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const route = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && route === "/api/health") {
        return json(response, 200, { status: "ok" });
    }

    if (request.method === "GET" && route === "/api/tickets") {
        return json(response, 200, tickets);
    }

    if (request.method === "PUT" && route === "/api/tickets/import") {
        const imported = await readBody(request);
        if (tickets.length) return json(response, 200, tickets);
        if (!Array.isArray(imported)) return json(response, 400, { error: "Expected an array of tickets." });
        const ids = new Set();
        const valid = imported.every((ticket) => {
            if (!Number.isSafeInteger(ticket?.id) || ticket.id < 1 || ids.has(ticket.id) || !validateTicket(ticket)) return false;
            ids.add(ticket.id);
            return true;
        });
        if (!valid) return json(response, 400, { error: "Imported tickets contain invalid or duplicate data." });
        tickets = imported.map(normalizeTicket);
        await saveTickets();
        return json(response, 200, tickets);
    }

    if (request.method === "POST" && route === "/api/tickets") {
        const body = await readBody(request);
        const candidate = { ...body, status: body.status || "Pending", priority: body.priority || "Medium" };
        if (!validateTicket(candidate)) return json(response, 400, { error: "Employee, issue, status, and priority are required and must be valid." });
        const id = Math.max(1000, ...tickets.map((ticket) => ticket.id)) + 1;
        const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "IT Support Staff";
        const ticket = normalizeTicket({
            ...candidate,
            id,
            activity: [createActivity("created", "Ticket created", by)],
            comments: [],
            attachments: [],
        });
        tickets = [ticket, ...tickets];
        await saveTickets();
        return json(response, 201, ticket);
    }

    const match = route.match(/^\/api\/tickets\/(\d+)(?:\/(status|comments|attachments))?$/);
    if (!match) return json(response, 404, { error: "API route not found." });
    const id = Number(match[1]);
    const action = match[2];
    const ticketIndex = tickets.findIndex((ticket) => ticket.id === id);
    if (ticketIndex === -1) return json(response, 404, { error: "Ticket not found." });
    const current = tickets[ticketIndex];

    if (request.method === "PUT" && !action) {
        const body = await readBody(request);
        const candidate = normalizeTicket({ ...current, ...body, id });
        if (!validateTicket(candidate)) return json(response, 400, { error: "Ticket fields are invalid." });
        tickets[ticketIndex] = candidate;
        await saveTickets();
        return json(response, 200, candidate);
    }

    if (request.method === "PATCH" && action === "status") {
        const body = await readBody(request);
        if (!STATUSES.includes(body.status)) return json(response, 400, { error: "Invalid ticket status." });
        if (body.status !== current.status) {
            const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "IT Support Staff";
            tickets[ticketIndex] = {
                ...current,
                status: body.status,
                activity: [...current.activity, createActivity("status", `Status changed from ${current.status} to ${body.status}`, by)],
            };
            await saveTickets();
        }
        return json(response, 200, tickets[ticketIndex]);
    }

    if (request.method === "POST" && action === "comments") {
        const body = await readBody(request);
        if (typeof body.text !== "string" || !body.text.trim()) return json(response, 400, { error: "Comment text is required." });
        const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "IT Support Staff";
        const comment = { id: `${Date.now()}-${Math.random()}`, text: body.text.trim(), by, at: new Date().toISOString() };
        tickets[ticketIndex] = {
            ...current,
            comments: [...current.comments, comment],
            activity: [...current.activity, createActivity("comment", "Added a comment", by)],
        };
        await saveTickets();
        return json(response, 201, tickets[ticketIndex]);
    }

    if (request.method === "POST" && action === "attachments") {
        const body = await readBody(request);
        if (!Array.isArray(body.attachments) || !body.attachments.length) return json(response, 400, { error: "Select at least one attachment." });
        const incoming = body.attachments;
        if (incoming.some((file) => !file || typeof file.name !== "string" || typeof file.dataUrl !== "string" || !Number.isFinite(file.size) || file.size > 1024 * 1024)) {
            return json(response, 400, { error: "Each attachment must be valid and 1 MB or smaller." });
        }
        const totalSize = tickets.reduce((total, item) => total + item.attachments.reduce((sum, file) => sum + file.size, 0), 0) + incoming.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > 3 * 1024 * 1024) return json(response, 413, { error: "Attachment storage is limited to 3 MB." });
        const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "IT Support Staff";
        const files = incoming.map((file) => ({ ...file, id: `${Date.now()}-${Math.random()}`, by, at: new Date().toISOString() }));
        tickets[ticketIndex] = {
            ...current,
            attachments: [...current.attachments, ...files],
            activity: [...current.activity, createActivity("attachment", `Attached ${files.map((file) => file.name).join(", ")}`, by)],
        };
        await saveTickets();
        return json(response, 201, tickets[ticketIndex]);
    }

    if (request.method === "DELETE" && !action) {
        tickets = tickets.filter((ticket) => ticket.id !== id);
        await saveTickets();
        response.writeHead(204);
        return response.end();
    }

    return json(response, 405, { error: "Method not allowed." });
}

async function start() {
    try {
        const saved = await readFile(DATA_FILE, "utf8");
        const parsed = JSON.parse(saved);
        tickets = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await saveTickets();
    }

    const server = createServer((request, response) => {
        handleRequest(request, response).catch((error) => {
            if (!response.headersSent) json(response, error.status || 500, { error: error.message || "Internal server error." });
            else response.destroy(error);
        });
    });

    server.listen(PORT, "127.0.0.1", () => {
        console.log(`IT Support API listening on http://127.0.0.1:${PORT}`);
    });
}

start().catch((error) => {
    console.error("Could not start the IT Support API:", error);
    process.exitCode = 1;
});
