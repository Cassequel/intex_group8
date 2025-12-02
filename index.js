require('dotenv').config();
const express = require("express");
const session = require("express-session");
let path = require("path");
const fs = require("fs");
const multer = require("multer");
let bodyParser = require("body-parser");
let app = express();
const bcrypt = require("bcrypt");
const port = process.env.PORT || 8080;
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/styles', express.static(path.join(__dirname, 'styles')));


app.use(session({
    secret: process.env.SESSION_SECRET || "devsecret",
    resave: false,
    saveUninitialized: false
}));

// const knexConfig = require("./knexfile");
// const environment = process.env.NODE_ENV || "development";
// const knex = require("knex")(knexConfig[environment]);
// const knexConfig = require("./knexfile");
// const environment = process.env.NODE_ENV || "development";
// const knex = require("knex")(knexConfig[environment]);

const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.RDS_HOST_NAME || "localhost",
        user : process.env.RDS_USER_NAME || "postgres",
        password : process.env.RDS_USER_PASSWORD || "wiztec12",
        database : process.env.RDS_DB_NAME || "ellarises",
        port : process.env.RDS_PORT || 5432  // PostgreSQL 16 typically uses port 5434
    }
});
// Root directory for static images
const uploadRoot = path.join(__dirname, "images");
// Sub-directory where uploaded profile pictures will be stored
const uploadDir = path.join(uploadRoot, "uploads");
// Ensure upload directories exist
fs.mkdirSync(uploadDir, { recursive: true });
// cb is the callback function
// The callback is how you hand control back to Multer after
// your customization step

// Configure Multer's disk storage engine
// Multer calls it once per upload to ask where to store the file. Your function receives:
// req: the incoming request.
// file: metadata about the file (original name, mimetype, etc.).
// cb: the callback.
const storage = multer.diskStorage({
    // Save files into our uploads directory
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    // Reuse the original filename so users see familiar names
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
// Create the Multer instance that will handle single-file uploads
const upload = multer({ storage });
// Expose everything in /images (including uploads) as static assets
app.use("/images", express.static(uploadRoot));

// process.env.PORT is when you deploy and 3000 is for test

/* Session middleware (Middleware is code that runs between the time the request comes
to the server and the time the response is sent back. It allows you to intercept and
decide if the request should continue. It also allows you to parse the body request
from the html form, handle errors, check authentication, etc.)

REQUIRED parameters for session:
*/
// Content Security Policy middleware - allows localhost connections for development
// This fixes the CSP violation error with Chrome DevTools
app.use((req, res, next) => {
  // Set a permissive CSP for development that allows localhost connections
  // This allows Chrome DevTools to connect to localhost:3000
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
    "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://cdn.jsdelivr.net;"
  );
  next();
});

app.use(
    session(
        {
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
        }
    )
);

// Tells Express how to read form data sent in the body of a request
app.use(express.urlencoded({extended: true}));

// Expose session flags to views
app.use((req, res, next) => {
    res.locals.isLoggedIn = !!req.session.isLoggedIn;
    res.locals.userLevel = req.session.level || 'U';
    next();
});

// Global authentication middleware - runs on EVERY request
app.use((req, res, next) => {
    // Skip authentication for login routes
    if (req.path === '/' || req.path === '/login' || req.path === '/logout' ||
        req.path === '/register'||
        req.path === '/donations'||
        req.path === '/index' ||
        req.path === '/teapot') {
        //continue with the request path
        return next();
    }
    
    // Check if user is logged in for all other routes
    if (req.session.isLoggedIn) {
        //notice no return because nothing below it
        next(); // User is logged in, continue
    } 
    else {
        res.render("auth/login", { error_message: "Please log in to access this page" });
    }
});


app.get('/', (req, res) => {
    res.render('public/landing');
});

app.get('/donations', async (req, res) => {
    try {
        const donations = await knex("donations as d")
            .leftJoin("participants as p", "d.participant_id", "p.participant_id")
            .select(
                "d.*",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name")
            )
            .orderBy("d.donation_id", "asc");
        res.render('donations/donations', { donations });
    } catch (error) {
        console.error("Error loading donations:", error);
        res.status(500).send("Error loading donations");
    }
});

app.get('/donAdd', (req, res) => {
    res.render('donations/donAdd', { error_message: null });
});

app.post('/donations/new', async (req, res) => {
    const { first_name, last_name, email, donation_date, amount } = req.body;

    if (!first_name || !last_name || !email || !amount) {
        return res.status(400).render('donations/donAdd', { error_message: "Please fill in name, email, and amount." });
    }

    try {
        const participant = await knex("participants").where({ email }).first();
        if (!participant) {
            return res.status(400).render('donations/donAdd', { error_message: "We couldn't find a participant with that email." });
        }

        await knex("donations").insert({
            participant_id: participant.participant_id,
            donation_date: donation_date || null,
            amount
        });

        res.redirect('/donations');
    } catch (error) {
        console.error("Error creating donation:", error);
        res.status(500).render('donations/donAdd', { error_message: "Could not create donation. Please try again." });
    }
});

app.get('/donations/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const donation = await knex("donations as d")
            .leftJoin("participants as p", "d.participant_id", "p.participant_id")
            .select(
                "d.*",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name")
            )
            .where("d.donation_id", id)
            .first();
        if (!donation) {
            return res.status(404).render('public/418Code');
        }
        res.render('donations/donDetails', { donation });
    } catch (error) {
        console.error("Error loading donation:", error);
        res.status(500).send("Error loading donation");
    }
});

