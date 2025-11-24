//npm install dotenv - explain
//npm install express-session - explain
//create the .env file

// Load environment variables from .env file into memory
// Allows you to use process.env
require('dotenv').config();

const express = require("express");

//Needed for the session variable - Stored on the server to hold data
const session = require("express-session");

let path = require("path");

let app = express();

// Use EJS for the web pages - requires a views folder and all files are .ejs
app.set("view engine", "ejs");

// process.env.PORT is when you deploy and 3000 is for test
const port = process.env.PORT || 3000;

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

const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.RDS_HOST_NAME || "localhost",
        user : process.env.RDS_USER_NAME || "postgres",
        password : process.env.RDS_PASSWORD || "admin",
        database : process.env.RDS_DB_NAME || "",
        port : process.env.RDS_PORT || 5432
    }
});

// Tells Express how to read form data sent in the body of a request
app.use(express.urlencoded({extended: true}));

// Global authentication middleware - runs on EVERY request
app.use((req, res, next) => {
    // Skip authentication for login routes
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') {
        //continue with the request path
        return next();
    }
    
    // Check if user is logged in for all other routes
    if (req.session.isLoggedIn) {
        //notice no return because nothing below it
        next(); // User is logged in, continue
    } 
    else {
        res.render("login", { error_message: "Please log in to access this page" });
    }
});

// Main page route - notice it checks if they have logged in
app.get("/", (req, res) => {
    // Check if user is logged in
    if (req.session.isLoggedIn) {        
        res.render("index");
    } 
    else {
        res.render("login", { error_message: "" });
    }
});



// This creates attributes in the session object to keep track of user and if they logged in
app.post("/login", (req, res) => {
    let sName = req.body.username;
    let sPassword = req.body.password;

    knex.select("username", "password")
    .from('users')
    .where("username", sName)
    .andWhere("password", sPassword)
    .then(users => {
      // Check if a user was found with matching username AND password
      if (users.length > 0) {
        req.session.isLoggedIn = true;
        req.session.username = sName;
        res.redirect("/");
      } else {
        // No matching user found
        res.render("login", { error_message: "Invalid login" });
      }
    })
    .catch(err => {
      console.error("Login error:", err);
      res.render("login", { error_message: "Invalid login" });
    });

});

// Logout route
app.get("/logout", (req, res) => {
    // Get rid of the session object
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect("/");
    });
});


app.get("/users", (req, res) => {
  // Check if user is logged in
  if (req.session.isLoggedIn) {
    knex.select().from("users")
      .then(users => {
        console.log(`Successfully retrieved ${users.length} users from database`);
        res.render("displayUsers", {users: users});
      })
      .catch((err) => {
        console.error("Database query error:", err.message);
        res.render("displayUsers", {
          users: [],
          error_message: `Database error: ${err.message}. Please check if the 'users' table exists.`
        });
      });
  }
  else {
    res.render("login", { error_message: "" });
  }
});

app.get("/addUser", (req, res) => {
  res.render("addUser");
});

app.post("/addUser", upload.single("profileImage"), (req, res) => {
    // Destructuring grabs them regardless of field order.
    //const username = req.body.username;
    //const password = req.body.password;
    
    const { username, password } = req.body;
    // Basic validation to ensure required fields are present.
    if (!username || !password) {
        return res.status(400).render("addUser", { error_message: "Username and password are required." });
    }
    // Build the relative path to the uploaded file so the
    // browser can load it later.
    // Shape the data to match the users table schema.
    // Object literal - other languages use dictionaries
    // When the object is inserted with Knex, that value profileImagePath,
    // becomes the database column profile_image, so the saved path to
    // the uploaded image ends up in the profile_image column for that user.
    const newUser = {
        username,
        password
    };


    // Insert the record into PostgreSQL and return the user list on success.
    knex("users")
        .insert(newUser)
        .then(() => {
            res.redirect("/users");
        })
        .catch((dbErr) => {
            console.error("Error inserting user:", dbErr.message);
            // Database error, so show the form again with a generic message.
            res.status(500).render("addUser", { error_message: "Unable to save user. Please try again." });
        });
});

app.post("/deleteUser/:id", (req, res) => {
    knex("users").where("id", req.params.id).del().then(users => {
        res.redirect("/users");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

app.get("/editUser/:id", (req, res) => {
    const userId = req.params.id;
    knex("users")
        .where({ id: userId })
        .first()
        .then((user) => {
            if (!user) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    error_message: "User not found."
                });
            }
            res.render("editUser", { user, error_message: "" });
        })
        .catch((err) => {
            console.error("Error fetching user:", err.message);
            res.status(500).render("displayUsers", {
                users: [],
                error_message: "Unable to load user for editing."
            });
        });
});



app.post("/editUser/:id", (req, res) => {
    const userId = req.params.id;
    const { username, password } = req.body;
    if (!username || !password) {
        return knex("users")
            .where({ id: userId })
            .first()
            .then((user) => {
                if (!user) {
                    return res.status(404).render("displayUsers", {
                        users: [],
                        error_message: "User not found."
                    });
                }
                res.status(400).render("editUser", {
                    user,
                    error_message: "Username and password are required."
                });
            })
            .catch((err) => {
                console.error("Error fetching user:", err.message);
                res.status(500).render("displayUsers", {
                    users: [],
                    error_message: "Unable to load user for editing."
                });
            });
    }
    const updatedUser = {
        username,
        password
    };
    knex("users")
        .where({ id: userId })
        .update(updatedUser)
        .then((rowsUpdated) => {
            if (rowsUpdated === 0) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    error_message: "User not found."
                });
            }
            res.redirect("/users");
        })
        .catch((err) => {
            console.error("Error updating user:", err.message);
            knex("users")
                .where({ id: userId })
                .first()
                .then((user) => {
                    if (!user) {
                        return res.status(404).render("displayUsers", {
                            users: [],
                            error_message: "User not found."
                        });
                    }
                    res.status(500).render("editUser", {
                        user,
                        error_message: "Unable to update user. Please try again."
                    });
                })
                .catch((fetchErr) => {
                    console.error("Error fetching user after update failure:", fetchErr.message);
                    res.status(500).render("displayUsers", {
                        users: [],
                        error_message: "Unable to update user."
                    });
                });
        });
});



app.listen(port, () => {
    console.log("The server is listening");
});