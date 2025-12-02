// TO DO 
// EVENTS 
// -Fix Events Location - add new migration to rename table to events location 
// -in Add event, figure out how to pull in template and other information - test add
// - clicking on event names loops back, i think it doesn't go to detail view 
// - havent been able to test delte, no event i want to delete yet 

// SURVEYS 
// - Event ID in edit doesnt show up
// - add survey doesnt work, sayd relation events doesnt exist
// (Error: Error loading survey: error: select "s".*, CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name, "e"."name" as "event_name" from "surveys" as "s" left join "participants" as "p" on "s"."participant_id" = "p"."participant_id" left join "events" as "e" on "s"."event_occurence_id" = "e"."event_id" where "s"."survey_id" = $1 limit $2 - relation "events" does not exist)
// Delete cant be tested

//USERS - COMPLETELY FUNCITONAL 

//PARTICIPANTS 
// add Particpant doenst work,
// Delete cant be tested until add works 

// MILESTONES
// ADD doesnt work, says fill in info, but info was filled in 
// NO edit or delte, idk if we need that 


//DONATIONS 
// Cannot Add, says needs to fill in info but info was filled in ()
// no delete





// requrirements to set up all dev and production stuff
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
const helmet = require('helmet');



app.use(session({
    secret: process.env.SESSION_SECRET || "devsecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// installs helmet - used to delcare headers to pretect other aspects of the code
app.use(helmet());

// sets up connections for migrations(script to install database)
const knexConfig = require("./knexfile");
const environment = process.env.NODE_ENV || "development";
const knex = require("knex")(knexConfig[environment]);

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


// multer class helps secure file structure to make sure malicious files arent uploaded 
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type'));
    }
});
// Expose everything in /images (including uploads) as static assets
app.use("/images", express.static(uploadRoot));





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