app.get('/donations/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const donation = await knex("donations as d")
            .leftJoin("participants as p", "d.participant_id", "p.participant_id")
            .select(
                "d.*",
                "p.email",
                "p.first_name",
                "p.last_name",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name")
            )
            .where("d.donation_id", id)
            .first();
        if (!donation) {
            return res.status(404).render('public/418Code');
        }
        res.render('donations/donEdit', { donation, error_message: null });
    } catch (error) {
        console.error("Error loading donation:", error);
        res.status(500).send("Error loading donation");
    }
});

app.post('/donations/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, email, donation_date, amount } = req.body;

    if (!first_name || !last_name || !email || !amount) {
        return res.status(400).render('donations/donEdit', {
            donation: { donation_id: id, first_name, last_name, email, donation_date, amount },
            error_message: "Please fill in name, email, and amount."
        });
    }

    try {
        const participant = await knex("participants").where({ email }).first();
        if (!participant) {
            return res.status(400).render('donations/donEdit', {
                donation: { donation_id: id, first_name, last_name, email, donation_date, amount },
                error_message: "We couldn't find a participant with that email."
            });
        }

        await knex("donations")
            .where({ donation_id: id })
            .update({
                participant_id: participant.participant_id,
                donation_date: donation_date || null,
                amount
            });

        res.redirect(`/donations/${id}`);
    } catch (error) {
        console.error("Error updating donation:", error);
        try {
            const donation = await knex("donations as d")
                .leftJoin("participants as p", "d.participant_id", "p.participant_id")
                .select(
                    "d.*",
                    "p.email",
                    "p.first_name",
                    "p.last_name",
                    knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name")
                )
                .where("d.donation_id", id)
                .first();
            res.status(500).render('donations/donEdit', { donation, error_message: "Could not update donation. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading donation");
        }
    }
});

app.post('/donations/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await knex("donations").where({ donation_id: id }).del();
        res.redirect('/donations');
    } catch (error) {
        console.error("Error deleting donation:", error);
        res.status(500).send("Error deleting donation");
    }
});

// Milestones
app.get('/milestones', async (req, res) => {
    try {
        const milestones = await knex("milestones as m")
            .leftJoin("participants as p", "m.participant_id", "p.participant_id")
            .select(
                "m.*",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name")
            )
            .orderBy("m.participant_id", "asc")
            .orderBy("m.milestone_id", "asc");
        res.render('milestones/milestones', { milestones });
    } catch (error) {
        console.error("Error loading milestones:", error);
        res.status(500).send("Error loading milestones");
    }
});

