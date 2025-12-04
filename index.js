// TO DO 

// requirements to set up all dev and production stuff
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
const { sendPasswordReset, sendNewDeviceAlert, sendEventReminder} = require('./email/emailService');
const crypto = require('crypto'); 
const knex = require("./db");


app.use(session({
    secret: process.env.SESSION_SECRET || "devsecret",
    resave: false,
    saveUninitialized: false
}));

// sets up connections for migrations(script to install database)

app.get('/test-email', async (req, res) => {
  try {
    const user = { email: 'apierceswan@gmail.com', firstName: 'Aiden' };
    const event = {
      name: 'Test Event',
      startTime: new Date(),
      location: 'Test Location'
    };

    await sendEventReminder(user, event);
    res.send('Test email sent.');
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).send('Error sending test email.');
  }
});


// Show forgot password form (you can make a simple EJS view auth/forgot.ejs)
app.get('/forgot-password', (req, res) => {
    res.render('auth/forgot', { error_message: null, success_message: null });
});

// Handle form submit
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.render('auth/forgot', { 
            error_message: "Please enter your email.", 
            success_message: null 
        });
    }

    try {
        const user = await knex("users").where({ email }).first();
        // Always show generic message so you don't leak which emails exist
        if (!user) {
            return res.render('auth/forgot', { 
                error_message: null,
                success_message: "If that email exists, we've sent a reset link."
            });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await knex("password_reset_tokens").insert({
            user_id: user.user_id,
            token_hash: token,
            expires_at: expiresAt
        });

        await sendPasswordReset(
            { email: user.email, firstName: user.username || 'User' },
            token
        );

        res.render('auth/forgot', { 
            error_message: null,
            success_message: "If that email exists, we've sent a reset link."
        });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).render('auth/forgot', { 
            error_message: "Server error. Please try again.",
            success_message: null 
        });
    }
});


// Show reset form
app.get('/reset-password', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send("Missing token.");
    }

    try {
        const record = await knex("password_reset_tokens")
            .where({ token_hash: token })
            .andWhere("expires_at", ">", new Date())
            .andWhere(function () {
                this.whereNull("used_at");
            })
            .first();

        if (!record) {
            return res.status(400).send("Invalid or expired token.");
        }

        res.render('auth/reset', { token, error_message: null });
    } catch (error) {
        console.error("Reset password GET error:", error);
        res.status(500).send("Server error.");
    }
});


// Show reset form
app.get('/reset-password', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send("Missing token.");
    }

    try {
        const record = await knex("password_reset_tokens")
            .where({ token_hash: token })
            .andWhere("expires_at", ">", new Date())
            .andWhere(function () {
                this.whereNull("used_at");
            })
            .first();

        if (!record) {
            return res.status(400).send("Invalid or expired token.");
        }

        res.render('auth/reset', { token, error_message: null });
    } catch (error) {
        console.error("Reset password GET error:", error);
        res.status(500).send("Server error.");
    }
});

