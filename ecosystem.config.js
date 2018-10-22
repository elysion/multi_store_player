'use strict'

module.exports = {
  apps: [
    {
      name: 'backend (4000)',
      script: 'npm',
      args: ['start'],
      cwd: `${__dirname}/back`,
      log_file: 'backend.log',
      pid_file: '.backend.pm2.pid',
      combine_logs: true,
      restart_delay: 4000,
      wait_ready: true,
      watch: true,
      env: {
        PORT: 5001
      }
    },
    {
      name: 'frontend (4001)',
      script: 'npm run start:prod',
      cwd: `${__dirname}/front`,
      log_file: 'frontend.log',
      pid_file: '.frontend.pm2.pid',
      combine_logs: true,
      restart_delay: 4000,
      wait_ready: true,
      watch: false
    }
  ]
}