app.get('/milestones/new', (req, res) => {
    res.render('milestones/mileAdd', { error_message: null });
});

app.post('/milestones/new', async (req, res) => {
    const { email, title, achieved_date } = req.body;

    if (!email || !title) {
        return res.status(400).render('milestones/mileAdd', { error_message: "Email and title are required." });
    }

    try {
        const participant = await knex("participants").where({ email }).first();
        if (!participant) {
            return res.status(400).render('milestones/mileAdd', { error_message: "No participant found with that email." });
        }

        const [newMilestone] = await knex("milestones")
            .insert({
                participant_id: participant.participant_id,
                title,
                achieved_date: achieved_date || null
            })
            .returning("*");

        res.redirect(`/milestones/${newMilestone.milestone_id}`);
    } catch (error) {
        console.error("Error creating milestone:", error);
        res.status(500).render('milestones/mileAdd', { error_message: "Could not create milestone. Please try again." });
    }
});

app.get('/milestones/:id', async (req, res) => {
    const { id } = req.params;
    const { from } = req.query;
    try {
        const milestone = await knex("milestones as m")
            .leftJoin("participants as p", "m.participant_id", "p.participant_id")
            .select(
                "m.*",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name")
            )
            .where("m.milestone_id", id)
            .first();
        if (!milestone) {
            return res.status(404).render('public/418Code');
        }
        const milestonesForParticipant = await knex("milestones")
            .where({ participant_id: milestone.participant_id })
            .orderBy("achieved_date", "asc")
            .orderBy("milestone_id", "asc");
        res.render('milestones/mileDetail', { milestone, milestonesForParticipant, returnTo: from === 'milestones' ? '/milestones' : '/participants' });
    } catch (error) {
        console.error("Error loading milestone:", error);
        res.status(500).send("Error loading milestone");
    }
});

app.get('/milestones/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const milestone = await knex("milestones as m")
            .leftJoin("participants as p", "m.participant_id", "p.participant_id")
            .select(
                "m.*",
                "p.email"
            )
            .where("m.milestone_id", id)
            .first();
        if (!milestone) {
            return res.status(404).render('public/418Code');
        }
        res.render('milestones/mileEdit', { milestone, error_message: null });
    } catch (error) {
        console.error("Error loading milestone:", error);
        res.status(500).send("Error loading milestone");
    }
});

app.post('/milestones/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { email, title, achieved_date } = req.body;

    if (!email || !title) {
        return res.status(400).render('milestones/mileEdit', {
            milestone: { milestone_id: id, email, title, achieved_date },
            error_message: "Email and title are required."
        });
    }

    try {
        const participant = await knex("participants").where({ email }).first();
        if (!participant) {
            return res.status(400).render('milestones/mileEdit', {
                milestone: { milestone_id: id, email, title, achieved_date },
                error_message: "No participant found with that email."
            });
        }

        await knex("milestones")
            .where({ milestone_id: id })
            .update({
                participant_id: participant.participant_id,
                title,
                achieved_date: achieved_date || null
            });

        res.redirect(`/milestones/${id}`);
    } catch (error) {
        console.error("Error updating milestone:", error);
        try {
            const milestone = await knex("milestones as m")
                .leftJoin("participants as p", "m.participant_id", "p.participant_id")
                .select("m.*", "p.email")
                .where("m.milestone_id", id)
                .first();
            res.status(500).render('milestones/mileEdit', { milestone, error_message: "Could not update milestone. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading milestone");
        }
    }
});

app.get('/register', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/');
    }
    res.render('auth/register', { error_message: null });
});