// Handle reset form submit
app.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).render('auth/reset', { 
            token,
            error_message: "Password is required."
        });
    }

    try {
        const record = await knex("password_reset_tokens")
            .where({ token_hash: token })
            .andWhere("expires_at", ">", new Date())
            .andWhere(function () {
                this.whereNull("used_at");
            })
            .first();

        if (!record) {
            return res.status(400).render('auth/reset', { 
                token: null,
                error_message: "Invalid or expired token."
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        await knex.transaction(async trx => {
            await trx("users")
                .where({ user_id: record.user_id })
                .update({ password_hash: hashed });

            await trx("password_reset_tokens")
                .where({ id: record.id })
                .update({ used_at: new Date() });
        });

        res.redirect('/login');
    } catch (error) {
        console.error("Reset password POST error:", error);
        res.status(500).render('auth/reset', { 
            token,
            error_message: "Server error. Please try again."
        });
    }
});




// installs helmet - used to delcare headers to pretect other aspects of the code
app.use(helmet());


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
    "default-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https://public.tableau.com http://public.tableau.com; " +
    "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https://public.tableau.com http://public.tableau.com; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://public.tableau.com http://public.tableau.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://public.tableau.com http://public.tableau.com https://fonts.googleapis.com; " +
    "frame-src 'self' https://public.tableau.com http://public.tableau.com; " +
    "default-src 'self' https://ella-rises.com https://www.ella-rises.com; " +
    "connect-src 'self' https://ella-rises.com https://www.ella-rises.com; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com;"
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

// Expose session flags to views
app.use((req, res, next) => {
    res.locals.isLoggedIn = !!req.session.isLoggedIn;
    res.locals.userLevel = req.session.level || 'U';
    next();
});

// Middleware to expose participantRole to views
app.use(async (req, res, next) => {
    try {
        res.locals.participantRole = null;

        if (req.session.userEmail) {
            const participant = await knex("participants")
                .where({ participant_email: req.session.userEmail })
                .first();

            if (participant) {
                res.locals.participantRole = participant.role;
            }
        }
    } catch (err) {
        console.error("Error loading participant role:", err);
    }
    next();
});

// Global authentication middleware - runs on EVERY request
app.use((req, res, next) => {
    // Skip authentication for login routes
    if (req.path === '/' || req.path === '/login' || req.path === '/logout' ||
        req.path === '/register'||
        req.path === '/donations'||
        req.path === '/index' ||
        req.path === '/teapot' ||
        req.path === '/donAdd'||
        req.path === '/about'||
        req.path === '/contact'||
        req.path === '/donations/select' ||
        req.path === '/donations/participant-info'||
        req.path === '/donations/complete') {
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


app.get('/', async (req, res) => {
  try {
    // Fetch the next 3 upcoming event occurrences (start >= now), joined with their templates
    const rows = await knex('event_occurences as o')
      .leftJoin('event_templates as t', 'o.event_template_id', 't.event_template_id')
      .select(
        'o.event_occurence_id as occurence_id',
        't.event_template_id as template_id',
        't.event_name',
        't.event_description',
        't.event_type',
        'o.event_date_time_start',
        'o.event_date_time_end',
        'o.event_location',
        'o.event_capacity',
        'o.event_registration_deadline'
      )
      .where('o.event_date_time_start', '>=', new Date())
      .orderBy('o.event_date_time_start', 'asc')
      .limit(3);

    // Map to the shape the EJS expects
    const events = rows.map(r => {
      const start = r.event_date_time_start ? new Date(r.event_date_time_start) : null;
      const date_display = start ? start.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';
      return {
        id: r.occurence_id,
        template_id: r.template_id,
        name: r.event_name,
        description: r.event_description,
        type: r.event_type,
        date: r.event_date_time_start ? new Date(r.event_date_time_start).toISOString() : null,
        date_display,
        location: r.event_location || 'TBD',
        capacity: r.event_capacity,
        registration_deadline: r.event_registration_deadline
      };
    });

    res.render('public/landing', { events });
  } catch (err) {
    console.error('Error loading homepage events:', err);
    // Render the landing page with an empty events array so the template still works
    res.render('public/landing', { events: [] });
  }
});

app.get('/donations', async (req, res) => {
    try {
        // If user is a manager, show all donations
        if (req.session.level === 'M') {
            const donations = await knex("donations as d")
                .leftJoin("participants as p", "d.participant_id", "p.participant_id")
                .select(
                    "d.*",
                    knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
                )
                .orderBy("d.donation_id", "desc");
            return res.render('donations/donations', { donations });
        }

        // For regular users, show only their own donations
        const email = req.session.userEmail;
        if (!email) {
            return res.render('donations/donations', { donations: [] });
        }

        const participant = await knex("participants")
            .where({ participant_email: email })
            .first();

        if (!participant) {
            return res.render('donations/donations', { donations: [] });
        }

        const donations = await knex("donations")
            .where({ participant_id: participant.participant_id })
            .orderBy("donation_id", "desc");

        return res.render('donations/donations', { donations });
    } catch (error) {
        console.error("Error loading donations:", error);
        res.status(500).send("Error loading donations");
    }
});

// Registrations
app.get('/registrations', async (req, res) => {
    try {
        const registrations = await knex("registrations as r")
            .leftJoin("participants as p", "r.participant_id", "p.participant_id")
            .leftJoin("event_occurences as o", "r.event_occurence_id", "o.event_occurence_id")
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "r.*",
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name"),
                "p.participant_email",
                "o.event_date_time_start",
                "o.event_location",
                "t.event_name"
            )
            .orderBy("r.registration_id", "desc");
        res.render('registrations/registrations', { registrations });
    } catch (error) {
        console.error("Error loading registrations:", error);
        res.status(500).send("Error loading registrations");
    }
});

app.get('/registrations/:id/edit', requireManager, async (req, res) => {
    const { id } = req.params;
    try {
        const registration = await knex("registrations as r")
            .leftJoin("participants as p", "r.participant_id", "p.participant_id")
            .leftJoin("event_occurences as o", "r.event_occurence_id", "o.event_occurence_id")
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "r.*",
                knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name"),
                "p.participant_email",
                "o.event_date_time_start",
                "o.event_location",
                "t.event_name"
            )
            .where("r.registration_id", id)
            .first();

        if (!registration) {
            return res.status(404).render('public/418Code');
        }

        res.render('registrations/regEdit', { registration, error_message: null });
    } catch (error) {
        console.error("Error loading registration:", error);
        res.status(500).send("Error loading registration");
    }
});

app.post('/registrations/:id/edit', requireManager, async (req, res) => {
    const { id } = req.params;
    const {
        registration_status,
        registration_attended_flag,
        registration_check_in_time
    } = req.body;

    try {
        await knex("registrations")
            .where({ registration_id: id })
            .update({
                registration_status: registration_status || null,
                registration_attended_flag: registration_attended_flag === 'true',
                registration_check_in_time: registration_check_in_time || null
            });
        res.redirect('/registrations');
    } catch (error) {
        console.error("Error updating registration:", error);
        try {
            const registration = await knex("registrations as r")
                .leftJoin("participants as p", "r.participant_id", "p.participant_id")
                .leftJoin("event_occurences as o", "r.event_occurence_id", "o.event_occurence_id")
                .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
                .select(
                    "r.*",
                    knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name"),
                    "p.participant_email",
                    "o.event_date_time_start",
                    "o.event_location",
                    "t.event_name"
                )
                .where("r.registration_id", id)
                .first();
            res.status(500).render('registrations/regEdit', { registration, error_message: "Could not update registration. Please try again." });
        } catch (loadErr) {
            res.status(500).send("Error loading registration");
        }
    }
});


// Replace the existing /donations GET route with this:
app.get('/donAdd', (req, res) => {
    res.render('donations/donAdd', { 
        error_message: null,
        isLoggedIn: req.session.isLoggedIn || false
    });
});
// Handle donation amount selection
app.post('/donations/select', async (req, res) => {
    const { donation_amount } = req.body;
    
    if (!donation_amount || donation_amount <= 0) {
        return res.render('donations/donations', { 
            error_message: "Please select a valid donation amount.",
            isLoggedIn: req.session.isLoggedIn || false
        });
    }
    
    try {
        // Check if user is logged in
        if (req.session.isLoggedIn && req.session.userEmail) {
            // Check if they're a participant
            const participant = await knex("participants")
                .where({ participant_email: req.session.userEmail })
                .first();
            
            if (participant) {
                // Existing participant - go straight to payment
                return res.render('donations/donPayment', {
                    donationAmount: parseFloat(donation_amount).toFixed(2),
                    participantId: participant.participant_id,
                    participantFirstName: participant.participant_first_name,
                    participantLastName: participant.participant_last_name,
                    participantEmail: participant.participant_email,
                    participantPhone: participant.phone
                });
            } else {
                // Logged in but not a participant - collect info with email pre-filled
                return res.render('donations/donParticipantInfo', {
                    donationAmount: parseFloat(donation_amount).toFixed(2),
                    userEmail: req.session.userEmail,
                    error_message: null
                });
            }
        }
        
        // Not logged in - collect all info including email
        res.render('donations/donParticipantInfo', {
            donationAmount: parseFloat(donation_amount).toFixed(2),
            userEmail: null,
            error_message: null
        });
        
    } catch (error) {
        console.error("Error processing donation selection:", error);
        res.status(500).render('donations/donations', { 
            error_message: "An error occurred. Please try again.",
            isLoggedIn: req.session.isLoggedIn || false
        });
    }
});

// Handle participant info submission
app.post('/donations/participant-info', async (req, res) => {
    const { donation_amount, participant_email, participant_first_name, participant_last_name, phone } = req.body;
    
    // Validate required fields
    if (!donation_amount || !participant_email || !participant_first_name || !participant_last_name) {
        return res.render('donations/donParticipantInfo', {
            donationAmount: donation_amount,
            userEmail: req.session.userEmail || null,
            error_message: "Email, first name, and last name are required."
        });
    }
    
    try {
        // Check if participant already exists
        let participant = await knex("participants")
            .where({ participant_email })
            .first();
        
        if (participant) {
            // Existing participant - go to payment with their ID
            return res.render('donations/donPayment', {
                donationAmount: parseFloat(donation_amount).toFixed(2),
                participantId: participant.participant_id,
                participantFirstName: participant.participant_first_name,
                participantLastName: participant.participant_last_name,
                participantEmail: participant.participant_email,
                participantPhone: participant.phone
            });
        } else {
            // New participant - go to payment page with info to create participant on confirmation
            return res.render('donations/donPayment', {
                donationAmount: parseFloat(donation_amount).toFixed(2),
                participantId: null, // Signal that we need to create participant
                participantFirstName: participant_first_name,
                participantLastName: participant_last_name,
                participantEmail: participant_email,
                participantPhone: phone
            });
        }
        
    } catch (error) {
        console.error("Error processing participant info:", error);
        res.status(500).render('donations/donParticipantInfo', {
            donationAmount: donation_amount,
            userEmail: req.session.userEmail || null,
            error_message: "An error occurred. Please try again."
        });
    }
});



app.post('/donations/complete', async (req, res) => {
    const { 
        donation_amount, 
        participant_id, 
        create_participant,
        participant_email,
        participant_first_name,
        participant_last_name,
        phone
    } = req.body;
    
    if (!donation_amount) {
        return res.redirect('/donations');
    }
    
    try {
        let finalParticipantId = participant_id;
        let finalParticipantEmail = participant_email;
        let finalParticipantName = '';
        
        // If we need to create a new participant (they're a NEW donor, not an existing participant)
        if (create_participant === 'true' && !participant_id) {
            const [newParticipant] = await knex("participants")
                .insert({
                    participant_email,
                    participant_first_name,
                    participant_last_name,
                    phone: phone || null,
                    role: "donor"  // Brand new donors get just "donor" role
                })
                .returning("*");
            
            finalParticipantId = newParticipant.participant_id;
            finalParticipantEmail = newParticipant.participant_email;
            finalParticipantName = `${newParticipant.participant_first_name} ${newParticipant.participant_last_name}`;
        } else {
            // Get existing participant info
            const participant = await knex("participants")
                .where({ participant_id: finalParticipantId })
                .first();
            
            if (participant) {
                finalParticipantEmail = participant.participant_email;
                finalParticipantName = `${participant.participant_first_name} ${participant.participant_last_name}`;
                
                // Update EXISTING participant's role to include donor
                const currentRole = participant.role || 'participant';
                
                // Only update if they don't already have donor in their role
                if (!currentRole.includes('donor')) {
                    const newRole = currentRole === 'participant' 
                        ? 'participant/donor' 
                        : `${currentRole}/donor`;
                    
                    await knex("participants")
                        .where({ participant_id: finalParticipantId })
                        .update({ role: newRole });
                }
            }
        }
        
        // Create the donation record
        const donationDate = new Date().toISOString().split('T')[0];
        await knex("donations").insert({
            participant_id: finalParticipantId,
            donation_date: donationDate,
            donation_amount: parseFloat(donation_amount)
        });
        
        // Format date for display
        const formattedDate = new Date(donationDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        // Render thank you page
        res.render('donations/donThankYou', {
            donationAmount: parseFloat(donation_amount).toFixed(2),
            participantName: finalParticipantName,
            participantEmail: finalParticipantEmail,
            donationDate: formattedDate,
            isLoggedIn: req.session.isLoggedIn || false
        });
        
    } catch (error) {
        console.error("Error completing donation:", error);
        
        // Check for duplicate email error
        if (error.code === '23505' && error.constraint === 'participants_participant_email_unique') {
            // Email already exists - they must be an existing participant, so add donor role
            try {
                const participant = await knex("participants")
                    .where({ participant_email })
                    .first();
                
                if (participant) {
                    // Update their role to include donor if needed
                    const currentRole = participant.role || 'participant';
                    if (!currentRole.includes('donor')) {
                        const newRole = currentRole === 'participant' 
                            ? 'participant/donor' 
                            : `${currentRole}/donor`;
                        
                        await knex("participants")
                            .where({ participant_id: participant.participant_id })
                            .update({ role: newRole });
                    }
                    
                    const donationDate = new Date().toISOString().split('T')[0];
                    await knex("donations").insert({
                        participant_id: participant.participant_id,
                        donation_date: donationDate,
                        donation_amount: parseFloat(donation_amount)
                    });
                    
                    const formattedDate = new Date(donationDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    
                    return res.render('donations/donThankYou', {
                        donationAmount: parseFloat(donation_amount).toFixed(2),
                        participantName: `${participant.participant_first_name} ${participant.participant_last_name}`,
                        participantEmail: participant.participant_email,
                        donationDate: formattedDate,
                        isLoggedIn: req.session.isLoggedIn || false
                    });
                }
            } catch (retryError) {
                console.error("Error on retry:", retryError);
            }
        }
        
        res.status(500).send("Error completing donation. Please contact support.");
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
    const {  participant_first_name,  participant_last_name, participant_email, donation_date, donation_amount } = req.body;

    if (! participant_first_name || ! participant_last_name || !participant_email || !donation_amount) {
        return res.status(400).render('donations/donEdit', {
            donation: { donation_id: id,  participant_first_name,  participant_last_name, participant_email, donation_date, donation_amount },
            error_message: "Please fill in name, email, and donation_amount."
        });
    }

    try {
        const participant = await knex("participants").where({ participant_email: participant_email }).first();
        if (!participant) {
            return res.status(400).render('donations/donEdit', {
                donation: { donation_id: id,  participant_first_name,  participant_last_name, participant_email, donation_date, donation_amount },
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
                    "p.participant_email",
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
        // If manager, show all milestones
        if (req.session.level === 'M') {
            const milestones = await knex("milestones as m")
                .leftJoin("participants as p", "m.participant_id", "p.participant_id")
                .select(
                    "m.*",
                    knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name")
                )
                .orderBy("m.milestone_id", "desc");

            return res.render('milestones/milestones', { milestones });
        }

        // If user, show only their own milestones
        const email = req.session.userEmail;
        if (!email) {
            return res.render('milestones/milestones', { milestones: [] });
        }

        const participant = await knex("participants")
            .where({ participant_email: email })
            .first();

        if (!participant) {
            return res.render('milestones/milestones', { milestones: [] });
        }

        const milestones = await knex("milestones")
            .where({ participant_id: participant.participant_id })
            .orderBy("milestone_id", "desc");

        return res.render('milestones/milestones', { milestones });
    } catch (error) {
        console.error("Error loading milestones:", error);
        res.status(500).send("Error loading milestones");
    }
});

app.get('/milestones/new', (req, res) => {
    res.render('milestones/mileAdd', { error_message: null });
});

app.post('/milestones/new', async (req, res) => {
    const { participant_email, milestone_title, milestone_date } = req.body;

    if (!participant_email || !milestone_title) {
        return res.status(400).render('milestones/mileAdd', { error_message: "Email and title are required." });
    }

    try {
        const participant = await knex("participants").where({ participant_email: participant_email }).first();
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
        res.render('milestones/mileDetail', { milestone, milestonesForParticipant, returnTo: `/milestones/${id}` });
    } catch (error) {
        console.error("Error loading milestone:", error);
        res.status(500).send("Error loading milestone");
    }
});

app.get('/milestones/participant/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const participant = await knex("participants")
            .select("*")
            .where({ participant_id: id })
            .first();

        if (!participant) {
            return res.status(404).render('public/418Code');
        }

        res.render('milestones/milestonePartcipant', { participant, returnTo: '/milestones' });
    } catch (error) {
        console.error("Error loading milestone participant:", error);
        res.status(500).send("Error loading milestone participant");
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
    const { participant_email, milestone_title, milestone_date } = req.body;

    if (!participant_email || !milestone_title) {
        return res.status(400).render('milestones/mileEdit', {
            milestone: { milestone_id: milestone_id, participant_email, milestone_title, milestone_date },
            error_message: "Email and title are required."
        });
    }

    try {
        const participant = await knex("participants").where({ participant_email: participant_email }).first();
        if (!participant) {
            return res.status(400).render('milestones/mileEdit', {
                milestone: { milestone_id: milestone_id, participant_email, milestone_title, milestone_date },
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

app.post('/milestones/:id/delete', requireManager, async (req, res) => {
    const { id } = req.params;
    try {
        await knex("milestones")
            .where({ milestone_id: id })
            .del();
        res.redirect('/milestones');
    } catch (error) {
        console.error("Error deleting milestone:", error);
        res.status(500).send("Error deleting milestone");
    }
});

app.get('/register', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/');
    }
    res.render('auth/register', { error_message: null, error_field: null, formValues: { email: "", username: "", password: "" } });
});

app.post('/register', async (req, res) => {
    const { email, username, password } = req.body;
    const formValues = { email, username, password };

    if (!email || !username || !password) {
        return res.render('auth/register', {
            error_message: "Please enter an email, username, and password.",
            error_field: !email ? "email" : !username ? "username" : "password",
            formValues
        });
    }

    try {
        // Prevent duplicate usernames or emails
        const existingUser = await knex("users")
            .where({ username })
            .orWhere({ email })
            .first();

        if (existingUser) {
            return res.render('auth/register', {
                error_message: existingUser.username === username
                    ? "That username has already been taken."
                    : "That email is already registered.",
                error_field: existingUser.username === username ? "username" : "email",
                formValues
            });
        }

        const pwError = validatePassword(password);
        if (pwError) {
            return res.render('auth/register', { error_message: pwError, error_field: "password", formValues });
        }

        let hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await knex("users")
            .insert({
                email,
                username,
                // store hashed password in the DB column that exists
                password_hash: hashedPassword,
                level: "U"
            })
            .returning("*");

        req.session.isLoggedIn = true;
        req.session.userId = newUser.user_id;
        req.session.username = newUser.username;
        req.session.role = newUser.role || 'user';
        req.session.level = newUser.level || 'U';
        req.session.userEmail = newUser.email

        res.redirect('/');
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).render('auth/register', { error_message: "Server error. Please try again.", error_field: null, formValues });
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

        // Fail fast if user not found or hash missing
        if (!user) {
            return res.render('auth/login', { error_message: "Invalid credentials." });
        }

        const storedHash = user.password || user.password_hash;

        if (!storedHash) {
            return res.render('auth/login', { error_message: "Invalid credentials." });
        }

        const validPassword = await bcrypt.compare(password, storedHash);

        if (!validPassword) {
            return res.render('auth/login', { error_message: "Invalid credentials." });
        }

        req.session.isLoggedIn = true;
        req.session.userId = user.user_id;
        req.session.username = user.username;
        req.session.userEmail = user.email;
        req.session.level = user.level || 'U';


        const deviceInfo = {
        device: req.headers['user-agent'] || 'Unknown device',
        ip: req.ip,
        time: new Date().toISOString(),
        };

        // fire-and-forget, don't block the redirect
        sendNewDeviceAlert(
        { email: user.email, firstName: user.username || user.first_name || 'User' },
        deviceInfo
        ).catch(console.error);

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

    if (! participant_first_name || ! participant_last_name || !participant_email) {
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
    const returnTo = req.query.return || req.query.returnTo || req.query.from || null;

    try {
        const participant = await knex("participants as p")
            .leftJoin("donations as d", "p.participant_id", "d.participant_id")
            .select(
                "p.*",
                knex.raw("COALESCE(SUM(d.donation_amount), 0) AS total_donations")
            )
            .where("p.participant_id", id)
            .groupBy("p.participant_id")
            .first();

        if (!participant) {
            return res.status(404).render('public/418Code');
        }

        // If user is not manager, block access
        if (req.session.level !== 'M') {
            return res.status(403).send("Not authorized");
        }

        // Fetch milestones for this participant
        const milestones = await knex("milestones")
            .where({ participant_id: id })
            .orderBy("milestone_date", "desc");

        res.render('participants/parDetail', {
            participant,
            milestones,
            returnTo,
            userLevel: req.session.userLevel || req.session.level
        });
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
    res.render('userDashboard/userAdd', {
        error_message: null,
        error_field: null,
        formValues: { username: "", email: "", password: "", level: "U" }
    });
});

app.post('/users/new', requireManager, async (req, res) => {
    const { username, email, password, level } = req.body;
    const formValues = { username, email, password, level: level || 'U' };
    if (!username || !email || !password) {
        return res.status(400).render('userDashboard/userAdd', {
            error_message: "Username, email, and password are required.",
            error_field: !username ? "username" : !email ? "email" : "password",
            formValues
        });
    }
    if (password.length < 8) {
        return res.status(400).render('userDashboard/userAdd', {
            error_message: "Password is too short.",
            error_field: "password",
            formValues
        });
    }
    try {
        const existing = await knex("users").where({ username }).first();
        if (existing) {
            return res.status(400).render('userDashboard/userAdd', {
                error_message: "That username has already been taken.",
                error_field: "username",
                formValues
            });
        }
        const existingEmail = await knex("users").where({ email }).first();
        if (existingEmail) {
            return res.status(400).render('userDashboard/userAdd', {
                error_message: "That email is already registered.",
                error_field: "email",
                formValues
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await knex("users").insert({
            username,
            email,
            password_hash: hashedPassword,
            level: level || 'U'
        });
        res.redirect('/users');
    } catch (error) {
        console.error("Error creating user:", error);
        const duplicateErr = error.code === "23505";
        const message = duplicateErr
            ? "That username or email is already registered."
            : "Could not create user. Please try again.";
        res.status(500).render('userDashboard/userAdd', { error_message: message, error_field: "username", formValues });
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const [updated] = await knex("users")
            .where({ user_id: id })
            .update({
                username,
                email,
                password_hash: hashedPassword,
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
        event_location,
        event_capacity,
        event_registration_deadline
    } = {
        event_template_id: req.body.event_template_id,
        event_date_time_start: req.body.event_date_time_start,
        event_date_time_end: req.body.event_date_time_end,
        event_location: req.body.event_location,
        event_capacity: req.body.event_capacity,
        event_registration_deadline: req.body.event_registration_deadline
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
                event_location,
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
        event_location,
        event_capacity,
        event_registration_deadline
    } = {
        event_template_id: req.body.event_template_id,
        event_date_time_start: req.body.event_date_time_start,
        event_date_time_end: req.body.event_date_time_end,
        event_location: req.body.event_location,
        event_capacity: req.body.event_capacity,
        event_registration_deadline: req.body.event_registration_deadline
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
                    event_location,
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
                event_location,
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
        // MANAGER: show all surveys (join through occurrences -> templates to get template.event_name)
        if (req.session.level === 'M') {
            const surveys = await knex("surveys as s")
                .leftJoin("participants as p", "s.participant_id", "p.participant_id")
                .leftJoin("event_occurences as o", "s.event_occurence_id", "o.event_occurence_id")
                .leftJoin("event_templates as e", "o.event_template_id", "e.event_template_id")
                .select(
                    "s.*",
                    knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) AS participant_name"),
                    "e.event_name as event_name"
                )
                .orderBy("s.survey_id", "desc");

            return res.render("surveys/surveys", { surveys, userLevel: req.session.level });
        }

        // USER: show ONLY their own surveys
        const email = req.session.userEmail;
        if (!email) {
            return res.render("surveys/surveys", { surveys: [], userLevel: req.session.level });
        }

        const participant = await knex("participants")
            .where({ participant_email: email })
            .first();

        if (!participant) {
            return res.render("surveys/surveys", { surveys: [], userLevel: req.session.level });
        }

        const surveys = await knex("surveys as s")
            .leftJoin("event_occurences as o", "s.event_occurence_id", "o.event_occurence_id")
            .leftJoin("event_templates as e", "o.event_template_id", "e.event_template_id")
            .select(
                "s.*",
                "e.event_name as event_name"
            )
            .where("s.participant_id", participant.participant_id)
            .orderBy("s.survey_id", "desc");

        return res.render("surveys/surveys", { surveys, userLevel: req.session.level });

    } catch (error) {
        console.error("SURVEY LOAD ERROR:", error);
        res.status(500).send("Error loading surveys");
    }
});

app.get('/surveys/new', (req, res) => {
    res.render('surveys/surAdd', { error_message: null });
});

app.post('/surveys/new', async (req, res) => {
    const {
        participant_id,
        event_occurence_id,
        satisfaction_score,
        usefulness_score,
        instructor_score,
        recommendation_score,
        comments,
        submission_date
    } = req.body;

    if (!participant_id || !event_occurence_id) {
        return res.status(400).render('surveys/surAdd', { error_message: "Participant and event are required." });
    }

    try {
        const [newSurvey] = await knex("surveys")
            .insert({
                participant_id,
                event_occurence_id: event_occurence_id,
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
        .leftJoin("event_occurences as o", "s.event_occurence_id", "o.event_occurence_id")
        .leftJoin("event_templates as e", "o.event_template_id", "e.event_template_id")
        .select(
            "s.*",
            knex.raw("CONCAT(COALESCE(p.participant_first_name,''),' ',COALESCE(p.participant_last_name,'')) as participant_name"),
            "e.event_name"
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
        event_occurence_id,
        satisfaction_score,
        usefulness_score,
        instructor_score,
        recommendation_score,
        comments,
        submission_date
    } = req.body;

    if (!participant_id || !event_occurence_id) {
        return res.status(400).render('surveys/surEdit', {
            survey: {
                survey_id: id,
                participant_id,
                event_occurence_id,
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
                event_occurence_id: event_occurence_id,
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

// start scheduled email jobs
require('./email/reminderJob');

// Registration/Enrollment Routes
// Replace the existing /enroll routes in your index.js
// Registration/Enrollment Routes
// Replace the existing /enroll routes in your index.js

// Show enrollment page with available events
app.get('/enroll', async (req, res) => {
    try {
        const userEmail = req.session.userEmail;
        
        if (!userEmail) {
            return res.render('auth/login', { 
                error_message: "Please log in to enroll in events" 
            });
        }

        // Check if user is already a participant
        let participant = await knex("participants")
            .where({ participant_email: userEmail })
            .first();

        // If not a participant, redirect to profile completion page
        if (!participant) {
            return res.redirect('/enroll/complete-profile');
        }

        // Check if participant has all required information
        if (!participant.participant_first_name || !participant.participant_last_name) {
            return res.redirect('/enroll/complete-profile');
        }

        // Get available events (registration deadline hasn't passed and not at capacity)
        const now = new Date();
        
        // First, get all events with their registration counts
        let eventsWithCounts = await knex("event_occurences as o")
        
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "o.*",
                "t.event_name",
                "t.event_type",
                "t.event_description",
                "t.default_capacity"
            )
            .where("o.event_registration_deadline", ">", now)
            .orderBy("o.event_date_time_start", "asc");

            // Apply optional filtering from landing page
            const selectedEventName = req.query.event_name;
            if (selectedEventName) {
                eventsWithCounts = eventsWithCounts.filter(
                    ev => ev.event_name === selectedEventName
                );
            }

        // Get registration counts for each event
        const registrationCounts = await knex("registrations")
            .select("event_occurence_id")
            .count("* as count")
            .groupBy("event_occurence_id");

        // Create a map of event_id -> count
        const countMap = {};
        registrationCounts.forEach(r => {
            countMap[r.event_occurence_id] = parseInt(r.count);
        });

        // Filter events that aren't at capacity
        const availableEvents = eventsWithCounts.filter(event => {
            const currentRegistrations = countMap[event.event_occurence_id] || 0;
            const capacity = event.default_capacity || 999;
            return currentRegistrations < capacity;
        }).map(event => ({
            ...event,
            current_registrations: countMap[event.event_occurence_id] || 0
        }));

        // Check which events the user is already registered for
        const userRegistrations = await knex("registrations")
            .where({ participant_id: participant.participant_id })
            .select("event_occurence_id");
        
        const registeredEventIds = userRegistrations.map(r => r.event_occurence_id);

        res.render('enrollment/enroll', { 
            availableEvents,
            registeredEventIds,
            error_message: null 
        });
    } catch (error) {
        console.error("Error loading enrollment page:", error);
        res.status(500).send("Error loading enrollment page");
    }
});

// Show profile completion form
app.get('/enroll/complete-profile', async (req, res) => {
    try {
        const userEmail = req.session.userEmail;
        
        if (!userEmail) {
            return res.render('auth/login', { 
                error_message: "Please log in to enroll in events" 
            });
        }

        // Check if participant already exists
        const participant = await knex("participants")
            .where({ participant_email: userEmail })
            .first();

        res.render('enrollment/completeProfile', { 
            error_message: null,
            participant: participant || { participant_email: userEmail }
        });
    } catch (error) {
        console.error("Error loading profile completion:", error);
        res.status(500).send("Error loading profile completion page");
    }
});

// Handle profile completion submission
app.post('/enroll/complete-profile', async (req, res) => {
    try {
        const userEmail = req.session.userEmail;
        
        if (!userEmail) {
            return res.render('auth/login', { 
                error_message: "Please log in to enroll in events" 
            });
        }

        const {
            participant_first_name,
            participant_last_name,
            participant_dob,
            phone,
            city,
            state,
            zip,
            participant_school_or_employer,
            participant_field_of_interest
        } = req.body;

        // Validate required fields
        if (!participant_first_name || !participant_last_name) {
            const participant = await knex("participants")
                .where({ participant_email: userEmail })
                .first();

            return res.status(400).render('enrollment/completeProfile', {
                error_message: "First name and last name are required.",
                participant: participant || { 
                    participant_email: userEmail,
                    participant_first_name,
                    participant_last_name,
                    participant_dob,
                    phone,
                    city,
                    state,
                    zip,
                    participant_school_or_employer,
                    participant_field_of_interest
                }
            });
        }

        // Check if participant already exists
        const existingParticipant = await knex("participants")
            .where({ participant_email: userEmail })
            .first();

        if (existingParticipant) {
            // Update existing participant
            await knex("participants")
                .where({ participant_email: userEmail })
                .update({
                    participant_first_name,
                    participant_last_name,
                    participant_dob: participant_dob || null,
                    phone: phone || null,
                    city: city || null,
                    state: state || null,
                    zip: zip || null,
                    participant_school_or_employer: participant_school_or_employer || null,
                    participant_field_of_interest: participant_field_of_interest || null
                });
        } else {
            // Create new participant
            await knex("participants")
                .insert({
                    participant_email: userEmail,
                    participant_first_name,
                    participant_last_name,
                    participant_dob: participant_dob || null,
                    phone: phone || null,
                    city: city || null,
                    state: state || null,
                    zip: zip || null,
                    participant_school_or_employer: participant_school_or_employer || null,
                    participant_field_of_interest: participant_field_of_interest || null,
                    role: "participant"
                });
        }

        // Redirect to enrollment page
        res.redirect('/enroll');
    } catch (error) {
        console.error("Error completing profile:", error);
        res.status(500).send("Error completing profile");
    }
});

// Handle enrollment submission
app.post('/enroll', async (req, res) => {
    try {
        const userEmail = req.session.userEmail;
        const { event_occurence_id } = req.body;

        if (!userEmail) {
            return res.render('auth/login', { 
                error_message: "Please log in to enroll in events" 
            });
        }

        if (!event_occurence_id) {
            return res.redirect('/enroll');
        }

        // Get participant
        const participant = await knex("participants")
            .where({ participant_email: userEmail })
            .first();

        if (!participant) {
            return res.redirect('/enroll/complete-profile');
        }

        // Verify event is still available
        const now = new Date();
        const event = await knex("event_occurences as o")
            .leftJoin("event_templates as t", "o.event_template_id", "t.event_template_id")
            .select(
                "o.*",
                "t.event_name",
                "t.event_type",
                "t.default_capacity"
            )
            .where("o.event_occurence_id", event_occurence_id)
            .where("o.event_registration_deadline", ">", now)
            .first();

        if (!event) {
            return res.status(400).send("Event is no longer available for registration");
        }

        // Check capacity
        const registrationCount = await knex("registrations")
            .where({ event_occurence_id })
            .count("* as count")
            .first();

        const currentCount = parseInt(registrationCount.count);
        const maxCapacity = event.default_capacity || 999;

        if (currentCount >= maxCapacity) {
            return res.status(400).send("Event is at full capacity");
        }

        // Check if already registered
        const existingRegistration = await knex("registrations")
            .where({ 
                participant_id: participant.participant_id,
                event_occurence_id 
            })
            .first();

        if (existingRegistration) {
            return res.status(400).send("You are already registered for this event");
        }

        // Create registration
        await knex("registrations").insert({
            participant_id: participant.participant_id,
            event_occurence_id,
            registration_status: "confirmed",
            registration_attended_flag: false,
            registration_created_at: new Date()
        });

        // Redirect to thank you page
        res.render('enrollment/thankYou', { 
            event,
            participant 
        });
    } catch (error) {
        console.error("Error processing enrollment:", error);
        res.status(500).send("Error processing enrollment");
    }
});

// Handle unregistration (delete registration)
app.post('/enroll/unregister', async (req, res) => {
    try {
        const userEmail = req.session.userEmail;
        const { event_occurence_id } = req.body;

        if (!userEmail) {
            return res.render('auth/login', { 
                error_message: "Please log in" 
            });
        }

        if (!event_occurence_id) {
            return res.redirect('/enroll');
        }

        // Get participant
        const participant = await knex("participants")
            .where({ participant_email: userEmail })
            .first();

        if (!participant) {
            return res.redirect('/enroll');
        }

        // Delete the registration
        await knex("registrations")
            .where({ 
                participant_id: participant.participant_id,
                event_occurence_id: event_occurence_id
            })
            .del();

        // Redirect back to enrollment page
        res.redirect('/enroll');
    } catch (error) {
        console.error("Error unregistering:", error);
        res.status(500).send("Error unregistering from event");
    }
});

app.get('/about', (req, res) => {
    res.render('public/about', {
        isLoggedIn: req.session.isLoggedIn || false,
        userLevel: req.session.userLevel || null,
        participantRole: req.session.participantRole || null
    });
});

// Contact page routes
app.get('/contact', (req, res) => {
    res.render('public/contact', {
        isLoggedIn: req.session.isLoggedIn || false,
        userLevel: req.session.userLevel || null,
        participantRole: req.session.participantRole || null
    });
});

app.post('/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Here you could add logic to save the contact form submission to a database
        // or send an email notification
        console.log('Contact form submission:', { name, email, message });

        // For now, just return success
        res.status(200).json({ success: true, message: 'Contact form submitted successfully' });
    } catch (error) {
        console.error('Error processing contact form:', error);
        res.status(500).json({ success: false, message: 'Error submitting contact form' });
    }
});


app.listen(port, () => {
    console.log("The server is listening");
});


