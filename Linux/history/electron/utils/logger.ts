import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const logDir = path.join(app.getPath('userData'), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

const logFile = path.join(logDir, 'devpulse.log')

function writeLog(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`
  fs.appendFileSync(logFile, line)
  if (process.env.NODE_ENV === 'development') {
    console.log(line.trim())
  }
}

export const logger = {
  info: (msg: string, data?: any) => writeLog('INFO', msg, data),
  warn: (msg: string, data?: any) => writeLog('WARN', msg, data),
  error: (msg: string, data?: any) => writeLog('ERROR', msg, data),
  debug: (msg: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') writeLog('DEBUG', msg, data)
  }
}