app.post('/register', async (req, res) => {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
        return res.render('auth/register', { error_message: "Please enter an email, username, and password." });
    }

    try {
        // Prevent duplicate usernames or emails
        const existingUser = await knex("users")
            .where({ username })
            .orWhere({ email })
            .first();

        if (existingUser) {
            return res.render('auth/register', { error_message: "That username or email is already in use." });
        }

        const [newUser] = await knex("users")
            .insert({
                email,
                username,
                password,
                level: "U" // Standard user level
            })
            .returning("*");

        req.session.isLoggedIn = true;
        req.session.userId = newUser.user_id;
        req.session.username = newUser.username;
        req.session.role = newUser.role || 'user';
        req.session.level = newUser.level || 'U';

        res.redirect('/');
    } catch (error) {
        console.error("Registration error:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "That username or email is already in use."
            : "Server error. Please try again.";
        res.status(500).render('auth/register', { error_message: message });
    }
});

app.get('/login', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/');
    }
    res.render('auth/login', { error_message: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('auth/login', { error_message: "Please enter a username and password." });
    }

    try {
        // NOTE: Current DB uses a plain `password` column (not hashed). Adjusted check accordingly.
        // For production, store bcrypt hashes instead.
        // Select all columns so future fields (e.g., level) are available without breaking now
        const user = await knex("users")
            .select("*")
            .where({ username })
            .first();
        if (!user) {
            return res.render('auth/login', { error_message: "Invalid credentials." });
        }

        const isMatch = password === user.password;
        if (!isMatch) {
            return res.render('auth/login', { error_message: "Invalid credentials." });
        }

        req.session.isLoggedIn = true;
        req.session.userId = user.user_id;
        req.session.username = user.username;
        req.session.role = user.role || 'user';
        req.session.level = user.level || 'user';

        res.redirect('/');
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).render('auth/login', { error_message: "Server error. Please try again." });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/participants', async (req, res) => {
    try {
        // Select all columns to avoid missing-column errors if schema differs (e.g., no "school")
        const participants = await knex("participants")
            .select("*")
            .orderBy("participant_id", "asc");

        res.render("participants/participants", { participants });
    } catch (error) {
        console.error("Error fetching participants:", error);
        res.status(500).send("Error loading participants");
    }
});

app.get('/participants/new', (req, res) => {
    res.render('participants/parAdd');
});

app.post('/participants/new', async (req, res) => {
    const {
        first_name,
        last_name,
        email,
        dob,
        phone,
        city,
        state,
        zip,
        school,
        employer,
        field_of_interest
    } = req.body;

    if (!first_name || !last_name || !email) {
        return res.status(400).render('participants/parAdd', {
            error_message: "First name, last name, and email are required."
        });
    }

    try {
        const [newParticipant] = await knex("participants")
            .insert({
                email,
                first_name,
                last_name,
                dob: dob || null,
                phone,
                city,
                state,
                zip,
                school_or_employer: school || employer || null,
                field_of_interest,
                role: "participant"
            })
            .returning("*");

        res.redirect(`/participants/${newParticipant.participant_id}`);
    } catch (error) {
        console.error("Error creating participant:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "That email is already in use."
            : "Could not create participant. Please try again.";
        res.status(500).render('participants/parAdd', { error_message: message });
    }
});

app.get('/participants/:id', async (req, res) => {
    const { id } = req.params;
    const { return: returnParam, return: returnQuery } = req.query;
    const returnTo = returnParam || returnQuery;
    try {
        const participant = await knex("participants")
            .select("*")
            .where({ participant_id: id })
            .first();

        if (!participant) {
            return res.status(404).render('public/418Code');
        }

        res.render('participants/parDetail', { participant, returnTo });
    } catch (error) {
        console.error("Error loading participant:", error);
        res.status(500).send("Error loading participant");
    }
});

app.get('/participants/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const participant = await knex("participants")
            .select("*")
            .where({ participant_id: id })
            .first();

        if (!participant) {
            return res.status(404).render('public/418Code');
        }

        res.render('participants/parEdit', { participant, error_message: null });
    } catch (error) {
        console.error("Error loading participant for edit:", error);
        res.status(500).send("Error loading participant");
    }
});

