# IT Support Tracker

React and Vite ticket dashboard backed by an Express API and SQLite persistence. Staff sign in with individual accounts; the first account is the administrator and can create staff accounts. Administrators can also create an employee directory entry with a linked employee sign-in account. Employee profiles, account records, and tickets are stored by the backend in SQLite.

## Run locally

Install backend dependencies and start the API from the `server` directory:

```sh
npm install
npm start
```

In another terminal, install frontend dependencies and start Vite from `it-support-tracker`:

```sh
npm install
npm run dev
```

The backend listens on `http://127.0.0.1:5000`. Vite proxies `/api` requests to it. Tickets are saved in `server/data/tickets.db`. Existing JSON tickets are migrated to SQLite at server startup, and browser tickets are imported on first load when the database is empty.

## API routes

- `GET /api/health` — API health check
- `GET /api/auth/status` — check whether initial admin setup is needed
- `POST /api/auth/bootstrap` — create the first administrator
- `POST /api/auth/login` — sign in
- `GET /api/auth/me` — current staff identity
- `POST /api/auth/logout` — sign out
- `GET /api/auth/staff` — list staff accounts (admin)
- `POST /api/auth/staff` — create a staff account (admin)
- `POST /api/employees` — create an employee profile, optionally with a linked sign-in account (`password` field)
- `PATCH /api/auth/staff/:id/status` — activate or deactivate staff (admin)
- `PATCH /api/auth/staff/:id/password` — reset a staff password and revoke their sessions (admin)
- `DELETE /api/auth/staff/:id/sessions` — revoke a staff member's sessions (admin)
- `GET /api/technicians` — list technicians available for ticket assignment
- `POST /api/technicians` — add a technician with an email address (admin)
- `PATCH /api/technicians/:id` — update a technician's email address (admin)
- `DELETE /api/technicians/:id` — remove a technician from the list (admin)
- `GET /api/tickets` — list tickets
- `POST /api/tickets` — create a ticket
- `PUT /api/tickets/:id` — update ticket details
- `PATCH /api/tickets/:id/status` — change status and record activity
- `POST /api/tickets/:id/comments` — add a comment
- `POST /api/tickets/:id/attachments` — add attachments
- `DELETE /api/tickets/:id` — delete a ticket
