const express = require('express');
  const mongoose = require('mongoose');
  const nodemailer = require('nodemailer');
  const multer = require('multer');
  const xlsx = require('xlsx');
  const path = require('path');
  require('dotenv').config();
  const app = express();

  // Middleware
  app.use(express.json());
  app.use('/uploads', express.static('uploads'));
  app.use(express.static(__dirname));

  // MongoDB Connection
  mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://zuhebakhter2o:dhNCWAHnw2MrMMlp@emaildata.cogwbhg.mongodb.net/automailer?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

  // Email Config Schema
  const emailConfigSchema = new mongoose.Schema({
    email: String,
    password: String,
    host: String,
    port: Number,
  });
  const EmailConfig = mongoose.model('EmailConfig', emailConfigSchema);

  // Multer Setup for File Uploads
  const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
  });
  const upload = multer({ storage });

  // Serve Frontend
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // Save or Update Email Configuration
  app.post('/api/email-config', async (req, res) => {
    const { email, password, host, port } = req.body;
    try {
      let config = await EmailConfig.findOne();
      if (config) {
        config.email = email;
        config.password = password;
        config.host = host;
        config.port = port;
        await config.save();
      } else {
        config = new EmailConfig({ email, password, host, port });
        await config.save();
      }
      res.json({ message: 'Email configuration saved' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Email Configuration
  app.get('/api/email-config', async (req, res) => {
    try {
      const config = await EmailConfig.findOne();
      res.json(config || {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send Emails
  app.post('/api/send-emails', upload.fields([{ name: 'excelFile' }, { name: 'pdfFile' }]), async (req, res) => {
    const { subject, body } = req.body;
    const excelFile = req.files['excelFile'] ? req.files['excelFile'][0] : null;
    const pdfFile = req.files['pdfFile'] ? req.files['pdfFile'][0] : null;

    try {
      if (!excelFile) {
        return res.status(400).json({ error: 'Excel file is required' });
      }
      if (!subject || !body) {
        return res.status(400).json({ error: 'Subject and body are required' });
      }

      const workbook = xlsx.readFile(excelFile.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const emails = xlsx.utils.sheet_to_json(sheet).map(row => row.email).filter(email => email);

      if (!emails.length) {
        return res.status(400).json({ error: 'No valid email addresses found in Excel file' });
      }

      const config = await EmailConfig.findOne();
      if (!config) {
        return res.status(400).json({ error: 'Email configuration not set' });
      }

      const transporter = nodemailer.createTransport({
        host: config.host || 'smtp.gmail.com',
        port: config.port || 587,
        secure: false,
        auth: {
          user: config.email,
          pass: config.password,
        },
      });

      const failedEmails = [];
      for (const email of emails) {
        const mailOptions = {
          from: config.email,
          to: email,
          subject,
          text: body,
          attachments: pdfFile ? [{ path: pdfFile.path, filename: pdfFile.originalname }] : [],
        };
        try {
          await transporter.sendMail(mailOptions);
        } catch (err) {
          failedEmails.push({ email, error: err.message });
        }
      }

      if (failedEmails.length) {
        res.status(207).json({ 
          message: `Emails sent to ${emails.length - failedEmails.length} recipients, ${failedEmails.length} failed`,
          failed: failedEmails 
        });
      } else {
        res.json({ message: 'Emails sent successfully to all recipients' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));