app.post('/participants/:id/edit', async (req, res) => {
    const { id } = req.params;
    const {
        first_name,
        last_name,
        email,
        dob,
        phone,
        city,
        state,
        zip,
        school,
        employer,
        field_of_interest
    } = req.body;

    if (!first_name || !last_name || !email) {
        return res.status(400).render('participants/parEdit', {
            participant: {
                participant_id: id,
                first_name,
                last_name,
                email,
                dob,
                phone,
                city,
                state,
                zip,
                school,
                employer,
                field_of_interest
            },
            error_message: "First name, last name, and email are required."
        });
    }

    try {
        const [updatedParticipant] = await knex("participants")
            .where({ participant_id: id })
            .update({
                email,
                first_name,
                last_name,
                dob: dob || null,
                phone,
                city,
                state,
                zip,
                school_or_employer: school || employer || null,
                field_of_interest
            })
            .returning("*");

        res.redirect(`/participants/${updatedParticipant.participant_id}`);
    } catch (error) {
        console.error("Error updating participant:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "That email is already in use."
            : "Could not update participant. Please try again.";

        try {
            const participant = await knex("participants")
                .select("*")
                .where({ participant_id: id })
                .first();
            res.status(500).render('participants/parEdit', { participant, error_message: message });
        } catch (loadErr) {
            res.status(500).send("Error loading participant");
        }
    }
});

app.post('/participants/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await knex("participants")
            .where({ participant_id: id })
            .del();
        res.redirect('/participants');
    } catch (error) {
        console.error("Error deleting participant:", error);
        res.status(500).send("Error deleting participant");
    }
});

// Users
const requireManager = (req, res, next) => {
    if (req.session.level === 'U') {
        return res.status(403).send("Not authorized");
    }
    next();
};

app.get('/users', requireManager, async (req, res) => {
    try {
        const users = await knex("users").select("*").orderBy("user_id", "asc");
        res.render('userDashboard/userDashboard', { users });
    } catch (error) {
        console.error("Error loading users:", error);
        res.status(500).send("Error loading users");
    }
});

app.get('/users/new', requireManager, (req, res) => {
    res.render('userDashboard/userAdd', { error_message: null });
});

app.post('/users/new', requireManager, async (req, res) => {
    const { username, email, password, level } = req.body;
    if (!username || !email || !password) {
        return res.status(400).render('userDashboard/userAdd', {
            error_message: "Username, email, and password are required."
        });
    }
    try {
        await knex("users").insert({
            username,
            email,
            password,
            level: level || 'U'
        });
        res.redirect('/users');
    } catch (error) {
        console.error("Error creating user:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "That username or email is already in use."
            : "Could not create user. Please try again.";
        res.status(500).render('userDashboard/userAdd', { error_message: message });
    }
});

app.get('/users/:id/edit', requireManager, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await knex("users").where({ user_id: id }).first();
        if (!user) {
            return res.status(404).render('public/418Code');
        }
        res.render('userDashboard/userEdit', { user, error_message: null });
    } catch (error) {
        console.error("Error loading user:", error);
        res.status(500).send("Error loading user");
    }
});

