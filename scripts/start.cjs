/**
 * MCP-safe start script.
 *
 * Runs `npm install` and `npm run build` with stdout suppressed so that
 * their output does not pollute the MCP stdio transport. Only the final
 * server process inherits stdio, which is what the MCP client expects.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    // Pipe stderr to the parent process's stderr if available.
    if (child.stderr) {
      child.stderr.pipe(process.stderr);
    }

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command failed with code ${code}: ${command} ${args.join(' ')}`,
          ),
        );
      } else {
        resolve();
      }
    });
    child.on('error', (err) => {
      reject(err);
    });
  });
}

const SERVER_PATH = path.join(__dirname, '..', 'dist', 'index.js');

async function main() {
  try {
    // Install deps — stdout suppressed, stderr piped for visibility.
    await runCommand('npm', ['install'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    // Build — stdout suppressed, stderr piped for visibility.
    await runCommand('npm', ['run', 'build'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    // Run the server — full stdio inherited for MCP communication.
    await runCommand('node', [SERVER_PATH], {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
