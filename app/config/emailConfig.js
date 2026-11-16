require('dotenv').config()
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    // secure: true,// SSL for 465
    secure: false,// Port 587 (or commonly 2525): use secure: false so Nodemailer can use STARTTLS.
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    },
    family: 4 //for render deploying 
});

module.exports = transporter;