app.post('/users/:id/edit', requireManager, async (req, res) => {
    const { id } = req.params;
    const { username, email, password, level } = req.body;
    if (!username || !email || !password) {
        return res.status(400).render('userDashboard/userEdit', {
            user: { user_id: id, username, email, password, level },
            error_message: "Username, email, and password are required."
        });
    }
    try {
        const [updated] = await knex("users")
            .where({ user_id: id })
            .update({
                username,
                email,
                password,
                level: level || 'U'
            })
            .returning("*");
        res.redirect('/users');
    } catch (error) {
        console.error("Error updating user:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "That username or email is already in use."
            : "Could not update user. Please try again.";
        try {
            const user = await knex("users").where({ user_id: id }).first();
            res.status(500).render('userDashboard/userEdit', { user, error_message: message });
        } catch (loadErr) {
            res.status(500).send("Error loading user");
        }
    }
});

app.post('/users/:id/delete', requireManager, async (req, res) => {
    const { id } = req.params;
    try {
        await knex("users").where({ user_id: id }).del();
        res.redirect('/users');
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send("Error deleting user");
    }
});

// Events
app.get('/events', async (req, res) => {
    try {
        const events = await knex("events").select("*").orderBy("event_id", "asc");
        res.render('events/events', { events });
    } catch (error) {
        console.error("Error loading events:", error);
        res.status(500).send("Error loading events");
    }
});

app.get('/events/new', (req, res) => {
    res.render('events/eventAdd', { error_message: null });
});

app.post('/events/new', async (req, res) => {
    const {
        name,
        type,
        description,
        recurrence_pattern,
        default_capacity,
        datetime_start,
        datetime_end,
        location,
        capacity,
        registration_deadline
    } = req.body;

    if (!name) {
        return res.status(400).render('events/eventAdd', { error_message: "Name is required." });
    }

    try {
        const [newEvent] = await knex("events")
            .insert({
                name,
                type,
                description,
                recurrence_pattern,
                default_capacity: default_capacity || null,
                datetime_start: datetime_start || null,
                datetime_end: datetime_end || null,
                location,
                capacity: capacity || null,
                registration_deadline: registration_deadline || null
            })
            .returning("*");

        res.redirect(`/events/${newEvent.event_id}`);
    } catch (error) {
        console.error("Error creating event:", error);
        res.status(500).render('events/eventAdd', { error_message: "Could not create event. Please try again." });
    }
});

app.get('/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const event = await knex("events").where({ event_id: id }).first();
        if (!event) {
            return res.status(404).render('public/418Code');
        }
        res.render('events/eventDetail', { event });
    } catch (error) {
        console.error("Error loading event:", error);
        res.status(500).send("Error loading event");
    }
});

app.get('/events/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const event = await knex("events").where({ event_id: id }).first();
        if (!event) {
            return res.status(404).render('public/418Code');
        }
        res.render('events/eventEdit', { event, error_message: null });
    } catch (error) {
        console.error("Error loading event:", error);
        res.status(500).send("Error loading event");
    }
});

app.post('/events/:id/edit', async (req, res) => {
    const { id } = req.params;
    const {
        name,
        type,
        description,
        recurrence_pattern,
        default_capacity,
        datetime_start,
        datetime_end,
        location,
        capacity,
        registration_deadline
    } = req.body;

    if (!name) {
        return res.status(400).render('events/eventEdit', {
            event: {
                event_id: id,
                name,
                type,
                description,
                recurrence_pattern,
                default_capacity,
                datetime_start,
                datetime_end,
                location,
                capacity,
                registration_deadline
            },
            error_message: "Name is required."
        });
    }

    try {
        await knex("events")
            .where({ event_id: id })
            .update({
                name,
                type,
                description,
                recurrence_pattern,
                default_capacity: default_capacity || null,
                datetime_start: datetime_start || null,
                datetime_end: datetime_end || null,
                location,
                capacity: capacity || null,
                registration_deadline: registration_deadline || null
            });
        res.redirect(`/events/${id}`);
    } catch (error) {
        console.error("Error updating event:", error);
        try {
            const event = await knex("events").where({ event_id: id }).first();
            res.status(500).render('events/eventEdit', { event, error_message: "Could not update event. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading event");
        }
    }
});

app.post('/events/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await knex("events").where({ event_id: id }).del();
        res.redirect('/events');
    } catch (error) {
        console.error("Error deleting event:", error);
        res.status(500).send("Error deleting event");
    }
});

// Surveys
app.get('/surveys', async (req, res) => {
    try {
        const surveys = await knex("survey as s")
            .leftJoin("participants as p", "s.participant_id", "p.participant_id")
            .leftJoin("events as e", "s.event_id", "e.event_id")
            .select(
                "s.*",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name"),
                "e.name as event_name"
            )
            .orderBy("s.survey_id", "asc");
        res.render('surveys/surveys', { surveys });
    } catch (error) {
        console.error("Error loading surveys:", error);
        res.status(500).send("Error loading surveys");
    }
});

