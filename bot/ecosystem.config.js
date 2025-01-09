const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
    apps: [{
      name: 'Agency Atlas Bot',
      script: './src/bot.js',
      watch: false,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        BOT_TOKEN: process.env.BOT_TOKEN,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_KEY: process.env.SUPABASE_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GROQ_API_KEY: process.env.GROQ_API_KEY
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    }]
  };