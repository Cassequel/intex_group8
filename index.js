require('dotenv').config();
const express = require("express");
const session = require("express-session");
let path = require("path");
const multer = require("multer");
let bodyParser = require("body-parser");
let app = express();
const bcrypt = require("bcrypt");
const port = process.env.PORT || 3000;
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

app.get('/donations', (req, res) => {
    res.render('donations/donations');
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
            .orderBy("participant_id", "desc");

        res.render("participants/participants", { participants });
    } catch (error) {
        console.error("Error fetching participants:", error);
        res.status(500).send("Error loading participants");
    }
});

app.get('/teapot', (req, res) => {
    res.status(418).render('public/teapot');
  });

app.listen(port, () => {
    console.log("The server is listening");
});