app.get('/surveys/new', (req, res) => {
    res.render('surveys/surAdd', { error_message: null });
});

app.post('/surveys/new', async (req, res) => {
    const {
        participant_id,
        event_id,
        satisfaction_score,
        usefulness_score,
        instructor_score,
        recommendation_score,
        nps_bucket,
        comments,
        submission_date
    } = req.body;

    if (!participant_id || !event_id) {
        return res.status(400).render('surveys/surAdd', { error_message: "Participant and event are required." });
    }

    try {
        const [newSurvey] = await knex("survey")
            .insert({
                participant_id,
                event_id,
                satisfaction_score: satisfaction_score || null,
                usefulness_score: usefulness_score || null,
                instructor_score: instructor_score || null,
                recommendation_score: recommendation_score || null,
                nps_bucket,
                comments,
                submission_date: submission_date || null
            })
            .returning("*");
        res.redirect(`/surveys/${newSurvey.survey_id}`);
    } catch (error) {
        console.error("Error creating survey:", error);
        res.status(500).render('surveys/surAdd', { error_message: "Could not create survey. Please try again." });
    }
});

app.get('/surveys/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const survey = await knex("survey as s")
            .leftJoin("participants as p", "s.participant_id", "p.participant_id")
            .leftJoin("events as e", "s.event_id", "e.event_id")
            .select(
                "s.*",
                knex.raw("CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) as participant_name"),
                "e.name as event_name"
            )
            .where("s.survey_id", id)
            .first();
        if (!survey) {
            return res.status(404).render('public/418Code');
        }
        res.render('surveys/surDetail', { survey });
    } catch (error) {
        console.error("Error loading survey:", error);
        res.status(500).send("Error loading survey");
    }
});

app.get('/surveys/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const survey = await knex("survey").where({ survey_id: id }).first();
        if (!survey) {
            return res.status(404).render('public/418Code');
        }
        res.render('surveys/surEdit', { survey, error_message: null });
    } catch (error) {
        console.error("Error loading survey:", error);
        res.status(500).send("Error loading survey");
    }
});

app.post('/surveys/:id/edit', async (req, res) => {
    const { id } = req.params;
    const {
        participant_id,
        event_id,
        satisfaction_score,
        usefulness_score,
        instructor_score,
        recommendation_score,
        nps_bucket,
        comments,
        submission_date
    } = req.body;

    if (!participant_id || !event_id) {
        return res.status(400).render('surveys/surEdit', {
            survey: {
                survey_id: id,
                participant_id,
                event_id,
                satisfaction_score,
                usefulness_score,
                instructor_score,
                recommendation_score,
                nps_bucket,
                comments,
                submission_date
            },
            error_message: "Participant and event are required."
        });
    }

    try {
        await knex("survey")
            .where({ survey_id: id })
            .update({
                participant_id,
                event_id,
                satisfaction_score: satisfaction_score || null,
                usefulness_score: usefulness_score || null,
                instructor_score: instructor_score || null,
                recommendation_score: recommendation_score || null,
                nps_bucket,
                comments,
                submission_date: submission_date || null
            });
        res.redirect(`/surveys/${id}`);
    } catch (error) {
        console.error("Error updating survey:", error);
        try {
            const survey = await knex("survey").where({ survey_id: id }).first();
            res.status(500).render('surveys/surEdit', { survey, error_message: "Could not update survey. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading survey");
        }
    }
});

app.post('/surveys/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await knex("survey").where({ survey_id: id }).del();
        res.redirect('/surveys');
    } catch (error) {
        console.error("Error deleting survey:", error);
        res.status(500).send("Error deleting survey");
    }
});

app.get('/managerDashboard', (req, res) => {
    res.render('managerDashboard/managerDashboard');
});

app.get('/teapot', (req, res) => {
    res.status(418).render('public/418Code');
});

app.listen(port, () => {
    console.log("The server is listening");
});