// Password validation function - pass must be 8 char
function validatePassword(password) {
    if (password.length < 8) {
        return "Password must be at least 8 characters";
    }
    return null;
}
// function to setup level to make sure only managers can access
const requireManager = (req, res, next) => {
    if (req.session.level === 'U') {
        return res.status(403).send("Not authorized");
    }
    next();
};

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
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
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
    const {  participant_first_name,  participant_last_name, email, donation_date, donation_amount } = req.body;

    if (! participant_first_name || ! participant_last_name || !email || !donation_amount) {
        return res.status(400).render('donations/donAdd', { error_message: "Please fill in name, email, and donation_amount." });
    }

    try {
        const participant = await knex("participants").where({ participant_email: email }).first();
        if (!participant) {
            return res.status(400).render('donations/donAdd', { error_message: "We couldn't find a participant with that email." });
        }

        await knex("donations").insert({
            participant_id: participant.participant_id,
            donation_date: donation_date || null,
            donation_amount: donation_amount
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
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
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
                "p.participant_email",
                "p.participant_first_name",
                "p.participant_last_name",
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
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
    const {  participant_first_name,  participant_last_name, email, donation_date, donation_amount } = req.body;

    if (! participant_first_name || ! participant_last_name || !email || !donation_amount) {
        return res.status(400).render('donations/donEdit', {
            donation: { donation_id: id,  participant_first_name,  participant_last_name, email, donation_date, donation_amount },
            error_message: "Please fill in name, email, and donation_amount."
        });
    }

    try {
        const participant = await knex("participants").where({ participant_email: email }).first();
        if (!participant) {
            return res.status(400).render('donations/donEdit', {
                donation: { donation_id: id,  participant_first_name,  participant_last_name, email, donation_date, donation_amount },
                error_message: "We couldn't find a participant with that email."
            });
        }

        await knex("donations")
            .where({ donation_id: id })
            .update({
                participant_id: participant.participant_id,
                donation_date: donation_date || null,
                donation_amount: donation_amount
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
                    "p.participant_first_name",
                    "p.participant_last_name",
                    knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
                )
                .where("d.donation_id", id)
                .first();
            res.status(500).render('donations/donEdit', { donation, error_message: "Could not update donation. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading donation");
        }
    }
});

app.post('/donations/:id/delete', requireManager, async (req, res) => {
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
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
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
    const { email, milestone_title, milestone_date } = req.body;

    if (!email || !milestone_title) {
        return res.status(400).render('milestones/mileAdd', { error_message: "Email and title are required." });
    }

    try {
        const participant = await knex("participants").where({ participant_email: email }).first();
        if (!participant) {
            return res.status(400).render('milestones/mileAdd', { error_message: "No participant found with that email." });
        }

        const [newMilestone] = await knex("milestones")
            .insert({
                participant_id: participant.participant_id,
                milestone_title,
                milestone_date: milestone_date || null
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
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
            )
            .where("m.milestone_id", id)
            .first();
        if (!milestone) {
            return res.status(404).render('public/418Code');
        }
        const milestonesForParticipant = await knex("milestones")
            .where({ participant_id: milestone.participant_id })
            .orderBy("milestone_date", "asc")
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
                "p.participant_email"
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
    const { email, milestone_title, milestone_date } = req.body;

    if (!email || !milestone_title) {
        return res.status(400).render('milestones/mileEdit', {
            milestone: { milestone_id: id, email, milestone_title, milestone_date },
            error_message: "Email and title are required."
        });
    }

    try {
        const participant = await knex("participants").where({ participant_email: email }).first();
        if (!participant) {
            return res.status(400).render('milestones/mileEdit', {
                milestone: { milestone_id: id, email, milestone_title, milestone_date },
                error_message: "No participant found with that email."
            });
        }

        await knex("milestones")
            .where({ milestone_id: id })
            .update({
                participant_id: participant.participant_id,
                milestone_title,
                milestone_date: milestone_date || null
            });

        res.redirect(`/milestones/${id}`);
    } catch (error) {
        console.error("Error updating milestone:", error);
        try {
            const milestone = await knex("milestones as m")
                .leftJoin("participants as p", "m.participant_id", "p.participant_id")
                .select("m.*", "p.participant_email")
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
            return res.render('auth/register', { error_message: "Registration failed. Please try again with new values." });
        }

        const pwError = validatePassword(password);
        if (pwError) {
            return res.render('auth/register', { error_message: pwError });
        }

        let hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await knex("users")
            .insert({
                email,
                username,
                password_hash: hashedPassword,
                level: "U"
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
            ? "Registration failed. Cannot use current email."
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
        const user = await knex("users")
            .select("*")
            .where({ username })
            .first();
        if (!user) {
            return res.render('auth/login', { error_message: "Invalid credentials." });
        }

        const users = await knex("users")
        .where("username", user.username)
        .first();

        if (!users) {
            return res.render("login", { error_message: "Invalid login" });
        }
        let validPassword = await bcrypt.compare(password, users.password_hash);

        if (!validPassword) {
            return res.render("login", { error_message: "Invalid login" });
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
        participant_first_name,
        participant_last_name,
        participant_email,
        participant_dob,
        phone,
        city,
        state,
        zip,
        participant_school_or_employer,
        participant_field_of_interest
    } = req.body;

    if (! participant_first_name || ! participant_last_name || !email) {
        return res.status(400).render('participants/parAdd', {
            error_message: "First name, last name, and email are required."
        });
    }

    try {
        const [newParticipant] = await knex("participants")
            .insert({
                participant_email,
                participant_first_name,
                participant_last_name,
                participant_dob: participant_dob || null,
                phone,
                city,
                state,
                zip,
                participant_school_or_employer,
                participant_field_of_interest,
                role: "participant"
            })
            .returning("*");

        res.redirect(`/participants/${newParticipant.participant_id}`);
    } catch (error) {
        console.error("Error creating participant:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "Registration failed. Cannot use current email."
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
        participant_first_name,
        participant_last_name,
        participant_email,
        participant_dob,
        phone,
        city,
        state,
        zip,
        participant_school_or_employer,
        participant_field_of_interest
    } = req.body;

    if (!participant_first_name || !participant_last_name || !participant_email) {
        return res.status(400).render('participants/parEdit', {
            participant: {
                participant_id: id,
                participant_first_name,
                participant_last_name,
                participant_email,
                participant_dob,
                phone,
                city,
                state,
                zip,
                participant_school_or_employer,
                participant_field_of_interest
            },
            error_message: "First name, last name, and email are required."
        });
    }

    try {
        const [updatedParticipant] = await knex("participants")
            .where({ participant_id: id })
            .update({
                participant_first_name,
                participant_last_name,
                participant_email,
                participant_dob,
                phone,
                city,
                state,
                zip,
                participant_school_or_employer,
                participant_field_of_interest
            })
            .returning("*");

        res.redirect(`/participants/${updatedParticipant.participant_id}`);
    } catch (error) {
        console.error("Error updating participant:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "Registration failed. Cannot use current email."
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

app.post('/participants/:id/delete',requireManager, async (req, res) => {
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
        let password_hash = await bcrypt.hash(password, 10);
        await knex("users").insert({
            username,
            email,
            password_hash,
            level: level || 'U'
        });
        res.redirect('/users');
    } catch (error) {
        console.error("Error creating user:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "Registration failed. Cannot use username or email."
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
        let password_hash = await bcrypt.hash(password, 10);
        const [updated] = await knex("users")
            .where({ user_id: id })
            .update({
                username,
                email,
                password_hash,
                level: level || 'U'
            })
            .returning("*");
        res.redirect('/users');
    } catch (error) {
        console.error("Error updating user:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "Registration failed. Cannot use username or email."
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

// Events (templates + occurrences)
app.get('/events', async (req, res) => {
    try {
        const events = await knex("event_occurences as o")
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "o.*",
                "t.event_template_id",
                "t.event_name",
                "t.event_type",
                "t.event_description",
                "t.event_recurrence_pattern",
                "t.default_capacity"
            )
            .orderBy("o.event_occurence_id", "asc");
        res.render('events/events', { events });
    } catch (error) {
        console.error("Error loading events:", error);
        res.status(500).send("Error loading events");
    }
});

app.get('/events/new', async (req, res) => {
    try {
        const templates = await knex("event_templates").select("*").orderBy("event_template_id", "asc");
        res.render('events/eventAdd', { error_message: null, templates });
    } catch (error) {
        console.error("Error loading templates:", error);
        res.status(500).send("Error loading templates");
    }
});

app.post('/events/new', async (req, res) => {
    const {
        event_template_id,
        event_date_time_start,
        event_date_time_end,
        even_location,
        event_capacity,
        event_registration_deadline
    } = {
        event_template_id: req.body.eventtemplateid,
        event_date_time_start: req.body.eventdatetimestart,
        event_date_time_end: req.body.eventdatetimeend,
        even_location: req.body.eventlocation,
        event_capacity: req.body.eventcapacity,
        event_registration_deadline: req.body.eventregistrationdeadline
    };

    try {
        if (!event_template_id) {
            const templates = await knex("event_templates").select("*");
            return res.status(400).render('events/eventAdd', { error_message: "Please choose an event template.", templates });
        }
        const [created] = await knex("event_occurences")
            .insert({
                event_template_id,
                event_date_time_start: event_date_time_start || null,
                event_date_time_end: event_date_time_end || null,
                even_location,
                event_capacity: event_capacity || null,
                event_registration_deadline: event_registration_deadline || null
            })
            .returning("*");
        res.redirect(`/events/${created.event_occurence_id}`);
    } catch (error) {
        console.error("Error creating event occurrence:", error);
        const templates = await knex("event_templates").select("*");
        res.status(500).render('events/eventAdd', { error_message: "Could not create event. Please try again.", templates });
    }
});

app.get('/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const event = await knex("event_occurences as o")
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "o.*",
                "t.event_template_id",
                "t.event_name",
                "t.event_type",
                "t.event_description",
                "t.event_recurrence_pattern",
                "t.default_capacity"
            )
            .where("o.event_occurence_id", id)
            .first();
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
        const event = await knex("event_occurences as o")
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "o.*",
                "t.event_template_id",
                "t.event_name",
                "t.event_type",
                "t.event_description",
                "t.event_recurrence_pattern",
                "t.default_capacity"
            )
            .where("o.event_occurence_id", id)
            .first();
        if (!event) {
            return res.status(404).render('public/418Code');
        }
        const templates = await knex("event_templates").select("*").orderBy("event_template_id", "asc");
        res.render('events/eventEdit', { event, templates, error_message: null });
    } catch (error) {
        console.error("Error loading event:", error);
        res.status(500).send("Error loading event");
    }
});

app.post('/events/:id/edit', async (req, res) => {
    const { id } = req.params;
    const {
        event_template_id,
        event_date_time_start,
        event_date_time_end,
        even_location,
        event_capacity,
        event_registration_deadline
    } = {
        event_template_id: req.body.eventtemplateid,
        event_date_time_start: req.body.eventdatetimestart,
        event_date_time_end: req.body.eventdatetimeend,
        even_location: req.body.eventlocation,
        event_capacity: req.body.eventcapacity,
        event_registration_deadline: req.body.eventregistrationdeadline
    };

    try {
        if (!event_template_id) {
            const templates = await knex("event_templates").select("*");
            return res.status(400).render('events/eventEdit', {
                event: {
                    event_occurence_id: id,
                    event_template_id,
                    event_date_time_start,
                    event_date_time_end,
                    even_location,
                    event_capacity,
                    event_registration_deadline
                },
                templates,
                error_message: "Please choose an event template."
            });
        }

        await knex("event_occurences")
            .where({ event_occurence_id: id })
            .update({
                event_template_id,
                event_date_time_start: event_date_time_start || null,
                event_date_time_end: event_date_time_end || null,
                even_location,
                event_capacity: event_capacity || null,
                event_registration_deadline: event_registration_deadline || null
            });
        res.redirect(`/events/${id}`);
    } catch (error) {
        console.error("Error updating event:", error);
        try {
            const event = await knex("event_occurences as o")
                .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
                .select(
                    "o.*",
                    "t.event_template_id",
                    "t.event_name",
                    "t.event_type",
                    "t.event_description",
                    "t.event_recurrence_pattern",
                    "t.default_capacity"
                )
                .where("o.event_occurence_id", id)
                .first();
            const templates = await knex("event_templates").select("*");
            res.status(500).render('events/eventEdit', { event, templates, error_message: "Could not update event. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading event");
        }
    }
});

app.post('/events/:id/delete',requireManager, async (req, res) => {
    const { id } = req.params;
    try {
        await knex("event_occurences").where({ event_occurence_id: id }).del();
        res.redirect('/events');
    } catch (error) {
        console.error("Error deleting event:", error);
        res.status(500).send("Error deleting event");
    }
});

// Surveys
app.get('/surveys', async (req, res) => {
    try {
        const surveys = await knex("surveys as s")
            .leftJoin("participants as p", "s.participant_id", "p.participant_id")
            .leftJoin("event_occurences as o", "s.event_occurence_id", "o.event_occurence_id")
            .leftJoin("event_templates as e", "o.event_template_id", "e.event_template_id")
            .select(
                "s.*",
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name"),
                "e.event_name"
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
        comments,
        submission_date
    } = req.body;

    if (!participant_id || !event_id) {
        return res.status(400).render('surveys/surAdd', { error_message: "Participant and event are required." });
    }

    try {
        const [newSurvey] = await knex("surveys")
            .insert({
                participant_id,
                event_occurence_id: event_id,
                satisfaction_score: satisfaction_score || null,
                usefulness_score: usefulness_score || null,
                instructor_score: instructor_score || null,
                recommendation_score: recommendation_score || null,
                survey_comments: comments,
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
        const survey = await knex("surveys as s")
            .leftJoin("participants as p", "s.participant_id", "p.participant_id")
            .leftJoin("events as e", "s.event_occurence_id", "e.event_id")
            .select(
                "s.*",
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name"),
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
        const survey = await knex("surveys").where({ survey_id: id }).first();
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
                comments,
                submission_date
            },
            error_message: "Participant and event are required."
        });
    }

    try {
        await knex("surveys")
            .where({ survey_id: id })
            .update({
                participant_id,
                event_occurence_id: event_id,
                satisfaction_score: satisfaction_score || null,
                usefulness_score: usefulness_score || null,
                instructor_score: instructor_score || null,
                recommendation_score: recommendation_score || null,
                survey_comments: comments,
                submission_date: submission_date || null
            });
        res.redirect(`/surveys/${id}`);
    } catch (error) {
        console.error("Error updating survey:", error);
        try {
            const survey = await knex("surveys").where({ survey_id: id }).first();
            res.status(500).render('surveys/surEdit', { survey, error_message: "Could not update survey. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading survey");
        }
    }
});

app.post('/surveys/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await knex("surveys").where({ survey_id: id }).del();
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


